import { prisma } from "@/lib/db";
import { AllergensAdmin } from "@/components/admin/AllergensAdmin";
import { SectionPage } from "@/components/admin/dashboard/SectionPage";

export const dynamic = "force-dynamic";

export default async function AdminAllergensPage() {
  const allergens = await prisma.allergen.findMany({
    orderBy: { nameFa: "asc" },
    include: { _count: { select: { products: true, users: true } } },
  });
  return (
    <SectionPage kind="erp" title="آلرژن‌ها" exclude="/admin/allergens">
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
    </SectionPage>
  );
}