"use client";

import { useTheme } from "@/lib/ThemeContext";

const THEME_OPTIONS: Array<{ value: "light" | "dark" | "system"; label: string; description: string; icon: string }> = [
  { value: "light", label: "روشن", description: "همیشه از تم روشن استفاده کن", icon: "☀️" },
  { value: "dark", label: "تیره", description: "همیشه از تم تیره استفاده کن", icon: "🌙" },
  { value: "system", label: "سیستم", description: "پیروی از تنظیمات سیستم عامل", icon: "💻" },
];

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-2">
      {THEME_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setTheme(opt.value)}
          className={`w-full flex items-center gap-3 rounded-xl border p-3 text-right transition-colors ${
            theme === opt.value
              ? "border-olive/40 bg-olive/10 dark:border-olive/40 dark:bg-olive/20"
              : "border-coffee/10 bg-cream-50 hover:bg-beige dark:border-dark-border dark:bg-dark-surface dark:hover:bg-dark-surfaceHover"
          }`}
        >
          <span className="text-2xl" aria-hidden="true">{opt.icon}</span>
          <div className="flex-1">
            <span className="font-medium block">{opt.label}</span>
            <span className="text-xs text-muted block">{opt.description}</span>
          </div>
          {theme === opt.value && <span className="text-olive-600 dark:text-olive-300" aria-hidden="true">✓</span>}
        </button>
      ))}
    </div>
  );
}