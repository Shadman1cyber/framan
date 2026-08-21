import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getFinanceSnapshot, affordabilityCheck, expenseAnalysis, cashflowAnswer } from "@/lib/agents/finance/analytics";
import { CfoConsole } from "@/components/cfo-console";
import { PageHeader } from "@/components/ui";
import { formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

// Pre-computed briefings rendered server-side; the console below answers
// follow-up questions through the same analytics pipeline.
export default async function CfoPage() {
  const session = await requireSession();
  const companyId = session.companyId;

  const snap = await getFinanceSnapshot(companyId);
  const pending = await db.approval.findFirst({
    where: { companyId, status: "pending" },
    include: { request: true },
    orderBy: { createdAt: "desc" },
  });
  const pendingAmount = Number((pending?.request?.recommendation as { totalPrice?: number } | null)?.totalPrice ?? 0);

  const [afford, overspend, cash] = await Promise.all([
    pendingAmount > 0 ? affordabilityCheck(companyId, pendingAmount) : Promise.resolve(null),
    expenseAnalysis(companyId),
    cashflowAnswer(companyId),
  ]);

  return (
    <div>
      <PageHeader
        title="AI CFO"
        description="Financial intelligence grounded in your live ledger — not a chatbot. Every answer is computed from the business knowledge graph."
      />

      <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
        {/* Briefings */}
        <div className="space-y-5">
          <Briefing
            agent="AI CFO"
            title={cash.title}
            answer={cash.answer}
            bullets={cash.bullets}
            metrics={cash.metrics}
          />
          {afford && (
            <Briefing
              agent="AI CFO"
              title={afford.title}
              answer={afford.answer}
              bullets={afford.bullets}
              metrics={afford.metrics}
            />
          )}
        </div>

        {/* Interactive console */}
        <CfoConsole />
      </div>
    </div>
  );
}

function Briefing({
  agent,
  title,
  answer,
  bullets,
  metrics,
}: {
  agent: string;
  title: string;
  answer: string;
  bullets: string[];
  metrics?: { label: string; value: string; tone?: string }[];
}) {
  return (
    <div className="rounded-xl border border-line bg-surface overflow-hidden rise">
      <div className="flex items-center gap-2 px-5 pt-4">
        <span className="rounded-md bg-accent-soft border border-accent/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">{agent}</span>
        <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
      </div>
      <p className="px-5 py-3 text-[13px] leading-relaxed text-ink-dim">{answer}</p>
      {metrics && metrics.length > 0 && (
        <div className="px-5 pb-1 grid grid-cols-3 gap-2">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-lg border border-line bg-bg px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-ink-faint">{m.label}</p>
              <p className={`num mt-0.5 text-sm font-semibold ${m.tone === "good" ? "text-good" : m.tone === "bad" ? "text-bad" : m.tone === "warn" ? "text-warn" : "text-ink"}`}>
                {m.value}
              </p>
            </div>
          ))}
        </div>
      )}
      <ul className="px-5 py-4 space-y-1.5 border-t border-line/60 mt-3">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2 text-[12.5px] text-ink-dim"><span className="text-accent mt-0.5">·</span>{b}</li>
        ))}
      </ul>
    </div>
  );
}
