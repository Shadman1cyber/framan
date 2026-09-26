import { prisma } from "@/lib/db";
import { StaffPanelClient } from "@/components/admin/StaffPanelClient";
import { requireOwnerPage } from "@/lib/admin-page-access";

export const dynamic = "force-dynamic";

export default async function AdminStaffPage() {
  await requireOwnerPage();

  const staff = await prisma.staff.findMany({
    include: {
      shiftRotation: {
        include: { slots: { orderBy: { position: "asc" } } },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-medium tracking-wide text-muted">کافه ۱۳ · پنل مدیر</p>
        <h1 className="heading-section mt-1">پرسنل</h1>
        <p className="mt-1 text-sm text-muted">
          مدیریت پرسنل، حضور و غیاب، مرخصی، گزارش کار و پیشنهاد نیرو — همه در یک جا.
        </p>
      </div>
      <StaffPanelClient
        initialStaff={staff.map((s) => ({
          id: s.id, name: s.name, role: s.role, task: s.task,
          shiftStart: s.shiftStart, shiftEnd: s.shiftEnd, isActive: s.isActive,
          shiftRotation: s.shiftRotation
            ? {
                id: s.shiftRotation.id,
                isEnabled: s.shiftRotation.isEnabled,
                startDate: s.shiftRotation.startDate,
                slots: s.shiftRotation.slots.map((slot) => ({
                  id: slot.id,
                  position: slot.position,
                  label: slot.label,
                  shiftStart: slot.shiftStart,
                  shiftEnd: slot.shiftEnd,
                })),
              }
            : null,
        }))}
      />
    </div>
  );
}
