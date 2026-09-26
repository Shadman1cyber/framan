export type MiniRingProps = {
  percent: number;
  label: string;
  caption?: string;
  size?: number;
  strokeWidth?: number;
  /** Defaults to the themed module accent — never pass a literal color. */
  color?: string;
  testId?: string;
};

/**
 * Small secondary ring. The arc color is never hardcoded here: it defaults to
 * the `--module-primary` token resolved from the nearest `data-theme` ancestor.
 */
export function MiniRing({
  percent,
  label,
  caption,
  size = 104,
  strokeWidth = 9,
  color = "var(--module-primary)",
  testId = "mini-ring",
}: MiniRingProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <svg
      data-testid={testId}
      data-chart-color={color}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className="-rotate-90 shrink-0"
      role="img"
      aria-label={`${label}${caption ? ` — ${caption}` : ""}`}
    >
      <circle cx="50" cy="50" r="44" className="fill-none stroke-dashboard-raised" strokeWidth={strokeWidth} />
      <circle
        cx="50"
        cy="50"
        r="44"
        pathLength="100"
        className="fill-none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${clamped} ${100 - clamped}`}
      />
    </svg>
  );
}
