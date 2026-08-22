"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Evidence, QueueItem } from "@/lib/types";
import { evidenceRecords } from "@/lib/mock-data";
import { money } from "@/lib/format";

const toneText: Record<QueueItem["statusTone"], string> = {
  neutral: "text-neutral-500",
  attention: "text-amber-700",
  good: "text-green-700",
  bad: "text-red-700",
};

export function StatusLabel({
  tone,
  children,
}: {
  tone: QueueItem["statusTone"];
  children: ReactNode;
}) {
  return <span className={`text-sm ${toneText[tone]}`}>{children}</span>;
}

export function Row({
  href,
  icon,
  title,
  context,
  right,
  needsYou = false,
}: {
  href: string;
  icon?: ReactNode;
  title: ReactNode;
  context: ReactNode;
  right?: ReactNode;
  needsYou?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 border-[0.5px] border-borders px-4 py-3 hover:bg-surface ${
        needsYou ? "border-l-2 border-l-amber-600" : ""
      } -mt-[0.5px] first:mt-0`}
    >
      {icon ? <span className="shrink-0 text-neutral-400">{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{title}</span>
        <span className="block truncate text-sm text-neutral-500">{context}</span>
      </span>
      {right ? <span className="shrink-0 text-right">{right}</span> : null}
    </Link>
  );
}

export function SectionHeading({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <h2 className="text-sm font-medium">{title}</h2>
      {hint ? <span className="text-sm text-neutral-400">{hint}</span> : null}
    </div>
  );
}

export function PageHeader({
  title,
  meta,
  actions,
}: {
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-lg">{title}</h1>
        {meta ? <div className="mt-1 text-sm text-neutral-500">{meta}</div> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border-[0.5px] border-borders p-5">{children}</div>;
}

export function MetricGroup({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border-[0.5px] border-borders bg-borders sm:grid-cols-3">
      {children}
    </div>
  );
}

export function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="bg-white p-4">
      <div className="text-sm text-neutral-500">{label}</div>
      <div className="tnum mt-1 text-lg">{value}</div>
      {note ? <div className="mt-1 text-sm text-neutral-500">{note}</div> : null}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary";

export function Btn({
  variant = "secondary",
  onClick,
  disabled,
  children,
}: {
  variant?: ButtonVariant;
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const base =
    "w-full rounded-md px-4 py-2.5 text-sm transition-colors disabled:cursor-not-allowed sm:w-auto sm:py-2";
  const styles =
    variant === "primary"
      ? "bg-neutral-900 text-white hover:bg-neutral-800"
      : "border-[0.5px] border-borders bg-white text-neutral-800 hover:bg-surface";
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${styles}`}>
      {children}
    </button>
  );
}

export function Callout({
  tone,
  title,
  children,
}: {
  tone: "warn" | "danger" | "good" | "info";
  title: string;
  children?: ReactNode;
}) {
  const styles = {
    warn: "border-amber-600/60 bg-amber-50",
    danger: "border-red-600/60 bg-red-50",
    good: "border-green-600/60 bg-green-50",
    info: "border-neutral-300 bg-surface",
  }[tone];
  return (
    <div className={`rounded-md border-l-2 ${styles} p-4`}>
      <div className="text-sm">{title}</div>
      {children ? <div className="mt-1 text-sm text-neutral-600">{children}</div> : null}
    </div>
  );
}

export function EvidenceChip({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const record: Evidence | undefined = evidenceRecords.find((e) => e.id === id);
  if (!record) return null;
  return (
    <span className="inline-block align-top">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-0.5 rounded border-[0.5px] border-borders bg-surface px-1.5 py-0.5 text-xs text-neutral-600 hover:text-neutral-900"
      >
        {record.id}
        {record.kind === "policy" ? " · policy" : ""}
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open ? (
        <span className="mt-1 block max-w-sm rounded-md border-[0.5px] border-borders bg-surface p-3 text-xs leading-relaxed text-neutral-600">
          <span className="block text-neutral-900">{record.label}</span>
          <span className="block">
            {record.source} · captured {record.capturedAt}
          </span>
          <span className="mt-1 block">{record.detail}</span>
        </span>
      ) : null}
    </span>
  );
}

export function MoneyCell({ value, muted = false }: { value: number; muted?: boolean }) {
  return (
    <span className={`tnum text-sm ${muted ? "text-neutral-500" : ""}`}>{money(value)}</span>
  );
}
