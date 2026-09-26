import { prisma } from "@/lib/db";
import { ProductForm } from "@/components/admin/ProductForm";
import { SectionPage } from "@/components/admin/dashboard/SectionPage";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const [categories, ingredients, allergens, coffeeLines] = await Promise.all([
    prisma.category.findMany({ orderBy: { order: "asc" } }),
    prisma.ingredient.findMany({ orderBy: { nameFa: "asc" } }),
    prisma.allergen.findMany({ orderBy: { nameFa: "asc" } }),
    prisma.coffeeLine.findMany({ where: { isActive: true }, orderBy: { nameFa: "asc" } }),
  ]);
  return (
    <SectionPage kind="erp" title="محصول جدید">
      <ProductForm
        categories={categories.map((c) => ({ id: c.id, nameFa: c.nameFa }))}
        ingredients={ingredients.map((i) => ({ id: i.id, nameFa: i.nameFa, unit: i.unit }))}
        allergens={allergens.map((a) => ({ id: a.id, nameFa: a.nameFa, icon: a.icon }))}
        coffeeLines={coffeeLines.map((l) => ({ id: l.id, nameFa: l.nameFa }))}
      />
    </SectionPage>
  );
}
