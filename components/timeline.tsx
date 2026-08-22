"use client";

import { Check, Clock, X } from "lucide-react";
import type { ExecutionStep } from "@/lib/types";

export function ExecutionTimeline({ steps }: { steps: ExecutionStep[] }) {
  return (
    <ol>
      {steps.map((step, i) => (
        <li key={step.key} className="flex gap-3">
          <div className="flex flex-col items-center">
            <Marker state={step.state} />
            {i < steps.length - 1 ? (
              <span
                aria-hidden
                className={`w-[0.5px] flex-1 ${
                  step.state === "done" ? "bg-green-700" : "bg-neutral-200"
                }`}
              />
            ) : null}
          </div>
          <div className={`pb-6 ${i === steps.length - 1 ? "pb-0" : ""}`}>
            <div
              className={`text-sm ${
                step.state === "pending"
                  ? "text-neutral-400"
                  : step.state === "failed_retry"
                    ? "text-red-700"
                    : ""
              }`}
            >
              {step.label}
            </div>
            <div className="mt-0.5 text-sm text-neutral-500">{step.detail}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Marker({ state }: { state: ExecutionStep["state"] }) {
  const base = "flex h-6 w-6 shrink-0 items-center justify-center rounded-full";
  switch (state) {
    case "done":
      return (
        <span className={`${base} bg-green-700 text-white`}>
          <Check size={12} strokeWidth={3} />
        </span>
      );
    case "waiting_external":
      return (
        <span className={`${base} border-[1.5px] border-amber-600 bg-white text-amber-700`}>
          <Clock size={12} />
        </span>
      );
    case "active":
      return (
        <span className={`${base} border-[1.5px] border-amber-600 bg-white tnum text-xs text-neutral-900`}>
          ·
        </span>
      );
    case "failed_retry":
      return (
        <span className={`${base} border-[1.5px] border-red-600 bg-white text-red-700`}>
          <X size={12} strokeWidth={3} />
        </span>
      );
    case "stopped":
      return (
        <span className={`${base} border-[0.5px] border-neutral-300 bg-white text-neutral-400`}>
          <X size={12} />
        </span>
      );
    default:
      return <span className={`${base} border-[0.5px] border-neutral-300 bg-white`} />;
  }
}
