"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleBusinessTaskAction } from "@/server/actions/business";
import { Check, Loader2 } from "lucide-react";

type Task = { id: string; title: string; detail: string | null; phase: string; done: boolean };

const PHASES = [
  { key: "research", label: "Phase 1 — Research & Sourcing" },
  { key: "setup", label: "Phase 2 — Setup" },
  { key: "launch", label: "Phase 3 — Launch" },
  { key: "operate", label: "Phase 4 — Operate" },
];

export function BusinessTaskList({ tasks }: { tasks: Task[] }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggle(id: string, done: boolean) {
    startTransition(async () => {
      await toggleBusinessTaskAction(id, done);
      router.refresh();
    });
  }

  const grouped = PHASES.map((p) => ({ ...p, items: tasks.filter((t) => t.phase === p.key) })).filter((g) => g.items.length > 0);
  const doneCount = tasks.filter((t) => t.done).length;

  return (
    <div className="p-5 pt-3">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-1.5 flex-1 rounded-full bg-raised overflow-hidden">
          <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${tasks.length ? (doneCount / tasks.length) * 100 : 0}%` }} />
        </div>
        <span className="num text-xs text-ink-dim shrink-0">{doneCount}/{tasks.length}</span>
      </div>

      <div className="space-y-5">
        {grouped.map((group) => (
          <div key={group.key}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint mb-2">{group.label}</p>
            <ul className="space-y-1">
              {group.items.map((t, i) => (
                <li key={t.id}>
                  <button
                    onClick={() => toggle(t.id, !t.done)}
                    disabled={pending}
                    className={`w-full text-left flex items-start gap-3 rounded-lg border px-3.5 py-3 transition-colors ${
                      t.done ? "border-line/60 bg-raised/40 opacity-60" : "border-line bg-bg hover:border-accent/40"
                    }`}
                  >
                    <span className={`mt-0.5 h-[18px] w-[18px] shrink-0 rounded-md border flex items-center justify-center transition-colors ${
                      t.done ? "bg-accent border-accent text-[#04211d]" : "border-line-strong"
                    }`}>
                      {t.done && (pending ? <Loader2 className="h-3 w-3 spin" /> : <Check className="h-3 w-3" strokeWidth={3} />)}
                    </span>
                    <span>
                      <span className={`text-[13px] font-medium ${t.done ? "line-through text-ink-faint" : "text-ink"}`}>
                        {group.items.indexOf(t) + 1}. {t.title}
                      </span>
                      {t.detail && <span className="block mt-0.5 text-xs text-ink-faint">{t.detail}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
