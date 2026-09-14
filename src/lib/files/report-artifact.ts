import type { Prisma, PrismaClient } from "@prisma/client";
import { tehranDayToUtcRange, completedSalesSummary, summaryToFaText } from "@/lib/reporting";
import { buildCsvReport, buildXlsxReport, buildSvgBarChart } from "@/lib/files/report";
import { saveArtifactBytes, newArtifactId, artifactExists } from "@/lib/files/artifacts";
import { AgentError } from "@/lib/agent/contracts";

/**
 * One shared, source-backed sales artifact generator (R06/R07) used by BOTH
 * the admin HTTP route and the agent run path, so chat answers, generated
 * files and the UI can never disagree. The report is computed
 * deterministically from the live source; bytes + source interval are
 * recorded in meta. Generated PDF is intentionally unavailable (Persian RTL
 * PDF needs font embedding); CSV/XLSX/SVG cover the deliverables.
 */

type DbClient = PrismaClient | Prisma.TransactionClient;

export const SALES_ARTIFACT_KINDS = ["sales_report_csv", "sales_report_xlsx", "sales_chart_svg"] as const;
export type SalesArtifactKind = (typeof SALES_ARTIFACT_KINDS)[number];

export type GeneratedSalesArtifact = {
  artifactId: string; kind: string; filename: string; mimeType: string; sizeBytes: number; checksum: string;
  total: number; count: number; from: string; to: string; basis: string; text: string; storagePath: string;
};

export async function generateSalesArtifact(
  db: DbClient,
  ctx: { scopeId: string; userId: string; sessionId?: string | null; runId?: string | null },
  input: { kind: SalesArtifactKind; day?: string; from?: string; to?: string },
): Promise<{ summary: Awaited<ReturnType<typeof completedSalesSummary>>; artifact: { artifactId: string; kind: string; filename: string; mimeType: string; sizeBytes: number; checksum: string; total: number; count: number } }> {
  let from: Date, to: Date;
  if (input.day) {
    try { const r = tehranDayToUtcRange(input.day); from = r.from; to = r.to; }
    catch { throw new AgentError("INVALID_INPUT", 400); }
  } else if (input.from && input.to) {
    from = new Date(input.from); to = new Date(input.to);
  } else throw new AgentError("INVALID_INPUT", 400);

  const summary = await completedSalesSummary(from, to, 10, db).catch(e => {
    if (e instanceof Error && ["UNSAFE_MONEY_VALUE", "INVALID_INTERVAL"].includes(e.message)) throw new AgentError(e.message, 409, "execution");
    throw e;
  });
  const header: Array<Array<string | number>> = [
    ["گزارش فروش سفارش‌های تکمیل‌شده — فرمان کافه"],
    ["بازه (UTC، انتهای بازه مستثنا)", summary.from, summary.to],
    ["جمع (تومان)", summary.total], ["تعداد سفارش", summary.count],
    ["میانگین روزانه (تومان)", summary.avgPerDay, `${summary.days} روز`],
    ["میانگین هر سفارش (تومان)", summary.avgPerOrder],
    ["مبنا", summary.basis], [], ["دسته‌بندی", "جمع (تومان)", "تعداد قلم"],
    ...summary.byCategory.map(c => [c.category, c.total, c.quantity]),
    [], ["محصول", "تعداد", "جمع (تومان)"],
    ...summary.byProduct.map(p => [p.product, p.quantity, p.total]),
    [], ["منبع‌ها", summary.sources.join(" | ")],
  ];
  let buf: Buffer; let mime: string; let filename: string; let kind: string;
  if (input.kind === "sales_report_csv") {
    buf = buildCsvReport(header); mime = "text/csv"; filename = `sales-report-${summary.from.slice(0, 10)}.csv`; kind = "report_csv";
  } else if (input.kind === "sales_report_xlsx") {
    buf = buildXlsxReport(header); mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"; filename = `sales-report-${summary.from.slice(0, 10)}.xlsx`; kind = "report_xlsx";
  } else {
    buf = buildSvgBarChart(`فروش سفارش‌های تکمیل‌شده — ${summary.from.slice(0, 10)}`, "تومان", summary.byDay.map(d => ({ label: d.date.slice(5), value: d.total })));
    mime = "image/svg+xml"; filename = `sales-chart-${summary.from.slice(0, 10)}.svg`; kind = "chart_svg";
  }
  const id = newArtifactId();
  const stored = await saveArtifactBytes(ctx.scopeId, id, buf);
  const artifact = await db.agentArtifact.create({
    data: {
      id, scopeId: ctx.scopeId, kind, filename, mimeType: mime, sizeBytes: stored.sizeBytes,
      storagePath: stored.storagePath, checksum: stored.checksum,
      meta: JSON.stringify({
        title: "گزارش فروش سفارش‌های تکمیل‌شده",
        sources: summary.sources, generationInputs: { from: summary.from, to: summary.to, basis: summary.basis },
        chatAgreement: summaryToFaText(summary).slice(0, 400),
      }),
      createdBy: ctx.userId,
      ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
      ...(ctx.runId ? { runId: ctx.runId } : {}),
    },
  });
  if (!await artifactExists(stored.storagePath)) throw new AgentError("ARTIFACT_WRITE_FAILED", 500);
  return {
    summary,
    artifact: { artifactId: id, kind, filename, mimeType: mime, sizeBytes: stored.sizeBytes, checksum: stored.checksum, total: summary.total, count: summary.count },
  };
}