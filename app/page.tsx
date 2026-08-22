"use client";

import { useState } from "react";
import { ArrowRight, CircleDollarSign, X } from "lucide-react";
import Link from "next/link";
import { useDemo } from "@/lib/store";
import {
  completedToday,
  needsYou,
  runningItems,
} from "@/lib/views";
import { Row, SectionHeading, StatusLabel } from "@/components/ui";

interface Plan {
  title: string;
  summary: string;
  stages: string[];
  needs_approval: boolean;
  policy_note?: string;
  amount?: number;
}

type PlanState =
  | { kind: "idle" }
  | { kind: "planning"; intent: string }
  | { kind: "done"; intent: string; plan: Plan }
  | { kind: "failed"; intent: string; error: string };

function IntentInput() {
  const [value, setValue] = useState("");
  const [state, setState] = useState<PlanState>({ kind: "idle" });

  async function submit(intent: string) {
    if (!intent.trim()) return;
    setState({ kind: "planning", intent });
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent }),
      });
      const data = (await res.json()) as
        | { ok: true; plan: Plan }
        | { ok: false; error: string };
      if (data.ok) {
        setState({ kind: "done", intent, plan: data.plan });
      } else {
        setState({ kind: "failed", intent, error: data.error });
      }
    } catch {
      setState({
        kind: "failed",
        intent,
        error:
          "The orchestrator could not be reached — check that the dev server is running and try again.",
      });
    }
  }

  return (
    <div>
      <form
        className="rounded-xl border-[0.5px] border-borders p-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(value);
        }}
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="State an outcome — e.g. “Order 50k pouches for the Q4 launch”"
            className="w-full bg-transparent text-sm outline-none placeholder:text-neutral-400"
            aria-label="State an outcome"
            maxLength={500}
          />
          <button
            type="submit"
            disabled={!value.trim() || state.kind === "planning"}
            aria-label="Plan this outcome"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-neutral-900 text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowRight size={14} />
          </button>
        </div>
      </form>

      {state.kind === "planning" ? (
        <p className="mt-3 rounded-md border-l-2 border-borders bg-surface p-4 text-sm text-neutral-600">
          The orchestrator is drafting a stage plan for “{state.intent}” — it decides the steps,
          checks which policies apply, and flags anything that will need your approval.
        </p>
      ) : null}

      {state.kind === "failed" ? (
        <div className="mt-3">
          <p className="rounded-md border-l-2 border-red-600 bg-red-50 p-4 text-sm leading-relaxed text-neutral-700">
            {state.error}
          </p>
          <button
            onClick={() => void submit(state.intent)}
            className="mt-2 text-sm underline hover:text-neutral-600"
          >
            Try again with the same outcome
          </button>
        </div>
      ) : null}

      {state.kind === "done" ? (
        <div className="mt-3 rounded-xl border-[0.5px] border-borders p-5">
          <div className="flex items-start justify-between gap-4">
            <h3 className="text-sm font-medium">{state.plan.title}</h3>
            <button
              onClick={() => {
                setState({ kind: "idle" });
                setValue("");
              }}
              aria-label="Discard plan"
              className="shrink-0 text-neutral-400 hover:text-neutral-700"
            >
              <X size={14} />
            </button>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-neutral-600">{state.plan.summary}</p>
          <ol className="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-sm text-neutral-500">
            {state.plan.stages.map((s, i) => (
              <li key={`${s}-${i}`}>
                {s}
                {i < state.plan.stages.length - 1 ? <span className="mx-1.5">→</span> : null}
              </li>
            ))}
          </ol>
          {state.plan.needs_approval && state.plan.policy_note ? (
            <p className="mt-3 rounded-md border-l-2 border-amber-600 bg-amber-50 p-3 text-sm leading-relaxed text-neutral-700">
              Approval required: {state.plan.policy_note}
            </p>
          ) : null}
          <p className="mt-3 text-sm text-neutral-400">
            Demo scope: new jobs aren’t executed here. The seeded packaging request below walks the
            full flow end to end.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export default function CommandCenterPage() {
  const { decision, jobs } = useDemo();

  return (
    <div className="space-y-8">
      <header>
        <div className="text-sm text-neutral-500">Command center · Meridian Roasters</div>
        <h1 className="mt-1 text-lg">Good afternoon, Alex</h1>
      </header>

      <IntentInput />

      <section>
        <SectionHeading title="Needs you" />
        {needsYou(decision, jobs).length === 0 ? (
          <p className="border-[0.5px] border-borders px-4 py-3 text-sm text-neutral-500">
            Nothing is waiting on you right now.
          </p>
        ) : (
          needsYou(decision, jobs).map((item) => (
            <Row
              key={item.workflowId}
              href={`/workflows/${item.workflowId}`}
              needsYou={item.needsYou}
              icon={<CircleDollarSign size={16} />}
              title={item.title}
              context={item.context}
              right={
                <StatusLabel tone={item.statusTone}>
                  {item.amount ? `$${item.amount.toLocaleString()} · ` : ""}
                  {item.statusLabel}
                </StatusLabel>
              }
            />
          ))
        )}
      </section>

      <section>
        <SectionHeading
          title="Running"
          hint={`${runningItems(decision, jobs).length} in progress`}
        />
        {runningItems(decision, jobs).map((item) => (
          <Row
            key={item.workflowId}
            href={`/workflows/${item.workflowId}`}
            icon={<CircleDollarSign size={16} />}
            title={item.title}
            context={item.context}
            right={
              <StatusLabel tone={item.statusTone}>
                {item.amount ? `$${item.amount.toLocaleString()} · ` : ""}
                {item.statusLabel}
              </StatusLabel>
            }
          />
        ))}
      </section>

      <section>
        <SectionHeading title="Completed today" hint={`${completedToday(decision).length} finished`} />
        {completedToday(decision).map((item) => (
          <Row
            key={item.workflowId}
            href={`/workflows/${item.workflowId}`}
            icon={<CircleDollarSign size={16} />}
            title={item.title}
            context={item.context}
            right={
              <StatusLabel tone={item.statusTone}>
                {item.amount ? `$${item.amount.toLocaleString()} · ` : ""}
                {item.statusLabel}
              </StatusLabel>
            }
          />
        ))}
      </section>

      <p className="text-sm text-neutral-400">
        Need something specific? See{" "}
        <Link href="/agents" className="underline hover:text-neutral-600">
          what each agent may do on its own
        </Link>
        .
      </p>
    </div>
  );
}
