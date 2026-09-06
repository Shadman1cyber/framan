import { TopBar } from "@/components/nav/TopBar";
import { BottomNav } from "@/components/nav/BottomNav";
import { CartBar } from "@/components/cart/CartBar";
import { QrContextTracker } from "@/components/menu/QrContextTracker";
import { AllergenSelector } from "@/components/menu/AllergenSelector";
import { getCategories, getAllergens } from "@/lib/queries";
import { resolveQR } from "@/lib/qr";
import Link from "next/link";
import { EmptyState } from "@/components/ui/States";

export const dynamic = "force-dynamic";

export default async function MenuPage({
  searchParams,
}: {
  searchParams: { qr?: string; table?: string; allergens?: string };
}) {
  const qrCode = searchParams.qr ?? searchParams.table ?? null;
  const qr = qrCode ? await resolveQR(qrCode) : null;
  const [categories, allergenList] = await Promise.all([getCategories(), getAllergens()]);
  const selectedAllergens = (searchParams.allergens ?? "").split(",").filter(Boolean);
  const activeFilter = selectedAllergens.length > 0;
  return (
    <div className="pb-24 md:pb-12">
      <QrContextTracker qrId={qr?.qrCodeId ?? qrCode} tableLabel={qr?.tableLabel ?? null} />
      <TopBar />
      <main className="mx-auto max-w-6xl px-4 py-6 md:py-10">
        <h1 className="heading-section mb-6">منوی کافه</h1>
        <AllergenSelector
          allergens={allergenList.map((a) => ({ id: a.id, key: a.key, nameFa: a.nameFa }))}
          selected={selectedAllergens}
          baseHref="/menu"
        />
        {categories.length === 0 ? (
          <EmptyState title="دسته‌ای یافت نشد" icon="📭" />
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`/menu/${c.slug}${activeFilter ? `?allergens=${selectedAllergens.join(",")}` : ""}`}
                className="flex flex-col gap-2 rounded-2xl border border-coffee/10 bg-cream-50 p-5 shadow-soft hover:shadow-card"
              >
                <span className="text-3xl" aria-hidden="true">{c.icon ?? "🍽️"}</span>
                <span className="heading-card">{c.nameFa}</span>
                {c.description && <span className="text-xs text-muted">{c.description}</span>}
                <span className="text-xs text-muted mt-auto">{c.productCount} محصول</span>
              </Link>
            ))}
          </div>
        )}
      </main>
      <BottomNav />
      <CartBar />
    </div>
  );
}