import { ModulePage } from "@/components/admin/dashboard/ModulePage";
import { BarsCard } from "@/components/admin/dashboard/charts/BarsCard";
import { MetersCard } from "@/components/admin/dashboard/charts/MetersCard";
import { RingCard } from "@/components/admin/dashboard/charts/RingCard";
import { ActivityCard } from "@/components/admin/dashboard/ActivityCard";
import { MODULE_SECTIONS } from "@/lib/dashboard/modules";

export const dynamic = "force-dynamic";

/** Every chart below reads `data-theme="crm"` → purple. No color prop here. */
export default function CrmModulePage() {
  return (
    <ModulePage
      kind="crm"
      related={MODULE_SECTIONS.crm}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <BarsCard
          title="مشتریان جدید ۶ ماه گذشته"
          data={[
            { label: "فروردین", value: 9, display: "۹" },
            { label: "اردیبهشت", value: 12, display: "۱۲" },
            { label: "خرداد", value: 11, display: "۱۱" },
            { label: "تیر", value: 18, display: "۱۸" },
            { label: "مرداد", value: 21, display: "۲۱" },
            { label: "شهریور", value: 24, display: "۲۴" },
          ]}
        />
        <MetersCard
          title="قیف فروش"
          items={[
            { label: "سرنخ‌های جدید", value: 82, display: "۸۲٪" },
            { label: "پیگیری‌ها", value: 56, display: "۵۶٪" },
            { label: "فرصت‌های فروش", value: 34, display: "۳۴٪" },
          ]}
        />
        <RingCard
          title="نرخ بازگشت مشتری"
          percent={64}
          display="۶۴٪"
          label="نرخ بازگشت مشتری"
          caption="۳ ماه گذشته"
        />
        <ActivityCard />
      </div>
    </ModulePage>
  );
}
