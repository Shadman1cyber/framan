"use client";

export function QuantitySelector({
  value,
  onChange,
  min = 1,
  max = 99,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  const set = (n: number) => onChange(Math.max(min, Math.min(max, n)));
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-coffee/15 bg-cream-50 p-1">
      <button
        type="button"
        onClick={() => set(value - 1)}
        disabled={value <= min}
        aria-label="کاهش تعداد"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-espresso disabled:opacity-40 hover:bg-beige"
      >
        −
      </button>
      <span aria-live="polite" className="min-w-[2rem] text-center text-sm font-semibold tabular-nums">
        {value}
      </span>
      <button
        type="button"
        onClick={() => set(value + 1)}
        disabled={value >= max}
        aria-label="افزایش تعداد"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-espresso disabled:opacity-40 hover:bg-beige"
      >
        +
      </button>
    </div>
  );
}