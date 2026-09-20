"use client";

export function ThemeSwitcher() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-olive/40 bg-olive/20 p-3">
      <span className="text-2xl" aria-hidden="true">🌙</span>
      <div className="flex-1">
        <span className="font-medium block">تیره</span>
        <span className="text-xs text-muted block">حالت تیره همیشه فعال است</span>
      </div>
      <span className="text-olive-600 dark:text-olive-300" aria-hidden="true">✓</span>
    </div>
  );
}