import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { InventoryAdmin } from "@/components/admin/InventoryAdmin";
import { SectionPage } from "@/components/admin/dashboard/SectionPage";

export const dynamic = "force-dynamic";

export default async function AdminInventoryPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "OWNER" && role !== "ADMIN") redirect("/admin");

  const ingredients = await prisma.ingredient.findMany({
    orderBy: [{ isActive: "desc" }, { nameFa: "asc" }],
    include: { _count: { select: { products: true } } },
  });
  return (
    <SectionPage
      kind="erp"
      title="انبار مواد اولیه"
      exclude="/admin/inventory"
      description="موجودی، واحد اندازه‌گیری، حداقل مجاز، قیمت واحد و تامین‌کننده‌ی هر ماده را مدیریت کنید. مقادیر مصرف محصولات از فرم محصول قابل ویرایش است."
    >
      <InventoryAdmin
        initial={ingredients.map((i) => ({
          id: i.id,
          nameFa: i.nameFa,
          unit: i.unit,
          stockQuantity: i.stockQuantity,
          minQuantity: i.minQuantity,
          costPerUnit: i.costPerUnit,
          supplier: i.supplier,
          isAllergen: i.isAllergen,
          isActive: i.isActive,
          productCount: i._count.products,
        }))}
      />
    </SectionPage>
  );
}
