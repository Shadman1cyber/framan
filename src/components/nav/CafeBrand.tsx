export function CafeBrand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-olive text-cream font-bold"
        aria-hidden="true"
      >
        ف
      </span>
      {!compact && (
        <span className="flex flex-col leading-tight">
          <span className="font-display text-base font-bold text-espresso">کافه فرمان</span>
          <span className="text-[11px] text-muted">منوی دیجیتال</span>
        </span>
      )}
    </span>
  );
}