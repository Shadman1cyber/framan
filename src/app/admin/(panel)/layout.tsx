import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { normalizeRole } from "@/lib/constants";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const role = normalizeRole((session?.user as { role?: string } | undefined)?.role);
  if (!session || !role || (role !== "OWNER" && role !== "CASHIER")) {
    redirect("/admin/login");
  }
  return (
    <div className="min-h-screen bg-cream dark:bg-dark-bg">
      {/* RTL: sidebar column renders first → appears on the right side */}
      <div className="mx-auto flex max-w-7xl flex-col md:flex-row">
        <AdminSidebar />
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
