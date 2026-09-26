import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/guards";
import { getEnabledCashierTabs } from "@/lib/cashier-access";
import { CashierAccessAdmin } from "@/components/admin/CashierAccessAdmin";
import { DashboardShell } from "@/components/admin/dashboard/DashboardShell";

function KeyIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="8" cy="12" r="4" /><path d="M12 12h9M18 12v3.5M15.5 12v2.5" /></svg>;
}

export const dynamic = "force-dynamic";

export default async function CashierAccessPage() {
  const user = await getSessionUser();
  if (user?.role !== "OWNER") redirect("/admin");
  const enabled = await getEnabledCashierTabs();
  return (
    <DashboardShell
      title="دسترسی‌های صندوق‌دار"
      subtitle="تب‌های قابل استفاده در پنل صندوق‌دار را انتخاب کنید."
      icon={<KeyIcon />}
    >
      <div data-legacy-surface="dashboard">
        <CashierAccessAdmin initial={enabled} />
      </div>
    </DashboardShell>
  );
}
