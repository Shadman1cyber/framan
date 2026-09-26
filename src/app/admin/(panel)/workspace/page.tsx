import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAiSettings } from "@/lib/ai/settings";
import { Workspace } from "@/components/admin/Workspace";
import { DashboardShell } from "@/components/admin/dashboard/DashboardShell";
import { BotIcon } from "@/components/admin/dashboard/ai/AiChatLocked";

export const dynamic = "force-dynamic";

/**
 * Unified AI workspace (R01). Behind the AGENT_WORKSPACE feature flag for a
 * controlled local rollout; the legacy /admin/ai page remains unchanged when
 * the flag is off. Owner-only surface.
 */
export default async function AdminWorkspacePage() {
  // Feature flag (R11): the unified workspace rolls out under AGENT_WORKSPACE;
  // when off, the owner is routed to the legacy AI page.
  if (process.env.AGENT_WORKSPACE !== "true") redirect("/admin/ai");
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "OWNER" && role !== "ADMIN") redirect("/admin");

  const settings = await getAiSettings();

  return (
    <DashboardShell title="فضای کاری دستیار" icon={<BotIcon size={24} />}>
      <div data-legacy-surface="dashboard">
      <Workspace
      aiSettings={{
        enabled: settings.enabled,
        provider: settings.provider,
        model: settings.model,
        hasApiKey: settings.hasApiKey,
      }}
      featureFlags={{
        agentEnabled: process.env.AGENT_ENABLED === "true",
        telemetryConfigured: Boolean(process.env.OPENOBSERVE_TRACES_URL && process.env.OPENOBSERVE_AUTHORIZATION),
        openobserveUrl: process.env.OPENOBSERVE_DASHBOARD_URL ?? "",
      }}
      />
      </div>
    </DashboardShell>
  );
}