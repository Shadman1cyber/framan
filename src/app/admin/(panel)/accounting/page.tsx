import { ModulePage } from "@/components/admin/dashboard/ModulePage";
import { BarsCard } from "@/components/admin/dashboard/charts/BarsCard";
import { SalesCard } from "@/components/admin/dashboard/SalesCard";
import { OverduePaymentsCard } from "@/components/admin/dashboard/OverduePaymentsCard";
import { ActivityCard } from "@/components/admin/dashboard/ActivityCard";

export const dynamic = "force-dynamic";

/** Every chart below reads `data-theme="accounting"` → teal. No color prop here. */
export default function AccountingModulePage() {
  return (
    <ModulePage
      kind="accounting"
      related={[
        { href: "/admin/financial?tab=summary", label: "گزارش مالی", icon: "💰" },
        { href: "/admin/sales-flow", label: "جریان فروش", icon: "📈" },
      ]}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <BarsCard
          title="درآمد ۶ ماه گذشته"
          data={[
            { label: "فروردین", value: 18, display: "۱۸" },
            { label: "اردیبهشت", value: 24, display: "۲۴" },
            { label: "خرداد", value: 21, display: "۲۱" },
            { label: "تیر", value: 32, display: "۳۲" },
            { label: "مرداد", value: 29, display: "۲۹" },
            { label: "شهریور", value: 38, display: "۳۸" },
          ]}
        />
        <SalesCard />
        <OverduePaymentsCard />
        <ActivityCard />
      </div>
    </ModulePage>
  );
}
