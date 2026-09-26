import { prisma } from "@/lib/db";
import { CategoriesAdmin } from "@/components/admin/CategoriesAdmin";
import { requireOwnerPage } from "@/lib/admin-page-access";

export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  await requireOwnerPage();
  const categories = await prisma.category.findMany({
    orderBy: { order: "asc" },
    include: { _count: { select: { products: true } } },
  });
  return (
    <div className="max-w-2xl">
      <h1 className="heading-section mb-6">دسته‌ها</h1>
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
    </div>
  );
}