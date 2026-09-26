import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { normalizeRole } from "@/lib/constants";
import { AdminPanelFrame } from "@/components/admin/AdminPanelFrame";
import { AiChatLauncher } from "@/components/admin/dashboard/AiChatLauncher";
import { getEnabledCashierTabs } from "@/lib/cashier-access";
import { getAiSettings } from "@/lib/ai/settings";
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
  // The assistant floats over every admin page for the manager; the chat
  // endpoint is owner-only and needs both the switch and a provider key.
  const ai = role === "OWNER" ? await getAiSettings().catch(() => ({ enabled: false, hasApiKey: false })) : { enabled: false, hasApiKey: false };
  const aiUsable = ai.enabled && ai.hasApiKey;
  const aiReason = !ai.enabled ? "disabled" : "key";
  return (
    <AdminPanelFrame role={role} cashierTabs={cashierTabs} pendingLeaveCount={pendingLeaveCount}>
      <>
        {children}
        {role === "OWNER" ? <AiChatLauncher usable={aiUsable} reason={aiUsable ? undefined : aiReason} /> : null}
      </>
    </AdminPanelFrame>
  );
}
