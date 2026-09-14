import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ImportAdmin } from "@/components/admin/ImportAdmin";

export const dynamic = "force-dynamic";

export default async function AdminImportPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "OWNER" && role !== "ADMIN") redirect("/admin");

  const jobs = await prisma.importJob.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  return (
    <div className="max-w-3xl">
      <h1 className="heading-section mb-2">درون‌ریزی داده از سیستم‌های حسابداری</h1>
      <p className="mb-6 text-sm text-muted">
        فایل CSV را انتخاب کنید؛ سیستم ستون‌ها را تشخیص می‌دهد، ردیف‌ها را اعتبارسنجی و پیش‌نمایش
        می‌کند و پس از تایید شما داده‌ها را وارد می‌کند.
      </p>
      <ImportAdmin
        initialJobs={jobs.map((j) => ({
          id: j.id,
          kind: j.kind,
          status: j.status,
          createdAt: j.createdAt.toISOString(),
          report: j.report,
        }))}
      />
    </div>
  );
}
