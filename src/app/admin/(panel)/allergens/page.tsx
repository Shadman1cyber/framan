import { prisma } from "@/lib/db";
import { AllergensAdmin } from "@/components/admin/AllergensAdmin";
import { requireOwnerPage } from "@/lib/admin-page-access";

export const dynamic = "force-dynamic";

export default async function AdminAllergensPage() {
  await requireOwnerPage();
  const allergens = await prisma.allergen.findMany({
    orderBy: { nameFa: "asc" },
    include: { _count: { select: { products: true, users: true } } },
  });
  return (
    <div className="max-w-2xl">
      <h1 className="heading-section mb-6">آلرژن‌ها</h1>
      <AllergensAdmin
        initial={allergens.map((a) => ({
          id: a.id,
          key: a.key,
          nameFa: a.nameFa,
          nameEn: a.nameEn,
          icon: a.icon,
          productCount: a._count.products,
          userCount: a._count.users,
        }))}
      />
    </div>
  );
}