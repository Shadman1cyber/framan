"use client";
import Link from "next/link";
import type { PublicCategory } from "@/lib/queries";

export function CategoryNav({
  categories,
  className,
  query,
}: {
  categories: PublicCategory[];
  className?: string;
  query?: string;
}) {
  return (
    <div className={`-mx-4 overflow-x-auto px-4 scrollbar-hide ${className ?? ""}`}>
      <ul className="flex w-max gap-3 pb-2">
        {categories.map((c) => (
          <li key={c.id}>
            <Link
              href={`/menu/${c.slug}${query ? `?${query}` : ""}`}
              className="flex min-w-[140px] flex-col items-center gap-2 rounded-2xl border border-coffee/10 bg-cream-50 p-4 transition-shadow hover:shadow-card"
            >
              <span className="text-3xl" aria-hidden="true">
                {c.icon ?? "🍽️"}
              </span>
              <span className="text-sm font-semibold text-espresso">{c.nameFa}</span>
              <span className="text-xs text-muted">{c.productCount} محصول</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}