import { prisma } from "@/lib/db";
import { RatingsAdmin } from "@/components/admin/RatingsAdmin";

export const dynamic = "force-dynamic";

export default async function AdminRatingsPage() {
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
