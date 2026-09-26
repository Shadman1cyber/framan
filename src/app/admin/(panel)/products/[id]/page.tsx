import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/ProductForm";
import { SectionPage } from "@/components/admin/dashboard/SectionPage";

export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }: { params: { id: string } }) {
  const [product, categories, ingredients, allergens, coffeeLines] = await Promise.all([
    prisma.product.findUnique({
      where: { id: params.id },
      include: {
        ingredients: true,
        allergens: true,
        images: { orderBy: { order: "asc" } },
        coffeeLines: true,
      },
    }),
    prisma.category.findMany({ orderBy: { order: "asc" } }),
    prisma.ingredient.findMany({ orderBy: { nameFa: "asc" } }),
    prisma.allergen.findMany({ orderBy: { nameFa: "asc" } }),
    prisma.coffeeLine.findMany({ orderBy: { nameFa: "asc" } }),
  ]);
  if (!product) notFound();
  const imageUrls = new Set(product.images.map((i) => i.url));
  return (
    <SectionPage kind="erp" title="ویرایش محصول">
      <ProductForm
        product={{
          id: product.id,
          nameFa: product.nameFa,
          nameEn: product.nameEn ?? "",
          description: product.description,
          price: product.price,
          categoryId: product.categoryId,
          isAvailable: product.isAvailable,
          isFeatured: product.isFeatured,
          prepBaseMin: product.prepBaseMin,
          allergenStatus: (product.allergens.length > 0
            ? "CONTAINS"
            : product.allergenStatus === "CONTAINS"
              ? "CONTAINS"
              : "FREE") as "CONTAINS" | "FREE",
          ingredientIds: product.ingredients.map((i) => i.ingredientId),
          ingredientQuantities: product.ingredients.map((i) => ({
            ingredientId: i.ingredientId,
            quantity: i.quantity,
            unit: i.unit,
          })),
          allergenIds: product.allergens.map((a) => a.allergenId),
          images: [
            ...product.images.map((i) => ({ url: i.url, isPrimary: i.isPrimary })),
            // Keep legacy single image (e.g. seeded Unsplash URLs) visible in the editor
            ...(product.image && !imageUrls.has(product.image)
              ? [{ url: product.image, isPrimary: product.images.length === 0 }]
              : []),
          ],
          coffeeLines: product.coffeeLines.map((cl) => ({
            coffeeLineId: cl.coffeeLineId,
            price: cl.price,
            isActive: cl.isActive,
          })),
        }}
        categories={categories.map((c) => ({ id: c.id, nameFa: c.nameFa }))}
        ingredients={ingredients.map((i) => ({ id: i.id, nameFa: i.nameFa, unit: i.unit }))}
        allergens={allergens.map((a) => ({ id: a.id, nameFa: a.nameFa, icon: a.icon }))}
        coffeeLines={coffeeLines.map((l) => ({ id: l.id, nameFa: l.nameFa }))}
      />
    </SectionPage>
  );
}
