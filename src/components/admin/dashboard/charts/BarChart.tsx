export type BarDatum = {
  label: string;
  value: number;
  /** Pre-formatted (Persian) value label; falls back to `value`. */
  display?: string;
};

export type BarChartProps = {
  data: BarDatum[];
  /** Defaults to the themed module accent — never pass a literal color. */
  color?: string;
  height?: number;
  /** Upper bound of the value axis. Defaults to the largest value. */
  max?: number;
  className?: string;
  testId?: string;
};

/**
 * Column chart. The fill color is never hardcoded here: it defaults to the
 * `--module-primary` token resolved from the nearest `data-theme` ancestor.
 */
export function BarChart({
  data,
  color = "var(--module-primary)",
  height = 132,
  max,
  className,
  testId = "bar-chart",
}: BarChartProps) {
  const ceiling = max ?? Math.max(...data.map((item) => item.value), 1);
  return (
    <div data-testid={testId} data-chart-color={color} className={`flex items-end gap-2 ${className ?? ""}`}>
      {data.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <span className="font-mono text-[11px] font-semibold text-dashboard-muted">{item.display ?? item.value}</span>
          <div
            className="mx-auto flex w-full max-w-[26px] items-end overflow-hidden rounded-full bg-dashboard-raised"
            style={{ height }}
          >
            <div
              className="w-full rounded-full transition-[height] duration-500"
              style={{ height: `${Math.max(4, (item.value / ceiling) * 100)}%`, backgroundColor: color }}
            />
          </div>
          <span className="truncate text-[11px] leading-relaxed text-dashboard-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
