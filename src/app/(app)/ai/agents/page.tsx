import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardHeader, PageHeader, Badge, SectionTitle } from "@/components/ui";
import { Cpu, Activity as ActIcon, ShieldCheck, Bot, Network } from "lucide-react";

export const dynamic = "force-dynamic";

const agentIcon: Record<string, React.ReactNode> = {
  orchestrator: <Network className="h-4 w-4" />,
  procurement: <ActIcon className="h-4 w-4" />,
  finance_cfo: <Bot className="h-4 w-4" />,
  business: <Cpu className="h-4 w-4" />,
};

export default async function AgentsPage() {
  const session = await requireSession();
  const [agents, tasks] = await Promise.all([
    db.agent.findMany({ orderBy: { key: "asc" } }),
    db.agentTask.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
  ]);

  return (
    <div>
      <PageHeader
        title="AI Agents"
        description="FARMAN's specialized agents under one orchestrator. Each agent is a modular service over the business knowledge graph."
      />

      {/* Architecture strip */}
      <Card className="mb-5">
        <div className="p-5 flex flex-col md:flex-row items-center gap-4 md:gap-0 justify-between text-center">
          <div className="rounded-xl border border-accent/40 bg-accent-soft px-5 py-3 min-w-[150px]">
            <Network className="h-5 w-5 mx-auto text-accent mb-1.5" />
            <p className="text-[13px] font-semibold">AI Orchestrator</p>
            <p className="text-[10.5px] text-ink-dim mt-0.5">Routes intents · enforces policy</p>
          </div>
          <div className="hidden md:block h-px w-10 bg-line-strong" />
          <div className="grid grid-cols-3 gap-3 flex-1 max-w-[560px]">
            {agents.filter((a) => a.key !== "orchestrator").map((a) => (
              <div key={a.id} className="rounded-xl border border-line bg-raised px-3 py-3">
                <span className={`mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-lg border ${
                  a.status === "working" ? "border-accent/40 bg-accent-soft text-accent" : a.status === "waiting" ? "border-warn/40 bg-warn/10 text-warn" : "border-line text-ink-faint"
                }`}>
                  {agentIcon[a.key] ?? <Cpu className="h-4 w-4" />}
                </span>
                <p className="text-xs font-medium">{a.name}</p>
                <Badge tone={a.status === "working" ? "accent" : a.status === "waiting" ? "warn" : a.status === "error" ? "bad" : "neutral"} className="mt-1.5">
                  {a.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-line px-5 py-2.5 flex items-center justify-center gap-2 text-[11px] text-ink-faint">
          All agents operate on the shared Business Knowledge Graph (company · suppliers · products · orders · transactions)
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-5">
        {agents.map((a) => (
          <Card key={a.id}>
            <CardHeader
              title={a.name}
              subtitle={a.role}
              action={<Badge tone={a.status === "working" ? "accent" : a.status === "waiting" ? "warn" : a.status === "error" ? "bad" : "neutral"}>{a.status}</Badge>}
            />
            <div className="p-5 pt-4">
              <p className="text-[13px] leading-relaxed text-ink-dim">{a.description}</p>
              {a.currentTask && (
                <div className="mt-3 rounded-lg border border-accent/25 bg-accent-soft px-3.5 py-2.5">
                  <p className="flex items-center gap-2 text-xs text-accent"><span className="h-1.5 w-1.5 rounded-full bg-accent pulse-dot" />{a.currentTask}</p>
                </div>
              )}
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div><SectionTitle>Health</SectionTitle><p className="num">{Math.round(a.healthScore)}%</p></div>
                <div><SectionTitle>Tasks run</SectionTitle><p className="num">{a.tasksRun}</p></div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-5">
        <CardHeader title="Agent Task Queue" subtitle="Recent and in-flight work items" />
        {tasks.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-faint">Queue is empty.</p>
        ) : (
          <ul className="divide-y divide-line">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                <ShieldCheck className={`h-3.5 w-3.5 shrink-0 ${t.status === "done" ? "text-good" : t.status === "waiting" ? "text-warn" : "text-info"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-ink truncate">{t.title}</p>
                  {t.detail && <p className="text-[11px] text-ink-faint truncate mt-0.5">{t.detail}</p>}
                </div>
                <Badge tone={t.status === "done" ? "good" : t.status === "waiting" ? "warn" : "info"}>{t.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
