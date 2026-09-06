import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/ProductForm";

export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }: { params: { id: string } }) {
  const [product, categories, ingredients, allergens] = await Promise.all([
    prisma.product.findUnique({
      where: { id: params.id },
      include: { ingredients: true, allergens: true },
    }),
    prisma.category.findMany({ orderBy: { order: "asc" } }),
    prisma.ingredient.findMany({ orderBy: { nameFa: "asc" } }),
    prisma.allergen.findMany({ orderBy: { nameFa: "asc" } }),
  ]);
  if (!product) notFound();
  return (
    <div className="max-w-3xl">
      <h1 className="heading-section mb-6">ویرایش محصول</h1>
      <ProductForm
        product={{
          id: product.id,
          slug: product.slug,
          nameFa: product.nameFa,
          nameEn: product.nameEn ?? "",
          description: product.description,
          price: product.price,
          image: product.image ?? "",
          categoryId: product.categoryId,
          isAvailable: product.isAvailable,
          isFeatured: product.isFeatured,
          order: product.order,
          allergenStatus: product.allergenStatus as "CONTAINS" | "MAY_CONTAIN" | "UNKNOWN",
          ingredientIds: product.ingredients.map((i) => i.ingredientId),
          allergenIds: product.allergens.map((a) => a.allergenId),
        }}
        categories={categories.map((c) => ({ id: c.id, nameFa: c.nameFa }))}
        ingredients={ingredients.map((i) => ({ id: i.id, nameFa: i.nameFa }))}
        allergens={allergens.map((a) => ({ id: a.id, nameFa: a.nameFa, key: a.key }))}
      />
    </div>
  );
}