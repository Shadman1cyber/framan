"use client";

import { usePathname } from "next/navigation";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { CashierOrderReminder } from "@/components/admin/CashierOrderReminder";
import { LeaveRequestHeader } from "@/components/admin/LeaveRequestHeader";
import type { CashierTabId } from "@/lib/cashier-tabs";

export function AdminPanelFrame({ children, role, cashierTabs, pendingLeaveCount }: { children: React.ReactNode; role: "OWNER" | "CASHIER"; cashierTabs: CashierTabId[]; pendingLeaveCount: number }) {
  const pathname = usePathname();
  const isDashboard = pathname === "/admin";

  if (isDashboard) {
    return (
      <div className="admin-shell min-h-dvh bg-walnut">
        <main className="min-w-0">
          <LeaveRequestHeader role={role} initialPendingCount={pendingLeaveCount} />
          {children}
        </main>
        <CashierOrderReminder enabled={role === "CASHIER" && cashierTabs.includes("orders")} />
      </div>
    );
  }

  return (
    <div className="admin-shell min-h-dvh bg-cream dark:bg-dark-bg">
      <div className="mx-auto flex max-w-[1600px] flex-col md:flex-row">
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
