import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/guards";
import { getEnabledCashierTabs } from "@/lib/cashier-access";
import { getLeaveDeadlineHours } from "@/lib/operations";
import { StaffPanelClient } from "@/components/admin/StaffPanelClient";
import { CashierLeavesClient } from "@/components/admin/CashierLeavesClient";
import { SectionPage } from "@/components/admin/dashboard/SectionPage";

export const dynamic = "force-dynamic";

/** پرسنل + مرخصی‌ها on one page; the leave block keeps its own permission. */
export default async function AdminStaffPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  const isOwner = user.role === "OWNER";
  const enabled = isOwner ? [] : await getEnabledCashierTabs();
  const canManageStaff = isOwner;
  const canSeeLeaves = isOwner || enabled.includes("leaves");
  if (!canManageStaff && !canSeeLeaves) redirect("/admin/no-access");

  const [staff, leaves, deadlineH] = await Promise.all([
    prisma.staff.findMany({ orderBy: { name: "asc" } }),
    canSeeLeaves
      ? prisma.staffLeave.findMany({
          include: { staff: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 100,
        })
      : Promise.resolve([]),
    canSeeLeaves ? getLeaveDeadlineHours().catch(() => 48) : Promise.resolve(48),
  ]);

  return (
    <SectionPage
      kind="erp"
      title="پرسنل و مرخصی‌ها"
      exclude="/admin/staff"
      description="مدیریت پرسنل، حضور و غیاب، مرخصی، گزارش کار و پیشنهاد نیرو — همه در یک جا."
    >
      {canManageStaff && (
        <StaffPanelClient
          initialStaff={staff.map((s) => ({
            id: s.id, name: s.name, role: s.role, task: s.task,
            shiftStart: s.shiftStart, shiftEnd: s.shiftEnd, isActive: s.isActive,
          }))}
        />
      )}
      {canSeeLeaves && (
        <div className="mt-5 border-t border-dashboard-line pt-5">
          <CashierLeavesClient
            initialStaff={staff.map((s) => ({
              id: s.id, name: s.name, role: s.role, task: s.task, isActive: s.isActive,
            }))}
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
      )}
    </SectionPage>
  );
}
