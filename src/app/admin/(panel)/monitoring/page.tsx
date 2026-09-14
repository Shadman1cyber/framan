import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Owner-only monitoring page (R10): link + status of OpenObserve wiring.
 * Credentials never appear here; login values come from server-side env.
 */
export default async function MonitoringPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "OWNER" && role !== "ADMIN") redirect("/admin");

  const configured = Boolean(process.env.OPENOBSERVE_TRACES_URL && process.env.OPENOBSERVE_AUTHORIZATION);
  const dashboard = process.env.OPENOBSERVE_DASHBOARD_URL || "http://localhost:5080";

  return (
    <div>
      <h1 className="heading-section mb-2">مانیتورینگ</h1>
      <div className="card space-y-3 p-5 text-sm">
        <p>
          وضعیت OpenObserve: {configured ? <span className="font-semibold text-green-700">پیکربندی‌شده</span> : <span className="text-red-700">پیکربندی نشده (OPENOBSERVE_TRACES_URL / OPENOBSERVE_AUTHORIZATION)</span>}
        </p>
        <p className="text-xs text-muted">
          لاگین داشبورد از متغیرهای سروری ZO_ROOT_USER_EMAIL / ZO_ROOT_USER_PASSWORD خوانده می‌شود؛ مقادیر در این صفحه نمایش داده نمی‌شوند.
        </p>
        <a href={dashboard} target="_blank" rel="noreferrer" className="btn-primary inline-block">باز کردن داشبورد OpenObserve</a>
        <p className="text-xs text-muted">ردیابی‌ها با trace_id اجراها همبسته می‌شوند؛ به‌دنبال سرویس farman-agent بگردید.</p>
      </div>
    </div>
  );
}