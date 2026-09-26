"use client";

import { useId } from "react";

export type SparklineProps = {
  /** Values between 0 and 1, evenly spaced. Ignored when `d` is given. */
  values?: number[];
  /** Pre-built path in viewBox units, for hand-tuned curves. */
  d?: string;
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
  area?: boolean;
  className?: string;
  testId?: string;
};

function smoothPath(values: number[], width: number, height: number, pad: number) {
  const count = values.length;
  if (count === 0) return "";
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const points = values.map((value, index) => {
    const x = count === 1 ? width / 2 : (index / (count - 1)) * width;
    const y = height - pad - ((value - min) / span) * (height - pad * 2);
    return { x, y };
  });
  if (points.length === 1) return `M${points[0].x} ${points[0].y}`;
  let path = `M${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const previous = points[i - 1] ?? points[i];
    const start = points[i];
    const end = points[i + 1];
    const next = points[i + 2] ?? end;
    path += ` C${start.x + (end.x - previous.x) / 6} ${start.y + (end.y - previous.y) / 6} ${end.x - (next.x - start.x) / 6} ${end.y - (next.y - start.y) / 6} ${end.x} ${end.y}`;
  }
  return path;
}

/**
 * Line / area chart. The color is never hardcoded here: it defaults to the
 * `--module-primary` token resolved from the nearest `data-theme` ancestor, so
 * the same component renders teal on Accounting and purple on CRM untouched.
 */
export function Sparkline({
  values,
  d,
  width = 360,
  height = 92,
  color = "var(--module-primary)",
  strokeWidth = 2,
  area = true,
  className,
  testId = "sparkline",
}: SparklineProps) {
  const gradientId = `spark-${useId().replace(/:/g, "")}`;
  const line = d ?? smoothPath(values ?? [], width, height, 8);
  if (!line) return null;
  return (
    <svg
      data-testid={testId}
      data-chart-color={color}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      {area && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity=".28" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      {area && <path d={`${line} L${width} ${height} L0 ${height} Z`} fill={`url(#${gradientId})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}
