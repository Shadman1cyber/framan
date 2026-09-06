import { prisma } from "@/lib/db";
import { UsersAdmin } from "@/components/admin/UsersAdmin";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { _count: { select: { orders: true, ratings: true } } },
  });
  return (
    <div>
      <h1 className="heading-section mb-6">کاربران</h1>
      <UsersAdmin
        initial={users.map((u) => ({
          id: u.id,
          name: u.name ?? "—",
          email: u.email ?? "",
          phone: u.phone ?? "",
          role: u.role,
          orderCount: u._count.orders,
          ratingCount: u._count.ratings,
          createdAt: u.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
