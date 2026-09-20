import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { StaffPanelClient } from "@/components/admin/StaffPanelClient";

export const dynamic = "force-dynamic";

export default async function AdminStaffPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "OWNER" && role !== "ADMIN") redirect("/admin");

  const staff = await prisma.staff.findMany({ orderBy: { name: "asc" } });

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
        }))}
      />
    </div>
  );
}
