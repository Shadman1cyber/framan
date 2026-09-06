import { prisma } from "@/lib/db";
import { IngredientsAdmin } from "@/components/admin/IngredientsAdmin";

export const dynamic = "force-dynamic";

export default async function AdminIngredientsPage() {
  const [ingredients, allergens] = await Promise.all([
    prisma.ingredient.findMany({
      orderBy: { nameFa: "asc" },
      include: { _count: { select: { products: true, allergens: true } } },
    }),
    prisma.allergen.findMany({ orderBy: { nameFa: "asc" } }),
  ]);
  return (
    <div className="max-w-3xl">
      <h1 className="heading-section mb-6">مواد اولیه</h1>
      <IngredientsAdmin
        allergens={allergens.map((a) => ({ id: a.id, nameFa: a.nameFa }))}
        initial={ingredients.map((i) => ({
          id: i.id,
          nameFa: i.nameFa,
          isAllergen: i.isAllergen,
          productCount: i._count.products,
          allergenIds: [] as string[],
        }))}
      />
    </div>
  );
}