import { prisma } from "@/lib/db";
import { UsersAdmin } from "@/components/admin/UsersAdmin";
import { requireOwnerPage } from "@/lib/admin-page-access";
import { DashboardShell } from "@/components/admin/dashboard/DashboardShell";
function UsersIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 19a6.5 6.5 0 0 1 13 0" /><circle cx="17" cy="9.5" r="2.5" /><path d="M17 14.5a5 5 0 0 1 4.5 4.5" /></svg>;
}

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  await requireOwnerPage();
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { _count: { select: { orders: true, ratings: true } } },
  });
  return (
    <DashboardShell title="کاربران" icon={<UsersIcon />}>
      <div data-legacy-surface="dashboard">
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
    </DashboardShell>
  );
}
