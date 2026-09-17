import { TopBar } from "@/components/nav/TopBar";
import { BottomNav } from "@/components/nav/BottomNav";
import { CartBar } from "@/components/cart/CartBar";
import { getCategories, getProducts, getAllergens } from "@/lib/queries";
import { buildAllergyInfoForProducts, filterBySelectedAllergens } from "@/lib/allergies";
import { ProductCard } from "@/components/menu/ProductCard";
import { EmptyState } from "@/components/ui/States";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CategoryNav } from "@/components/menu/CategoryNav";
import { QrContextTracker } from "@/components/menu/QrContextTracker";
import { AllergenSelector } from "@/components/menu/AllergenSelector";
import { SearchBar } from "@/components/menu/SearchBar";
import { AllergenFilterBar } from "@/components/menu/AllergenFilterBar";
import { resolveQR } from "@/lib/qr";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { safe?: string; qr?: string; table?: string; allergens?: string };
}) {
  const qrCode = searchParams.qr ?? searchParams.table ?? null;
  const [qr, categories, products, allergenList, session] = await Promise.all([
    qrCode ? resolveQR(qrCode) : Promise.resolve(null),
    getCategories(),
    getProducts({ categorySlug: params.slug }),
    getAllergens(),
    getServerSession(authOptions),
  ]);
  const cat = categories.find((c) => c.slug === params.slug);
  if (!cat) notFound();

  const userAllergenIds = session?.user
    ? (
        await prisma.userAllergy.findMany({
          where: { userId: (session.user as { id?: string }).id },
          select: { allergenId: true },
        })
      ).map((u) => u.allergenId)
    : [];

  const selectedAllergens = (searchParams.allergens ?? "").split(",").filter(Boolean);
  const allAllergenIds = [...new Set([...userAllergenIds, ...selectedAllergens])];

  const [userAllergens, infos] = await Promise.all([
    userAllergenIds.length > 0
      ? prisma.allergen.findMany({ where: { id: { in: userAllergenIds } } })
      : Promise.resolve([]),
    buildAllergyInfoForProducts(
      products.map((p) => p.id),
      allAllergenIds,
    ),
  ]);
  const userAllergenNames = userAllergens.map((a) => a.nameFa);

  const safeOnly = searchParams.safe === "1";
  const list = products.filter((p) => {
    const info = infos.get(p.id);
    if (!info) return true;
    if (safeOnly) {
      if (info.allergenStatus === "CONTAINS") return false;
      if (info.conflictingAllergens.length > 0) return false;
    }
    return true;
  });

  const filtered = selectedAllergens.length
    ? filterBySelectedAllergens(list, infos, selectedAllergens)
    : list;
  const conflictNames = [...new Set([
    ...userAllergenNames,
    ...allergenList.filter((a) => selectedAllergens.includes(a.id)).map((a) => a.nameFa),
  ])];
  const activeFilter = selectedAllergens.length > 0;
  const navQuery = [
    safeOnly ? "safe=1" : null,
    selectedAllergens.length ? `allergens=${selectedAllergens.join(",")}` : null,
  ]
    .filter(Boolean)
    .join("&");

  return (
    <div className="pb-24 md:pb-12">
      <QrContextTracker qrId={qr?.qrCodeId ?? qrCode} tableLabel={qr?.tableLabel ?? null} />
      <TopBar />
      <main className="mx-auto max-w-6xl px-4 py-6 md:py-10">
        <h1 className="heading-section mb-2">{cat.nameFa}</h1>
        {cat.description && <p className="mb-6 text-sm text-muted">{cat.description}</p>}
        <SearchBar className="mb-4" />
        <CategoryNav categories={categories} className="mb-6" query={navQuery || undefined} />
        <AllergenSelector
          allergens={allergenList.map((a) => ({ id: a.id, key: a.key, nameFa: a.nameFa }))}
          selected={selectedAllergens}
          baseHref={safeOnly ? `/menu/${cat.slug}?safe=1` : `/menu/${cat.slug}`}
        />
        {userAllergenNames.length > 0 && (
          <AllergenFilterBar
            baseHref={`/menu/${cat.slug}`}
            safeOnly={safeOnly}
            query={selectedAllergens.length ? `allergens=${selectedAllergens.join(",")}` : undefined}
          />
        )}
        {filtered.length === 0 ? (
          <EmptyState
            title={activeFilter || safeOnly ? "محصول ایمنی یافت نشد" : "محصولی در این دسته نیست"}
            description={activeFilter || safeOnly ? "ممکن است با حذف فیلتر، محصولات بیشتری ببینید." : undefined}
            icon="🫙"
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} conflictNames={conflictNames} />
            ))}
          </div>
        )}
      </main>
      <BottomNav />
      <CartBar />
    </div>
  );
}