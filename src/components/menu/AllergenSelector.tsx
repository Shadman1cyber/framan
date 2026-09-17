import Link from "next/link";

export type SelectableAllergen = { id: string; key: string; nameFa: string };

export function AllergenSelector({
  allergens,
  selected,
  baseHref,
}: {
  allergens: SelectableAllergen[];
  selected: string[];
  baseHref: string;
}) {
  if (allergens.length === 0) return null;

  const withSelected = (ids: string[]) =>
    ids.length
      ? `${baseHref}${baseHref.includes("?") ? "&" : "?"}allergens=${ids.join(",")}`
      : baseHref;

  return (
    <section
      aria-labelledby="allergen-filter-heading"
      className="mb-8 rounded-2xl border border-coffee/10 bg-cream-50 p-4 shadow-soft dark:border-dark-border dark:bg-dark-surface"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-olive/10 text-lg"
          >
            🥜
          </span>
          <div>
            <h2 id="allergen-filter-heading" className="text-sm font-semibold text-espresso">
              آلرژی و محدودیت غذایی
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              آلرژی‌های خود را انتخاب کنید؛ فقط محصولات ایمن برای شما نمایش داده می‌شود.
            </p>
          </div>
        </div>
        {selected.length > 0 && (
          <Link href={baseHref} className="whitespace-nowrap text-xs text-olive-600 hover:underline">
            حذف همه
          </Link>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {allergens.map((a) => {
          const active = selected.includes(a.id);
          return (
            <Link
              key={a.id}
              href={withSelected(
                active ? selected.filter((x) => x !== a.id) : [...selected, a.id],
              )}
              aria-pressed={active}
              className={`chip ${active ? "chip-active" : ""}`}
            >
              <span aria-hidden="true">{active ? "✓" : ""}</span>
              {a.nameFa}
            </Link>
          );
        })}
      </div>
      {selected.length > 0 && (
        <p className="mt-3 text-xs text-olive-600">
          {selected.length} محدودیت برای فیلتر منو فعال شده است.
        </p>
      )}
    </section>
  );
}