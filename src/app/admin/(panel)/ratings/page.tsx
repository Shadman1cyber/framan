import { prisma } from "@/lib/db";
import { RatingsAdmin } from "@/components/admin/RatingsAdmin";
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
    <div>
      <h1 className="heading-section mb-6">امتیازها</h1>
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
    </div>
  );
}
