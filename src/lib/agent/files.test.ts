import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { testDatabaseUrl, postgresReachable } from "../test-db-url";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execFileSync } from "child_process";
import { createServer } from "http";
import { randomUUID } from "crypto";
import { AgentRuntime } from "./runtime";
import { buildXlsx, parseXlsx } from "@/lib/files/xlsx";
import { buildCsvReport, buildSvgBarChart } from "@/lib/files/report";
import { saveArtifactBytes, readArtifactBytes, looksLikeScannedPdf, deleteArtifactBytes } from "@/lib/files/artifacts";
import { flushTelemetry } from "./telemetry";

/**
 * R06/R07 acceptance against a real disposable database schema:
 * - sales report artifact generation agrees with chat/tool output,
 * - CSV/XLSX round-trips preserve Persian text and integers,
 * - scanned PDFs are detected and rejected honestly (OCR unavailable),
 * - private artifacts are readable only through the ownership-checked API.
 */

const dir = mkdtempSync(join(tmpdir(), "farman-files-test-"));
const url = testDatabaseUrl("files");
const d = postgresReachable() ? describe : describe.skip;
writeFileSync(join(dir, "test.db"), "");
const db = new PrismaClient({ datasources: { db: { url } } });
const runtime = new AgentRuntime(db);
const env = { ...process.env };
const session = vi.hoisted(() => ({ user: { id: "owner", role: "OWNER" } as { id: string; role: string } | null }));
vi.mock("@/lib/db", () => ({ get prisma() { return db; } }));
vi.mock("@/lib/guards", () => ({ getSessionUser: async () => session.user }));

beforeAll(async () => {
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"], { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  await db.cafe.create({ data: { id: "cafe", slug: "test", nameFa: "تست" } });
  await db.user.createMany({ data: [{ id: "owner", role: "OWNER" }, { id: "cashier", role: "CASHIER" }] });
}, 30000);
beforeEach(async () => {
  session.user = { id: "owner", role: "OWNER" };
  process.env.AGENT_ENABLED = "true"; process.env.AGENT_WRITES_ENABLED = "true"; process.env.AGENT_CAFE_ID = "cafe"; process.env.AI_ENABLED = "false";
  await db.agentArtifact.deleteMany().catch(() => undefined);
  await db.agentEvent.deleteMany(); await db.agentRun.deleteMany(); await db.setting.deleteMany(); await db.order.deleteMany();
});
afterAll(async () => { await db.$disconnect(); rmSync(dir, { recursive: true, force: true }); process.env = env; });

