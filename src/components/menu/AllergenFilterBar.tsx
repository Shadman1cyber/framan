import Link from "next/link";

export function AllergenFilterBar({
  baseHref,
  safeOnly,
  query,
}: {
  baseHref: string;
  safeOnly: boolean;
  query?: string;
}) {
  const withQuery = (href: string) =>
    query ? `${href}${href.includes("?") ? "&" : "?"}${query}` : href;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-olive/20 bg-olive-50 p-3 text-sm">
      <span className="text-espresso/80">فیلتر بر اساس حساسیت:</span>
      <Link
        href={withQuery(safeOnly ? baseHref : `${baseHref}?safe=1`)}
        className={`chip ${safeOnly ? "chip-active" : ""}`}
        aria-pressed={safeOnly}
      >
        فقط محصولات ایمن
      </Link>
      <Link href={withQuery(baseHref)} className={`chip ${!safeOnly ? "chip-active" : ""}`} aria-pressed={!safeOnly}>
        نمایش همه (با هشدار)
      </Link>
    </div>
  );
}