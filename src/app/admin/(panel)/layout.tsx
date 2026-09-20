import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { normalizeRole } from "@/lib/constants";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { CashierOrderReminder } from "@/components/admin/CashierOrderReminder";
import { LeaveRequestHeader } from "@/components/admin/LeaveRequestHeader";
import { getEnabledCashierTabs } from "@/lib/cashier-access";
import { prisma } from "@/lib/db";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const role = normalizeRole((session?.user as { role?: string } | undefined)?.role);
  if (!session || !role || (role !== "OWNER" && role !== "CASHIER")) {
    redirect("/admin/login");
  }
  const cashierTabs = role === "CASHIER" ? await getEnabledCashierTabs() : [];
  const pendingLeaveCount = role === "OWNER"
    ? await prisma.staffLeave.count({ where: { status: "PENDING" } }).catch(() => 0)
    : 0;
  return (
    <div className="admin-shell min-h-dvh bg-cream dark:bg-dark-bg">
      {/* RTL: sidebar column renders first → appears on the right side */}
      <div className="mx-auto flex max-w-7xl flex-col md:flex-row">
        <AdminSidebar role={role} cashierTabs={cashierTabs} />
        <main className="admin-content min-w-0 max-w-full flex-1 p-4 md:p-8">
          <LeaveRequestHeader role={role} initialPendingCount={pendingLeaveCount} />
          {children}
        </main>
      </div>
      <CashierOrderReminder enabled={role === "CASHIER" && cashierTabs.includes("orders")} />
    </div>
  );
}