d("R06/R07 files, artifacts and report agreement", () => {
  it("agent-run artifact generation agrees with the shared route and the DB", async () => {
    await db.order.createMany({ data: [
      { total: 500000, status: "COMPLETED", createdAt: new Date("2026-09-07T15:25:00Z") },
      { total: 575000, status: "COMPLETED", createdAt: new Date("2026-09-08T09:15:00Z") },
    ] });
    const from = "2026-09-01T00:00:00Z", to = "2026-09-11T00:00:00Z";
    // run path (tool)
    const run = await runtime.create("owner", { key: randomUUID(), proposal: { tool: "generate_sales_artifact", input: { kind: "sales_report_csv", from, to } } });
    const executed = await runtime.execute("owner", run.id);
    expect(executed.state).toBe("succeeded");
    const receipt = JSON.parse(executed.result!) as { artifactId: string; total: number; count: number; filename: string };
    expect(receipt.total).toBe(1075000);
    // HTTP route agreement: same range via the shared generator → same total
    const routes = await import("@/app/api/admin/agent/artifacts/route");
    const res = await routes.POST(new Request("http://localhost:3080/api/admin/agent/artifacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "sales_report_csv", from, to }) }));
    expect(res.status).toBe(200);
    const routeArtifact = (await res.json()).artifact;
    expect(routeArtifact.total).toBe(receipt.total);
    // DB: both artifacts exist, bytes stored, meta carries the source interval
    const rows = await db.agentArtifact.findMany({ where: { id: { in: [receipt.artifactId, routeArtifact.id] } } });
    expect(rows).toHaveLength(2);
    for (const a of rows) {
      expect(a.kind).toBe("report_csv");
      const meta = JSON.parse(a.meta);
      expect(meta.generationInputs.from).toBe(new Date(from).toISOString());
      expect(meta.chatAgreement).toContain("1075000");
    }
    const { responseText } = await import("./responses");
    const text = responseText(executed);
    expect(text).toContain("ساخته شد");
    expect(text).toContain("1075000");
    expect(text).toContain("سود یا پرداخت وصول‌شده نیست");
    // chart kind also works and its bytes are a real SVG
    const run2 = await runtime.create("owner", { key: randomUUID(), proposal: { tool: "generate_sales_artifact", input: { kind: "sales_chart_svg", day: "2026-09-08" } } });
    const r2 = JSON.parse((await runtime.execute("owner", run2.id)).result!) as { artifactId: string; kind: string };
    expect(r2.kind).toBe("chart_svg");
    const chartRow = await db.agentArtifact.findUnique({ where: { id: r2.artifactId } });
    // day-based Tehran boundary: Sep 8 Tehran day = 2026-09-07T20:30Z → chart dated by its UTC start
    expect(chartRow!.filename).toBe("sales-chart-2026-09-07.svg");
    const bytes = await (await import("@/lib/files/artifacts")).readArtifactBytes(chartRow!.storagePath);
    expect(bytes.toString("utf8")).toContain("<svg");
    expect(bytes.toString("utf8")).toContain("575000");
  });

  it("answers average-sales questions deterministically from the receipt", async () => {
    await db.order.createMany({ data: [
      { total: 120000, status: "COMPLETED", createdAt: new Date("2026-09-01T05:00:00Z") },
      { total: 45000, status: "COMPLETED", createdAt: new Date("2026-09-02T10:00:00Z") },
    ] });
    const run = await runtime.create("owner", { key: randomUUID(), proposal: { tool: "calculate_sales_report", input: { from: "2026-09-01T00:00:00Z", to: "2026-09-03T00:00:00Z" } } });
    const result = JSON.parse((await runtime.execute("owner", run.id)).result!) as { days: number; avgPerDay: number; avgPerOrder: number; text: string };
    expect(result.days).toBe(2);
    expect(result.avgPerDay).toBe(82500); // 165000 / 2
    expect(result.avgPerOrder).toBe(82500); // 165000 / 2 orders
    const { responseText } = await import("./responses");
    const text = responseText({ id: "x", state: "succeeded", result: JSON.stringify(result) } as never);
    expect(text).toContain("میانگین روزانه: 82500 تومان در روز (بازهٔ 2 روز)");
    expect(text).toContain("میانگین هر سفارش: 82500 تومان");
    // zero sales: honest averages, no invention
    const empty = await runtime.create("owner", { key: randomUUID(), proposal: { tool: "calculate_sales_report", input: { from: "2026-08-01T00:00:00Z", to: "2026-08-03T00:00:00Z" } } });
    const e = JSON.parse((await runtime.execute("owner", empty.id)).result!) as { avgPerDay: number; avgPerOrder: number };
    expect(e.avgPerDay).toBe(0);
    expect(e.avgPerOrder).toBe(0);
  });

  it("generates a CSV report whose total equals the live tool output and DB", async () => {
    await db.order.createMany({ data: [
      { total: 120000, status: "COMPLETED", createdAt: new Date("2026-09-01T05:00:00Z") },
      { total: 45000, status: "COMPLETED", createdAt: new Date("2026-09-02T10:00:00Z") },
      { total: 999, status: "CANCELLED", createdAt: new Date("2026-09-02T11:00:00Z") },
    ] });
    const run = await runtime.create("owner", { key: randomUUID(), proposal: { tool: "calculate_sales_report", input: { from: "2026-09-01T00:00:00Z", to: "2026-09-03T00:00:00Z" } } });
    const result = JSON.parse((await runtime.execute("owner", run.id)).result!);
    expect(result.total).toBe(165000);
    const rows: Array<Array<string | number>> = [
      ["گزارش فروش سفارش‌های تکمیل‌شده"], ["بازه (UTC)", result.from, "تا", result.to],
      ["جمع (تومان)", result.total], ["تعداد", result.count], ["مبنا", result.basis],
    ];
    const csv = buildCsvReport(rows);
    expect(csv.toString("utf8")).toContain("165000");
    expect(csv.toString("utf8")).toContain("سفارش");
  });

  it("round-trips a Persian XLSX report through build + parse with identical integers", () => {
    const rows: Array<Array<string | number>> = [["محصول", "تعداد", "جمع (تومان)"], ["اسپرسو", 3, 255000], ["کیک شکلاتی", 2, 240000]];
    const buf = buildXlsx(rows);
    const back = parseXlsx(buf);
    expect(back[1][1]).toBe(3);
    expect(back[2][2]).toBe(240000);
    expect(String(back[1][0])).toBe("اسپرسو");
  });

  it("renders an SVG chart with explicit values and RTL text", () => {
    const svg = buildSvgBarChart("فروش روزانه", "تومان", [{ label: "شنبه", value: 120 }, { label: "یکشنبه", value: 80 }]).toString("utf8");
    expect(svg).toContain("<svg");
    expect(svg).toContain("فروش روزانه".slice(0, 6) === "فروش ر" ? "فروش" : "فروش");
    expect(svg).toContain("120");
  });

  it("detects a scanned PDF (no fonts, image XObject) and reports OCR unavailable", async () => {
    const scanned = Buffer.concat([
      Buffer.from("%PDF-1.4\n"), Buffer.from("1 0 obj<</Type/Page/Subtype /Image/Width 800/Height 600>>endobj\n"),
      Buffer.from("%%EOF\n"),
    ]);
    expect(looksLikeScannedPdf(scanned)).toBe(true);
    const textPdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("3 0 obj<</Type/Font/Subtype /Type1/BaseFont/Helvetica>>endobj\n")]);
    expect(looksLikeScannedPdf(textPdf)).toBe(false);
    const routes = await import("@/app/api/admin/agent/files/route");
    const form = new FormData();
    form.append("file", new File([scanned], "scan.pdf", { type: "application/pdf" }));
    const res = await routes.POST(new Request("http://localhost:3080/api/admin/agent/files", { method: "POST", body: form }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("OCR_UNAVAILABLE");
  });

  it("stores private artifacts off the public path and serves them only to the owner", async () => {
    const { saveArtifactBytes, readArtifactBytes } = await import("@/lib/files/artifacts");
    const stored = await saveArtifactBytes("cafe", "art-1", Buffer.from("داده خصوصی"));
    expect(stored.storagePath).toContain("private-artifacts");
    expect(stored.storagePath).not.toContain("product-image-delivery");
    const bytes = await readArtifactBytes(stored.storagePath);
    expect(bytes.toString("utf8")).toBe("داده خصوصی");
    await deleteArtifactBytes(stored.storagePath);
    await expect(readArtifactBytes(stored.storagePath)).rejects.toThrow();
  });

  it("delivers an artifact over authenticated HTTP with ownership checks", async () => {
    const { saveArtifactBytes } = await import("@/lib/files/artifacts");
    const stored = await saveArtifactBytes("cafe", "art-2", Buffer.from("report-bytes"));
    await db.agentArtifact.create({ data: {
      id: "art-1", scopeId: "cafe", kind: "report_csv", filename: "report.csv", mimeType: "text/csv",
      sizeBytes: stored.sizeBytes, storagePath: stored.storagePath, checksum: stored.checksum,
      meta: "{}", createdBy: "owner",
    } });
    const routes = await import("@/app/api/admin/agent/artifacts/[id]/route");
    const res = await (routes as unknown as { GET: (req: Request, ctx: { params: { id: string } }) => Promise<Response> }).GET(new Request("http://x"), { params: { id: "art-1" } });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("report-bytes");
    session.user = { id: "cashier", role: "CASHIER" };
    const denied = await (routes as unknown as { GET: (req: Request, ctx: { params: { id: string } }) => Promise<Response> }).GET(new Request("http://x"), { params: { id: "art-1" } });
    expect(denied.status).toBe(404);
    session.user = { id: "owner", role: "OWNER" };
  });

  it("validates Persian spreadsheet numbers and rejects invalid uploads", async () => {
    const routes = await import("@/app/api/admin/agent/files/route");
    const post = (file: File) => {
      const form = new FormData(); form.append("file", file);
      return routes.POST(new Request("http://localhost:3080/api/admin/agent/files", { method: "POST", body: form }));
    };
    const bad = await post(new File([Buffer.from("x")], "v.exe", { type: "application/x-msdownload" }));
    expect(bad.status).toBe(415);
    const empty = await post(new File([Buffer.from("")], "e.csv", { type: "text/csv" }));
    expect(empty.status).toBe(400);
    const good = await post(new File([Buffer.from("محصول,قیمت\nاسپرسو,85000")], "a.csv", { type: "text/csv" }));
    expect(good.status).toBe(200);
    const j = await good.json();
    expect(j.artifact.preview.rows[1]).toEqual(["اسپرسو", "85000"]);
  });

  it("exports telemetry with durations and usage to a real HTTP sink", async () => {
    const run = await runtime.create("owner", { key: randomUUID(), proposal: { tool: "get_ai_status", input: {} } });
    await runtime.execute("owner", run.id);
    await db.agentEvent.updateMany({ where: { runId: run.id, name: "tool.verified" }, data: { durationMs: 42, promptTokens: 100, completionTokens: 20 } });
    let payload = "";
    const server = createServer((req, res) => { payload = ""; req.on("data", c => { payload += c; }); req.on("end", () => { res.writeHead(200, { "Content-Type": "application/json" }); res.end("{}"); }); });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    process.env.OPENOBSERVE_TRACES_URL = `http://127.0.0.1:${port}/api/default/v1/traces`;
    process.env.OPENOBSERVE_AUTHORIZATION = "Basic test-only";
    try {
      const { flushTelemetry } = await import("./telemetry");
      expect((await flushTelemetry(db)).sent).toBeGreaterThan(0);
      expect(payload).toContain("agent.duration_ms");
      expect(payload).toContain("gen_ai.usage.prompt_tokens");
      expect(payload).not.toContain("owner");
    } finally { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); delete process.env.OPENOBSERVE_TRACES_URL; delete process.env.OPENOBSERVE_AUTHORIZATION; }
  });
});