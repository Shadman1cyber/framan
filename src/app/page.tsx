import Link from "next/link";
import { getCategories, getProducts, getAllergens } from "@/lib/queries";
import { getRecommendations } from "@/lib/recommendations";
import { resolveQR } from "@/lib/qr";
import { buildAllergyInfoForProducts, filterBySelectedAllergens } from "@/lib/allergies";
import { TopBar } from "@/components/nav/TopBar";
import { BottomNav } from "@/components/nav/BottomNav";
import { CartBar } from "@/components/cart/CartBar";
import { ProductCard } from "@/components/menu/ProductCard";
import { CategoryNav } from "@/components/menu/CategoryNav";
import { QrContextTracker } from "@/components/menu/QrContextTracker";
import { AllergenSelector } from "@/components/menu/AllergenSelector";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { EmptyState } from "@/components/ui/States";
import type { PublicProduct } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: { table?: string; qr?: string; allergens?: string };
}) {
  const session = await getServerSession(authOptions);
  const qrCode = searchParams.qr ?? searchParams.table ?? null;
  const qr = await resolveQR(qrCode);
  const invalidQr = qrCode !== null && !qr;
  const tableParam = searchParams.qr ? "qr" : "table";
  const baseHref = qrCode ? `/?${tableParam}=${qrCode}` : "/";

  const [categories, popular, featured, allergenList] = await Promise.all([
    getCategories(),
    getProducts({ limit: 8 }),
    getProducts({ limit: 12 }),
    getAllergens(),
  ]);
  const featuredProducts = featured.filter((p) => p.isFeatured);
  const recommended =
    session?.user
      ? await getRecommendations(
          { userId: (session.user as { id?: string }).id },
          "PERSONAL",
          { limit: 6 },
        )
      : await getRecommendations({}, "FEATURED", { limit: 6 });

  const recommendedProducts = (
    await Promise.all(
      recommended.map(async (r) => {
        const all = await getProducts();
        return all.find((p) => p.id === r.id);
      }),
    )
  ).filter(Boolean) as Awaited<ReturnType<typeof getProducts>>;

  let userAllergenNames: string[] = [];
  if (session?.user) {
    const ux = await prisma.userAllergy.findMany({
      where: { userId: (session.user as { id?: string }).id },
      include: { allergen: true },
    });
    userAllergenNames = ux.map((u) => u.allergen.nameFa);
  }

  const selectedAllergens = (searchParams.allergens ?? "").split(",").filter(Boolean);
  const allergyInfos = await buildAllergyInfoForProducts(
    [...new Set([...recommendedProducts, ...popular, ...featuredProducts].map((p) => p.id))],
    selectedAllergens,
  );
  const bySelected = (list: PublicProduct[]) =>
    filterBySelectedAllergens(list, allergyInfos, selectedAllergens);
  const conflictNames = allergenList
    .filter((a) => selectedAllergens.includes(a.id))
    .map((a) => a.nameFa);
  const activeFilter = selectedAllergens.length > 0;

  const visibleFeatured = bySelected(featuredProducts);
  const visibleRecommended = bySelected(recommendedProducts);
  const visiblePopular = bySelected(popular);

  return (
    <div className="pb-24 md:pb-12">
      <QrContextTracker qrId={qr?.qrCodeId ?? null} tableLabel={qr?.tableLabel ?? null} />
      <TopBar showTable tableLabel={qr?.tableLabel ?? null} />
      <main className="mx-auto max-w-6xl px-4 py-6 md:py-10">
        {invalidQr && (
          <div className="mb-6 rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm text-espresso">
            کد QR نامعتبر است؛ می‌توانید همچنان از منو استفاده کنید.
          </div>
        )}

        <section className="mb-10 md:mb-14">
          <p className="mb-2 text-sm font-medium text-olive-600">پیشنهاد امروز</p>
          <h1 className="heading-hero max-w-2xl">
            {visibleFeatured[0]?.nameFa ?? "منوی امروز کافه فرمان"}
          </h1>
          <p className="mt-3 max-w-xl text-base text-espresso/70">
            {visibleFeatured[0]?.description ??
              "قهوه‌ی تازه، صبحانه‌ی گرم و دسرهای دست‌ساز. هر سفارش با دقت آماده می‌شود."}
          </p>
          {visibleFeatured[0] && (
            <Link
              href={`/product/${visibleFeatured[0].slug}`}
              className="btn-primary mt-6"
            >
              مشاهده پیشنهاد
            </Link>
          )}
        </section>

        {!session?.user && (
          <section
            aria-labelledby="club-heading"
            className="mb-10 overflow-hidden rounded-3xl bg-gradient-to-l from-olive to-olive-600 p-6 text-cream shadow-card md:p-8"
          >
            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-wide text-cream/70">
                باشگاه مشتریان
              </p>
              <h2 id="club-heading" className="heading-section mt-2 text-cream">
                عضو شوید و تخفیف بگیرید
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-cream/85">
                به باشگاه مشتریان کافه فرمان بپیوندید؛ نسبت به تخفیف‌های ویژه،
                مناسبت‌ها و پیشنهادهای اختصاصی زودتر از همه آگاه می‌شوید
                و از امتیازهای خرید هر بار لذت می‌برید.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/register"
                  className="rounded-xl bg-cream px-5 py-3 text-sm font-semibold text-olive-700 transition-colors hover:bg-beige"
                >
                  همین حالا عضو شوید
                </Link>
                <Link
                  href="/login"
                  className="rounded-xl border border-cream/40 px-5 py-3 text-sm font-medium text-cream transition-colors hover:bg-olive-700"
                >
                  ورود
                </Link>
              </div>
              <p className="mt-4 text-xs text-cream/60">
                عضویت رایگان است؛ کافی‌ست یک حساب کاربری بسازید.
              </p>
            </div>
          </section>
        )}

        <AllergenSelector
          allergens={allergenList.map((a) => ({
            id: a.id,
            key: a.key,
            nameFa: a.nameFa,
          }))}
          selected={selectedAllergens}
          baseHref={baseHref}
        />

        <section aria-labelledby="categories-heading" className="mb-10">
          <h2 id="categories-heading" className="heading-section mb-4">
            دسته‌بندی‌ها
          </h2>
          <CategoryNav
            categories={categories}
            query={activeFilter ? `allergens=${selectedAllergens.join(",")}` : undefined}
          />
        </section>

        <section aria-labelledby="rec-heading" className="mb-10">
          <div className="mb-4 flex items-end justify-between">
            <h2 id="rec-heading" className="heading-section">
              {activeFilter
                ? "پیشنهادهای ایمن برای شما"
                : session?.user
                  ? "پیشنهاد برای شما"
                  : "پیشنهاد ویژه"}
            </h2>
            {(activeFilter || (session?.user && userAllergenNames.length > 0)) && (
              <span className="text-xs text-muted">
                فیلتر شده بر اساس محدودیت‌های غذایی شما
              </span>
            )}
          </div>
          {visibleRecommended.length === 0 ? (
            <EmptyState
              title="محصول ایمنی یافت نشد"
              description="از فیلتر آلرژی، موردی را حذف کنید."
              icon="🫙"
            />
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {visibleRecommended.map((p) => (
                <ProductCard key={p.id} product={p} conflictNames={conflictNames} />
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="popular-heading" className="mb-10">
          <h2 id="popular-heading" className="heading-section mb-4">
            محبوب
          </h2>
          {visiblePopular.length === 0 ? (
            <EmptyState
              title="محصول ایمنی یافت نشد"
              description="از فیلتر آلرژی، موردی را حذف کنید."
              icon="🫙"
            />
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {visiblePopular.map((p) => (
                <ProductCard key={p.id} product={p} conflictNames={conflictNames} />
              ))}
            </div>
          )}
        </section>
      </main>
      <BottomNav />
      <CartBar />
    </div>
  );
}