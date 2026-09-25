import { BusinessOverview } from "@/components/admin/dashboard/BusinessOverview";
import { BottomOverview } from "@/components/admin/dashboard/BottomOverview";
import { DashboardHeader } from "@/components/admin/dashboard/DashboardHeader";

export const dynamic = "force-dynamic";

const erp = {
  kind: "erp" as const,
  label: "ERP",
  subtitle: "تأمین، موجودی و عملیات",
  percent: 72,
  stats: [
    { label: "تأمین‌کنندگان", value: "۱", status: "نیاز به پیگیری", tone: "red" as const },
    { label: "موجودی", value: "۲", status: "هشدار", tone: "yellow" as const },
    { label: "خریدها", value: "۴", status: "در حال انجام", tone: "blue" as const },
  ],
  href: "/admin/inventory",
  buttonLabel: "ورود به بخش ERP",
};

const accounting = {
  kind: "accounting" as const,
  label: "حسابداری",
  subtitle: "مالی، هزینه‌ها و درآمدها",
  percent: 86,
  stats: [
    { label: "درآمدها", value: "۱۲", status: "ثبت شده", tone: "green" as const },
    { label: "هزینه‌ها", value: "۵", status: "در حال بررسی", tone: "yellow" as const },
    { label: "پرداخت‌ها", value: "۲", status: "در انتظار", tone: "red" as const },
  ],
  href: "/admin/financial",
  buttonLabel: "ورود به بخش حسابداری",
};

const crm = {
  kind: "crm" as const,
  label: "CRM",
  subtitle: "مشتریان و ارتباطات",
  percent: 68,
  stats: [
    { label: "مشتریان", value: "۲۴", status: "فعال", tone: "green" as const },
    { label: "پیگیری‌ها", value: "۷", status: "در حال انجام", tone: "yellow" as const },
    { label: "فرصت‌های فروش", value: "۳", status: "جدید", tone: "blue" as const },
  ],
  href: "/admin/customers",
  buttonLabel: "ورود به بخش CRM",
};

function CalendarIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>;
}

function MountainSilhouette() {
  return <svg viewBox="0 0 1536 230" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-[180px] w-full opacity-90 sm:bottom-[316px]" aria-hidden="true"><path d="M0 184 155 118 280 156 430 72 565 134 698 78 844 151 1001 94 1130 142 1286 64 1404 128 1536 82v148H0Z" className="fill-dashboard-mountain" /><path d="m0 184 155-66 125 38 150-84 135 62 133-56 146 73 157-57 129 48 156-78 118 64 132-46v152H0Z" className="fill-dashboard-mountain-back" opacity=".8" /></svg>;
}

export default function AdminDashboard() {
  const today = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "full", timeZone: "Asia/Tehran" }).format(new Date());
  return <div dir="rtl" lang="fa" className="relative min-h-dvh overflow-hidden bg-dashboard text-dashboard-foreground"><DashboardHeader /><MountainSilhouette /><main className="relative z-10 mx-auto max-w-[1536px] px-4 pb-5 pt-5 sm:px-6 sm:pt-6 xl:px-[43px]"><div className="mb-4 flex items-start justify-between gap-4 xl:translate-y-2"><div className="flex items-start gap-2.5"><span className="mt-2 h-2.5 w-2.5 rounded-full bg-signal-bright shadow-[0_0_12px_rgba(34,230,176,0.65)]" aria-hidden="true" /><div><h1 className="text-2xl font-bold tracking-[-0.03em] text-dashboard-foreground sm:text-3xl">صبح بخیر،</h1><p className="mt-1.5 text-xs text-dashboard-muted">در حال حاضر کسب‌وکار شما در وضعیت پایدار قرار دارد.</p></div></div><div className="mt-2 flex items-center gap-2 text-xs text-dashboard-muted"><CalendarIcon /><span>{today}</span></div></div><BusinessOverview erp={erp} accounting={accounting} crm={crm} /><BottomOverview /></main></div>;
}
