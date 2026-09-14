import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { StaffAdmin } from "@/components/admin/StaffAdmin";

export const dynamic = "force-dynamic";

export default async function AdminStaffPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "OWNER" && role !== "ADMIN") redirect("/admin");

  const staff = await prisma.staff.findMany({ orderBy: { createdAt: "desc" } });
  return (
    <div>
      <h1 className="heading-section mb-6">پرسنل</h1>
      <StaffAdmin
        initial={staff.map((s) => ({ id: s.id, name: s.name, role: s.role, isActive: s.isActive }))}
      />
    </div>
  );
}
