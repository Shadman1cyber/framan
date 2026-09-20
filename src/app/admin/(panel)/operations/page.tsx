import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { OperationsDashboard } from "@/components/admin/OperationsDashboard";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "OWNER" && role !== "ADMIN") redirect("/admin");

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-medium tracking-wide text-muted">کافه ۱۳ · پنل مدیر</p>
        <h1 className="heading-section mt-1">نیازهای عملیات</h1>
        <p className="mt-1 text-sm text-muted">
          تحلیل زمان انتظار به تب «جریان فروش» و برنامه‌ریزی نیروها به تب «پرسنل» منتقل شد.
        </p>
      </div>
      <OperationsDashboard />
    </div>
  );
}
