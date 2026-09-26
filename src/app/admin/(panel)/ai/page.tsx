import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAiSettings } from "@/lib/ai/settings";
import { AgentControls } from "@/components/admin/AgentControls";
import { AgentOperationsSummary } from "@/components/admin/AgentOperationsSummary";
import { AiAdmin } from "@/components/admin/AiAdmin";

export const dynamic = "force-dynamic";

export default async function AdminAiPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "OWNER" && role !== "ADMIN") redirect("/admin");

  const [settings, insights, sessions] = await Promise.all([
    getAiSettings(),
    prisma.aIInsight.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.aIChatSession.findMany({
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: { _count: { select: { messages: true } } },
    }),
  ]);

  return (
    <div>
      <h1 className="heading-section mb-2">دستیار هوشمند و حسابدار</h1>
      <p className="mb-6 text-sm text-muted">
        دستیار به داده‌های مالی، انبار و عملیاتی کافه دسترسی کنترل‌شده دارد؛ عملیات اجرایی محدود از پنل اجرا قابل بررسی و تأیید است.
        هر پرسش در یک گفتگو ذخیره می‌شود و می‌توانید گفتگوهای قبلی را ادامه دهید.
      </p>
      <AgentOperationsSummary />
      {process.env.AGENT_ENABLED === "true" && <AgentControls />}
      <AiAdmin
        initialSettings={settings}
        initialInsights={insights.map((i) => ({
          id: i.id,
          kind: i.kind,
          severity: i.severity,
          title: i.title,
          body: i.body,
          createdAt: i.createdAt.toISOString(),
        }))}
        initialSessions={sessions.map((s) => ({
          id: s.id,
          title: s.title,
          messageCount: s._count.messages,
          updatedAt: s.updatedAt.toISOString(),
        }))}
      />
    </div>
  );
}
