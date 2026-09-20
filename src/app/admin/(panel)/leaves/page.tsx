import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin-page-access";
import { getLeaveDeadlineHours } from "@/lib/operations";
import { CashierLeavesClient } from "@/components/admin/CashierLeavesClient";

export const dynamic = "force-dynamic";

export default async function AdminLeavesPage() {
  await requireAdminPage("leaves");

  const [staff, leaves, deadlineH] = await Promise.all([
    prisma.staff.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true, task: true, isActive: true },
    }),
    prisma.staffLeave.findMany({
      include: { staff: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    getLeaveDeadlineHours().catch(() => 48),
  ]);

  return (
    <div>
      <p className="text-[11px] font-medium tracking-wide text-muted">کافه ۱۳ · پنل صندوق‌دار</p>
      <h1 className="heading-section mb-6 mt-1">مرخصی‌ها</h1>
      <CashierLeavesClient
        initialStaff={staff}
        initialLeaves={leaves.map((l) => ({
          id: l.id,
          staffId: l.staffId,
          type: l.type,
          from: l.from.toISOString(),
          to: l.to.toISOString(),
          status: l.status,
          reason: l.reason,
          createdAt: l.createdAt.toISOString(),
          staff: l.staff,
        }))}
        initialDeadlineH={deadlineH}
      />
    </div>
  );
}
