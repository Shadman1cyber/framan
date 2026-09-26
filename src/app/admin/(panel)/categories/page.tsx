import { prisma } from "@/lib/db";
import { CategoriesAdmin } from "@/components/admin/CategoriesAdmin";
import { SectionPage } from "@/components/admin/dashboard/SectionPage";

export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  const categories = await prisma.category.findMany({
    orderBy: { order: "asc" },
    include: { _count: { select: { products: true } } },
  });
  return (
    <SectionPage kind="erp" title="دسته‌ها" exclude="/admin/categories">
      <CategoriesAdmin
        initial={categories.map((c) => ({
          id: c.id,
          slug: c.slug,
          nameFa: c.nameFa,
          icon: c.icon,
          isActive: c.isActive,
          order: c.order,
          productCount: c._count.products,
        }))}
      />
    </SectionPage>
  );
}