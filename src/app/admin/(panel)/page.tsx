import { BusinessOverview } from "@/components/admin/dashboard/BusinessOverview";
import { DashboardHeader } from "@/components/admin/dashboard/DashboardHeader";
import { AiChatCard } from "@/components/admin/dashboard/AiChatCard";
import { dashboardModules } from "@/lib/dashboard/modules";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAiSettings } from "@/lib/ai/settings";

export const dynamic = "force-dynamic";

function CalendarIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>;
}

function MountainSilhouette() {
  return <svg viewBox="0 0 1536 230" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-[180px] w-full opacity-90 sm:bottom-[316px]" aria-hidden="true"><path d="M0 184 155 118 280 156 430 72 565 134 698 78 844 151 1001 94 1130 142 1286 64 1404 128 1536 82v148H0Z" className="fill-dashboard-mountain" /><path d="m0 184 155-66 125 38 150-84 135 62 133-56 146 73 157-57 129 48 156-78 118 64 132-46v152H0Z" className="fill-dashboard-mountain-back" opacity=".8" /></svg>;
}

export default async function AdminDashboard() {
  const today = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "full", timeZone: "Asia/Tehran" }).format(new Date());
  // The assistant card needs three server-side facts: is it switched on, is a
  // provider key present, and may this role use it (the endpoint is owner-only).
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  const ai = await getAiSettings().catch(() => ({ enabled: false, hasApiKey: false }));
  const aiUsable = ai.enabled && ai.hasApiKey && role === "OWNER";
  const aiReason = !ai.enabled ? "disabled" : !ai.hasApiKey ? "key" : "role";

  return <div dir="rtl" lang="fa" data-shell="dashboard" className="relative min-h-dvh overflow-hidden bg-dashboard text-dashboard-foreground"><DashboardHeader /><MountainSilhouette /><main className="relative z-10 mx-auto max-w-[1536px] px-4 pb-5 pt-5 sm:px-6 sm:pt-6 xl:px-[43px]"><div className="mb-4 flex items-start justify-between gap-4 xl:translate-y-2"><div className="flex items-start gap-2.5"><span className="mt-2 h-2.5 w-2.5 rounded-full bg-signal-bright shadow-[0_0_12px_rgba(34,230,176,0.65)]" aria-hidden="true" /><div><h1 className="text-2xl font-bold tracking-[-0.03em] text-dashboard-foreground sm:text-3xl">صبح بخیر،</h1><p className="mt-1.5 text-xs text-dashboard-muted">در حال حاضر کسب‌وکار شما در وضعیت پایدار قرار دارد.</p></div></div><div className="mt-2 flex items-center gap-2 text-xs text-dashboard-muted"><CalendarIcon /><span>{today}</span></div></div><BusinessOverview erp={dashboardModules.erp} accounting={dashboardModules.accounting} crm={dashboardModules.crm} /><AiChatCard usable={aiUsable} reason={aiUsable ? undefined : aiReason} /></main></div>;
}
