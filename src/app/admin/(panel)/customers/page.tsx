import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin-page-access";
import { CustomersLoyaltyAdmin } from "@/components/admin/CustomersLoyaltyAdmin";
import { SectionPage } from "@/components/admin/dashboard/SectionPage";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  await requireAdminPage("customers");
  const customers = await prisma.user.findMany({
    where: { role: "CUSTOMER" },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: {
      preferences: { where: { key: "LOYALTY_POINTS" }, take: 1 },
      _count: { select: { orders: true } },
    },
  });
  return (
    <SectionPage
      kind="crm"
      title="باشگاه مشتریان"
      exclude="/admin/customers"
      description="امتیاز مشتریان را برای خرید حضوری یا برنامه‌های وفاداری افزایش دهید."
    >
      <CustomersLoyaltyAdmin initial={customers.map((customer) => ({
        id: customer.id,
        name: customer.name ?? "مشتری بدون نام",
        email: customer.email ?? "",
        phone: customer.phone ?? "",
        points: Number(customer.preferences[0]?.value ?? 0) || 0,
        orderCount: customer._count.orders,
      }))} />
    </SectionPage>
  );
}
