export function Rating({
  value,
  count,
  size = "sm",
}: {
  value: number;
  count?: number;
  size?: "sm" | "md";
}) {
  const rounded = Math.round(value * 2) / 2;
  const stars = Array.from({ length: 5 }, (_, i) => {
    const filled = i + 1 <= rounded;
    const half = !filled && i + 0.5 <= rounded;
    return { filled, half };
  });
  const px = size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";
  return (
    <div className="inline-flex items-center gap-1 text-coffee">
      <div className="flex gap-0.5" aria-label={`امتیاز ${value.toFixed(1)} از ۵`}>
        {stars.map((s, i) => (
          <svg key={i} viewBox="0 0 20 20" className={`${px} ${s.filled || s.half ? "text-amber-500" : "text-coffee/15"}`} fill="currentColor" aria-hidden="true">
            <defs>
              <linearGradient id={`half-${i}-${value}`}>
                <stop offset="50%" stopColor="currentColor" />
                <stop offset="50%" stopColor="transparent" />
              </linearGradient>
            </defs>
            <path
              fill={s.half ? `url(#half-${i}-${value})` : "currentColor"}
              d="M10 1.5l2.6 5.27 5.82.85-4.21 4.1.99 5.78L10 14.77l-5.21 2.73.99-5.78-4.21-4.1 5.82-.85L10 1.5z"
            />
          </svg>
        ))}
      </div>
      <span className="text-xs text-muted">{value.toFixed(1)}{count != null ? ` (${count})` : ""}</span>
    </div>
  );
}