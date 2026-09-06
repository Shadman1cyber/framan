import { notFound } from "next/navigation";
import Image from "next/image";
import { getProductBySlug } from "@/lib/queries";
import { buildAllergyInfoForProducts } from "@/lib/allergies";
import { TopBar } from "@/components/nav/TopBar";
import { BottomNav } from "@/components/nav/BottomNav";
import { CartBar } from "@/components/cart/CartBar";
import { Price } from "@/components/ui/Price";
import { Rating } from "@/components/ui/Rating";
import { AllergenBadge, DietaryBadge } from "@/components/ui/Badges";
import { AddToCart } from "@/components/menu/AddToCart";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: { slug: string } }) {
  const product = await getProductBySlug(params.slug);
  if (!product) notFound();

  const session = await getServerSession(authOptions);
  const userAllergenIds = session?.user
    ? (
        await prisma.userAllergy.findMany({
          where: { userId: (session.user as { id?: string }).id },
        })
      ).map((u) => u.allergenId)
    : [];
  const infos = await buildAllergyInfoForProducts([product.id], userAllergenIds);
  const info = infos.get(product.id)!;

  return (
    <div className="pb-32 md:pb-12">
      <TopBar />
      <main className="mx-auto max-w-4xl px-4 py-6 md:py-10">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="relative aspect-square overflow-hidden rounded-2xl bg-beige shadow-card">
            {product.image ? (
              <Image
                src={product.image}
                alt={product.nameFa}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
                priority
              />
            ) : (
              <div className="flex h-full items-center justify-center text-6xl text-coffee/40">☕</div>
            )}
          </div>
          <div className="flex flex-col gap-4">
            <div>
              <span className="text-xs text-muted">{product.category.nameFa}</span>
              <h1 className="heading-section mt-1">{product.nameFa}</h1>
              {product.nameEn && <p className="text-sm text-muted">{product.nameEn}</p>}
            </div>
            {product.ratingAvg != null && product.ratingCount > 0 && (
              <Rating value={product.ratingAvg} count={product.ratingCount} size="md" />
            )}
            <p className="text-base text-espresso/80">{product.description}</p>

            {info.conflictingAllergens.length > 0 && (
              <div className="rounded-2xl border border-danger/30 bg-danger/5 p-4">
                <div className="mb-2 flex items-center gap-2 font-semibold text-danger">
                  <span aria-hidden="true">⚠</span>
                  <span>حاوی آلرژن‌های حساسیت شما</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {info.conflictingAllergens.map((c) => (
                    <AllergenBadge key={c.allergenId} nameFa={c.nameFa} status={c.status} />
                  ))}
                </div>
                <p className="mt-2 text-xs text-espresso/70">
                  اگر به این مواد حساسیت دارید، لطفاً پیش از سفارش با کافه هماهنگ کنید.
                </p>
              </div>
            )}
            {info.allergenStatus === "UNKNOWN" && (
              <div className="rounded-2xl border border-warning/30 bg-warning/5 p-4 text-sm">
                <span className="font-semibold text-warning">اطلاعات آلرژن ناقص است.</span>
                <p className="mt-1 text-xs text-espresso/70">
                  ما نمی‌توانیم ایمنی این محصول را تضمین کنیم. در صورت حساسیت، از کافه بپرسید.
                </p>
              </div>
            )}

            {product.ingredients.length > 0 && (
              <section>
                <h2 className="mb-2 text-sm font-semibold text-espresso">ترکیبات</h2>
                <div className="flex flex-wrap gap-1">
                  {product.ingredients.map((i) => (
                    <span key={i.id} className="chip">{i.nameFa}</span>
                  ))}
                </div>
              </section>
            )}

            {product.allergens.length > 0 && (
              <section>
                <h2 className="mb-2 text-sm font-semibold text-espresso">آلرژن‌ها</h2>
                <div className="flex flex-wrap gap-1">
                  {product.allergens.map((a) => (
                    <AllergenBadge key={a.id} nameFa={a.nameFa} status={a.status} />
                  ))}
                </div>
              </section>
            )}

            {product.dietaryTags.length > 0 && (
              <section>
                <h2 className="mb-2 text-sm font-semibold text-espresso">ویژگی‌های غذایی</h2>
                <div className="flex flex-wrap gap-1">
                  {product.dietaryTags.map((d) => (
                    <DietaryBadge key={d.id} nameFa={d.nameFa} icon={d.icon} />
                  ))}
                </div>
              </section>
            )}

            <div className="mt-2 flex items-center justify-between">
              <Price amount={product.price} size="lg" />
              <span
                className={`text-xs ${product.isAvailable ? "text-olive-600" : "text-danger"}`}
              >
                {product.isAvailable ? "موجود" : "ناموجود"}
              </span>
            </div>

            {product.isAvailable && (
              <AddToCart
                product={{
                  id: product.id,
                  name: product.nameFa,
                  price: product.price,
                  image: product.image ?? undefined,
                }}
              />
            )}
          </div>
        </div>

        <p className="mt-8 rounded-2xl border border-coffee/10 bg-cream-50 p-4 text-xs text-muted">
          سیستم ما ابزاری برای آگاهی از آلرژن‌هاست و تضمین پزشکی نیست.
          در صورت حساسیت شدید، لطفاً مواد تشکیل‌دهنده و شرایط تهیه را مستقیماً از کافه جویا شوید.
        </p>
      </main>
      <BottomNav />
      <CartBar />
    </div>
  );
}