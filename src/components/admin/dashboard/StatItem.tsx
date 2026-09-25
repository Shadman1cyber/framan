export type StatItemProps = { label: string; value: string; status: string; tone: "green" | "yellow" | "red" | "blue" };

const tone = { green: "bg-signal-bright", yellow: "bg-accent-yellow", red: "bg-accent-red", blue: "bg-accent-blue" };

export function StatItem({ label, value, status, tone: color }: StatItemProps) {
  return <div data-testid="stat-item" className="flex w-full min-w-0 flex-col items-center text-center"><div data-testid="stat-label" className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap text-xs text-dashboard-muted"><span className={`h-[7px] w-[7px] rounded-full ${tone[color]}`} aria-hidden="true" />{label}</div><p data-testid="stat-value" className="mt-1 font-mono text-lg font-semibold leading-[1.2] tabular-nums tracking-[-0.04em] text-dashboard-foreground">{value}</p><p data-testid="stat-status" className="mt-1 truncate text-[11px] text-dashboard-muted">{status}</p></div>;
}
