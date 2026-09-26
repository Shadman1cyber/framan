import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { InventoryAdmin } from "@/components/admin/InventoryAdmin";
import { InventoryOperations } from "@/components/admin/InventoryOperations";
import { SectionPage } from "@/components/admin/dashboard/SectionPage";

export const dynamic = "force-dynamic";

export default async function AdminInventoryPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "OWNER" && role !== "ADMIN") redirect("/admin");

  const [ingredients, events, batches, expiredTotals] = await Promise.all([
    prisma.ingredient.findMany({ orderBy: [{ isActive: "desc" }, { nameFa: "asc" }], include: { _count: { select: { products: true } } } }),
    prisma.inventoryEvent.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { ingredient: { select: { nameFa: true } } } }),
    prisma.inventoryBatch.findMany({ where: { remainingQuantity: { gt: 0 }, expiresAt: { not: null } }, orderBy: { expiresAt: "asc" }, take: 100, include: { ingredient: { select: { nameFa: true, unit: true } } } }),
    prisma.inventoryBatch.groupBy({ by: ["ingredientId"], where: { remainingQuantity: { gt: 0 }, expiresAt: { lt: new Date() } }, _sum: { remainingQuantity: true } }),
  ]);
  const expiredByIngredient = new Map(expiredTotals.map((row) => [row.ingredientId, row._sum.remainingQuantity ?? 0]));
  const inventory = ingredients.map((i) => ({
    id: i.id, nameFa: i.nameFa, unit: i.unit, stockQuantity: i.stockQuantity,
    availableQuantity: Math.max(0, i.stockQuantity - (expiredByIngredient.get(i.id) ?? 0)),
    minQuantity: i.minQuantity, costPerUnit: i.costPerUnit, supplier: i.supplier,
    category: i.category, purchaseUnit: i.purchaseUnit, purchaseFactor: i.purchaseFactor,
    isAllergen: i.isAllergen, isActive: i.isActive, productCount: i._count.products,
  }));
  return (
    <SectionPage
      kind="erp"
      title="انبار مواد اولیه"
      exclude="/admin/inventory"
      description="موجودی، واحد اندازه‌گیری، حداقل مجاز، قیمت واحد و تامین‌کننده‌ی هر ماده را مدیریت کنید. مقادیر مصرف محصولات از فرم محصول قابل ویرایش است."
    >
      <InventoryOperations
        ingredients={inventory}
        events={events.map((e) => ({ id: e.id, ingredientName: e.ingredient.nameFa, kind: e.kind, delta: e.delta, before: e.before, after: e.after, reason: e.reason, createdAt: e.createdAt.toISOString() }))}
        batches={batches.map((b) => ({ id: b.id, ingredientName: b.ingredient.nameFa, remainingQuantity: b.remainingQuantity, unit: b.ingredient.unit, expiresAt: b.expiresAt?.toISOString() ?? null, supplier: b.supplier }))}
      />
      <div className="mt-6">
        <InventoryAdmin initial={inventory} />
      </div>
    </SectionPage>
  );
}
