import { TopBar } from "@/components/nav/TopBar";
import { BottomNav } from "@/components/nav/BottomNav";
import { CartBar } from "@/components/cart/CartBar";
import { searchProducts } from "@/lib/search";
import { ProductCard } from "@/components/menu/ProductCard";
import { SearchBar } from "@/components/menu/SearchBar";
import { EmptyState } from "@/components/ui/States";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const q = (searchParams.q ?? "").trim();
  const products = q ? await searchProducts(q) : [];

  return (
    <div className="pb-24 md:pb-12">
      <TopBar />
      <main className="mx-auto max-w-6xl px-4 py-6 md:py-10">
        <h1 className="heading-section mb-4">جستجو</h1>
        <SearchBar className="mb-6" />
        {q && products.length === 0 && (
          <EmptyState
            title={`نتیجه‌ای برای «${q}» یافت نشد`}
            description="کلمه‌ی دیگری را امتحان کنید."
            icon="🔎"
          />
        )}
        {!q && (
          <p className="text-sm text-muted">
            برای جستجو در منو، عبارت مورد نظر را وارد کنید.
          </p>
        )}
        {products.length > 0 && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </main>
      <BottomNav />
      <CartBar />
    </div>
  );
}