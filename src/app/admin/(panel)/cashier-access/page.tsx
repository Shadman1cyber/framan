import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/guards";
import { getEnabledCashierTabs } from "@/lib/cashier-access";
import { CashierAccessAdmin } from "@/components/admin/CashierAccessAdmin";

export const dynamic = "force-dynamic";

export default async function CashierAccessPage() {
  const user = await getSessionUser();
  if (user?.role !== "OWNER") redirect("/admin");
  const enabled = await getEnabledCashierTabs();
  return (
    <div>
      <h1 className="heading-section mb-2">دسترسی‌های صندوق‌دار</h1>
      <p className="mb-6 text-sm text-muted">تب‌های قابل استفاده در پنل صندوق‌دار را انتخاب کنید.</p>
      <CashierAccessAdmin initial={enabled} />
    </div>
  );
}
