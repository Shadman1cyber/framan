// Dependency-free SVG charts tuned for the FARMAN design system.

import { formatMoney } from "@/lib/format";

export function CashAreaChart({
  data,
  height = 180,
}: {
  data: { label: string; value: number }[];
  height?: number;
}) {
  if (data.length < 2) return <div className="skeleton h-[180px]" />;
  const w = 640;
  const h = height;
  const padX = 8;
  const padY = 14;
  const values = data.map((d) => d.value);
  const min = Math.min(...values) * 0.96;
  const max = Math.max(...values) * 1.04;
  const span = max - min || 1;
  const x = (i: number) => padX + (i * (w - padX * 2)) / (data.length - 1);
  const y = (v: number) => padY + (1 - (v - min) / span) * (h - padY * 2);

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.length - 1).toFixed(1)},${h - padY} L${padX},${h - padY} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Cash position trend">
      <defs>
        <linearGradient id="cashFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#17b8a6" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#17b8a6" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={padX} x2={w - padX} y1={padY + f * (h - padY * 2)} y2={padY + f * (h - padY * 2)} stroke="#1e2531" strokeDasharray="3 4" />
      ))}
      <path d={area} fill="url(#cashFill)" />
      <path d={line} fill="none" stroke="#17b8a6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <circle key={i} cx={x(i)} cy={y(d.value)} r="3" fill="#0a0d12" stroke="#17b8a6" strokeWidth="1.5" />
      ))}
      {data.map((d, i) => (
        <text key={`l-${i}`} x={x(i)} y={h - 1} textAnchor="middle" fontSize="10" fill="#66718a">
          {d.label}
        </text>
      ))}
    </svg>
  );
}

export function IncomeExpenseBars({
  data,
}: {
  data: { label: string; income: number; expense: number }[];
}) {
  if (data.length === 0) return <div className="skeleton h-[200px]" />;
  const max = Math.max(...data.flatMap((d) => [d.income, d.expense])) || 1;
  return (
    <div className="space-y-3">
      {data.map((d) => (
        <div key={d.label} className="grid grid-cols-[36px_1fr] items-center gap-3">
          <span className="text-xs text-ink-faint">{d.label}</span>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 rounded-full bg-raised overflow-hidden">
                <div className="h-full rounded-full bg-good/80" style={{ width: `${(d.income / max) * 100}%` }} />
              </div>
              <span className="num text-[11px] text-ink-dim w-16 text-right">{formatMoney(d.income, { compact: true })}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 rounded-full bg-raised overflow-hidden">
                <div className="h-full rounded-full bg-bad/70" style={{ width: `${(d.expense / max) * 100}%` }} />
              </div>
              <span className="num text-[11px] text-ink-dim w-16 text-right">{formatMoney(d.expense, { compact: true })}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function CategoryBars({
  data,
}: {
  data: { label: string; value: number; budget?: number | null }[];
}) {
  const max = Math.max(...data.map((d) => d.budget ?? d.value), 1);
  return (
    <div className="space-y-3">
      {data.map((d) => {
        const pctBudget = d.budget ? (d.value / d.budget) * 100 : null;
        const tone = pctBudget == null ? "bg-info/80" : pctBudget > 100 ? "bg-bad" : pctBudget > 90 ? "bg-warn" : "bg-accent";
        return (
          <div key={d.label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-ink-dim">{d.label}</span>
              <span className="num text-ink-dim">
                {formatMoney(d.value, { compact: true })}
                {d.budget ? <span className="text-ink-faint"> / {formatMoney(d.budget, { compact: true })}</span> : null}
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-raised overflow-hidden">
              <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min((d.value / max) * 100, 100)}%` }} />
              {pctBudget != null && pctBudget <= 100 && (
                <div className="absolute top-0 h-full w-px bg-ink-faint" style={{ left: `${(d.budget! / max) * 100}%` }} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
