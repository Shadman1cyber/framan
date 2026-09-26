export type ProgressBarProps = {
  /** 0-100. */
  value: number;
  /** Defaults to the themed module accent — never pass a literal color. */
  color?: string;
  className?: string;
  testId?: string;
};

/**
 * Horizontal meter. The fill color is never hardcoded here: it defaults to the
 * `--module-primary` token resolved from the nearest `data-theme` ancestor.
 */
export function ProgressBar({
  value,
  color = "var(--module-primary)",
  className = "h-1.5",
  testId = "progress-bar",
}: ProgressBarProps) {
  const width = Math.min(100, Math.max(0, value));
  return (
    <div
      data-testid={testId}
      data-chart-color={color}
      className={`flex overflow-hidden rounded-full bg-dashboard-raised ${className}`}
      aria-hidden="true"
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${width}%`, backgroundColor: color }}
      />
    </div>
  );
}
