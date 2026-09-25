import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { normalizeRole } from "@/lib/constants";
import { AdminPanelFrame } from "@/components/admin/AdminPanelFrame";
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
  return <AdminPanelFrame role={role} cashierTabs={cashierTabs} pendingLeaveCount={pendingLeaveCount}>{children}</AdminPanelFrame>;
}
