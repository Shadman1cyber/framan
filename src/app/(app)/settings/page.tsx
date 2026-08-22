import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardHeader, PageHeader, Badge, SectionTitle } from "@/components/ui";
import { POLICY } from "@/lib/domain";
import { formatMoney } from "@/lib/format";
import { getDict, type Locale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireSession();
  const company = await db.company.findUniqueOrThrow({ where: { id: session.companyId } });
  const users = await db.user.findMany({ where: { companyId: session.companyId } });

  return (
    <div className="max-w-[760px]">
      <PageHeader title="Settings" description="Workspace configuration and FARMAN autonomy policy." />

      <div className="space-y-5">
        <Card>
          <CardHeader title="Company" />
          <div className="p-5 grid sm:grid-cols-2 gap-y-3 text-sm">
            <div><p className="text-xs text-ink-faint">Name</p><p>{company.name}</p></div>
            <div><p className="text-xs text-ink-faint">Industry</p><p>{company.industry}</p></div>
            <div><p className="text-xs text-ink-faint">Country</p><p>{company.country}</p></div>
            <div><p className="text-xs text-ink-faint">Currency</p><p className="num">{company.currency}</p></div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Team" action={<Badge>{users.length} members</Badge>} />
          <ul className="divide-y divide-line">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div className="flex items-center gap-3">
                  <span className="h-8 w-8 rounded-full bg-accent-soft border border-accent/30 text-accent text-[11px] font-semibold flex items-center justify-center">
                    {u.name.split(" ").map((p) => p[0]).join("")}
                  </span>
                  <div>
                    <p>{u.name}{u.id === session.id && <span className="text-ink-faint text-xs ml-1.5">(you)</span>}</p>
                    <p className="text-xs text-ink-faint">{u.email}</p>
                  </div>
                </div>
                <Badge tone={u.role === "owner" ? "accent" : "neutral"}>{u.role}</Badge>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Autonomy Policy" subtitle="Where FARMAN acts alone — and where it must ask you" />
          <ul className="divide-y divide-line text-sm">
            <li className="flex items-center justify-between px-5 py-3">
              <span>Autonomous execution below</span>
              <span className="num font-medium">{formatMoney(POLICY.autoApproveLimit)}</span>
            </li>
            <li className="flex items-center justify-between px-5 py-3">
              <span>New suppliers require approval</span>
              <Badge tone={POLICY.newSupplierRequiresApproval ? "good" : "warn"}>{POLICY.newSupplierRequiresApproval ? "enabled" : "disabled"}</Badge>
            </li>
            <li className="flex items-center justify-between px-5 py-3">
              <span>Risk approval threshold (reliability)</span>
              <span className="num font-medium">&lt; {POLICY.highRiskReliabilityBelow}%</span>
            </li>
            <li className="flex items-center justify-between px-5 py-3">
              <span>Unusual price deviation flag</span>
              <span className="num font-medium">{POLICY.unusualPriceDeviationPct}% vs market</span>
            </li>
            <li className="flex items-center justify-between px-5 py-3">
              <span>Cash safety buffer</span>
              <span className="num font-medium">{POLICY.cashBufferMonths * 100}% of monthly opex</span>
            </li>
          </ul>
        </Card>

        <Card>
          <CardHeader title="AI Provider" subtitle="Pluggable reasoning layer" />
          <div className="p-5 pt-4 space-y-3">
            <div className={`rounded-lg border px-4 py-3 flex items-center justify-between ${process.env.FARMAN_AI_PROVIDER === "nim" ? "border-accent/30 bg-accent-soft" : "border-accent/30 bg-accent-soft"}`}>
              <div>
                <p className="text-[13px] font-medium text-ink">
                  {process.env.FARMAN_AI_PROVIDER === "nim"
                    ? `NVIDIA NIM — ${process.env.FARMAN_NIM_MODEL ?? "auto-discover newest GLM"}`
                    : "Mock Provider (deterministic)"}
                </p>
                <p className="text-xs text-ink-dim mt-0.5">
                  {process.env.FARMAN_AI_PROVIDER === "nim"
                    ? "GLM reasoning via integrate.api.nvidia.com; falls back to the deterministic engine per-call if unreachable."
                    : "Rule-based reasoning over the knowledge graph — no external API required."}
                </p>
              </div>
              <Badge tone="accent">active</Badge>
            </div>
            <SectionTitle>Available adapters</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {["mock", "nim (nvidia)", "openai", "anthropic", "deepseek", "local llm"].map((p) => (
                <Badge key={p}>{p}</Badge>
              ))}
            </div>
            <p className="text-xs text-ink-faint leading-relaxed">
              Set <code className="font-mono text-ink-dim">FARMAN_AI_PROVIDER</code> to switch. Implement the{" "}
              <code className="font-mono text-ink-dim">AIProvider</code> interface in{" "}
              <code className="font-mono text-ink-dim">src/lib/agents/ai/provider.ts</code> — no call-site changes needed.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Internationalization" subtitle="English · فارسی" />
          <div className="p-5 pt-4">
            <p className="text-[13px] text-ink-dim leading-relaxed">
              The UI shell routes strings through an i18n dictionary with English and Persian locales
              (<span className="font-mono text-xs">src/lib/i18n</span>). The prototype renders in English;
              Persian is wired into the dictionary and RTL-ready via document direction.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
