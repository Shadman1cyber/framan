import Link from "next/link";
import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-line bg-surface ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 border-b border-line">
      <div>
        <h2 className="text-[13px] font-semibold tracking-wide text-ink uppercase">
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-xs text-ink-faint">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const toneMap = {
  good: "bg-good/10 text-good border-good/25",
  warn: "bg-warn/10 text-warn border-warn/25",
  bad: "bg-bad/10 text-bad border-bad/25",
  info: "bg-info/10 text-info border-info/25",
  accent: "bg-accent-soft text-accent border-accent/30",
  neutral: "bg-raised text-ink-dim border-line-strong",
} as const;

export type Tone = keyof typeof toneMap;

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4 ${toneMap[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function StatusDot({ tone }: { tone: Tone }) {
  const c =
    tone === "good" ? "bg-good" : tone === "warn" ? "bg-warn" : tone === "bad" ? "bg-bad" : tone === "accent" ? "bg-accent" : "bg-ink-faint";
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${c}`} />;
}

export function StatCard({
  label,
  value,
  sub,
  tone,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
  href?: string;
}) {
  const body = (
    <div className="rounded-xl border border-line bg-surface px-4 py-3.5 hover:border-line-strong transition-colors h-full">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">{label}</p>
      <p className={`num mt-1.5 text-[22px] font-semibold leading-none ${tone ? toneMap[tone].split(" ")[1] : "text-ink"}`}>
        {value}
      </p>
      {sub && <p className="mt-1.5 text-xs text-ink-dim">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
      {icon && (
        <div className="h-11 w-11 rounded-xl bg-raised border border-line flex items-center justify-center text-ink-dim mb-4">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="mt-1 text-[13px] text-ink-dim max-w-sm">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-dim max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function ReliabilityBar({ value }: { value: number }) {
  const tone = value >= 85 ? "bg-good" : value >= 75 ? "bg-warn" : "bg-bad";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-raised overflow-hidden">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${value}%` }} />
      </div>
      <span className="num text-xs text-ink-dim">{Math.round(value)}%</span>
    </div>
  );
}

export function RiskBadge({ level }: { level: string }) {
  const tone = level === "low" ? "good" : level === "medium" ? "warn" : "bad";
  return <Badge tone={tone as Tone}>{level.charAt(0).toUpperCase() + level.slice(1)}</Badge>;
}

export function ScorePill({ score }: { score: number }) {
  const tone = score >= 80 ? "good" : score >= 65 ? "warn" : "bad";
  return (
    <span
      className={`num inline-flex h-7 min-w-9 items-center justify-center rounded-md border px-1.5 text-xs font-semibold ${toneMap[tone as Tone]}`}
    >
      {score.toFixed(0)}
    </span>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint mb-2">
      {children}
    </h3>
  );
}
