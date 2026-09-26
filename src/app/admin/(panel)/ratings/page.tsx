import { prisma } from "@/lib/db";
import { RatingsAdmin } from "@/components/admin/RatingsAdmin";
import { SectionPage } from "@/components/admin/dashboard/SectionPage";
import { requireAdminPage } from "@/lib/admin-page-access";

export const dynamic = "force-dynamic";

export default async function AdminRatingsPage() {
  await requireAdminPage("ratings");
  const ratings = await prisma.rating.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: true, product: true },
  });
  return (
    <SectionPage kind="crm" title="امتیازها" exclude="/admin/ratings">
      <RatingsAdmin
        initial={ratings.map((r) => ({
          id: r.id,
          rating: r.rating,
          review: r.review,
          userName: r.user?.name ?? "—",
          userEmail: r.user?.email ?? "",
          productName: r.product.nameFa,
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </SectionPage>
  );
}
