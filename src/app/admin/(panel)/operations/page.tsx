import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { OperationsDashboard } from "@/components/admin/OperationsDashboard";
import { DashboardShell } from "@/components/admin/dashboard/DashboardShell";
function CompassIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="m15 9-2 4.5L9 15l2-4.5L15 9Z" /></svg>;
}


export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "OWNER" && role !== "ADMIN") redirect("/admin");

  return (
    <DashboardShell
      title="نیازهای عملیات"
      subtitle="تحلیل زمان انتظار به تب «جریان فروش» و برنامه‌ریزی نیروها به تب «پرسنل» منتقل شد."
      icon={<CompassIcon />}
    >
      <div data-legacy-surface="dashboard">
        <OperationsDashboard />
      </div>
    </DashboardShell>
  );
}
