"use client";

import Link from "next/link";
import { Check, X } from "lucide-react";
import type { Stage, StageId } from "@/lib/types";

export function Stepper({
  stages,
  workflowId,
  currentStageId,
}: {
  stages: Stage[];
  workflowId: string;
  currentStageId: StageId;
}) {
  return (
    <ol className="flex items-start">
      {stages.map((stage, i) => {
        const content = (
          <span className="flex w-11 flex-col items-center gap-2 sm:w-20">
            <Circle stage={stage} />
            <span
              className={`text-center text-[11px] leading-tight sm:text-sm ${
                stage.state === "active"
                  ? "font-medium text-neutral-900"
                  : stage.state === "completed"
                    ? "text-neutral-600"
                    : stage.state === "blocked"
                      ? "text-red-700"
                      : "text-neutral-400"
              }`}
            >
              {stage.label}
            </span>
          </span>
        );

        const href =
          stage.id === "compare"
            ? `/workflows/${workflowId}/compare`
            : stage.id === "approve"
              ? `/approvals/apr-1042`
              : stage.id === "execute" || stage.id === "complete"
                ? `/workflows/${workflowId}/execution`
                : null;

        const isInteractive =
          href !== null &&
          (stage.id === currentStageId ||
            stage.state === "completed" ||
            stage.state === "blocked");

        return (
          <li key={stage.id} className="flex flex-1 items-start last:flex-none">
            {isInteractive && href ? (
              <Link href={href} className="hover:opacity-80" title={`Open ${stage.label.toLowerCase()} stage`}>
                {content}
              </Link>
            ) : (
              content
            )}
            {i < stages.length - 1 ? <Connector state={stage.state} /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function Circle({ stage }: { stage: Stage }) {
  if (stage.state === "completed") {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-700 text-white sm:h-7 sm:w-7">
        <Check size={14} strokeWidth={3} />
      </span>
    );
  }
  if (stage.state === "active") {
    return (
      <span className="tnum flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] border-amber-600 bg-white text-xs text-neutral-900 sm:h-7 sm:w-7 sm:text-sm">
        {stageIndexLabel(stage.id)}
      </span>
    );
  }
  if (stage.state === "blocked") {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] border-red-600 bg-white text-red-700 sm:h-7 sm:w-7">
        <X size={14} strokeWidth={3} />
      </span>
    );
  }
  return (
    <span className="tnum flex h-6 w-6 items-center justify-center rounded-full border-[0.5px] border-neutral-300 bg-white text-xs text-neutral-400 sm:h-7 sm:w-7 sm:text-sm">
      {stageIndexLabel(stage.id)}
    </span>
  );
}

function Connector({ state }: { state: Stage["state"] }) {
  return (
    <span
      aria-hidden
      className={`mt-3 h-[0.5px] flex-1 sm:mt-3.5 ${
        state === "completed" ? "bg-green-700" : state === "blocked" ? "bg-red-300" : "bg-neutral-200"
      }`}
    />
  );
}

const order: StageId[] = ["specify", "source", "compare", "approve", "execute", "complete"];

function stageIndexLabel(id: StageId): string {
  return String(order.indexOf(id) + 1);
}
