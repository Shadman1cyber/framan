import { ModulePage } from "@/components/admin/dashboard/ModulePage";
import { BarsCard } from "@/components/admin/dashboard/charts/BarsCard";
import { MetersCard } from "@/components/admin/dashboard/charts/MetersCard";
import { InventoryAlertCard } from "@/components/admin/dashboard/InventoryAlertCard";
import { ActivityCard } from "@/components/admin/dashboard/ActivityCard";
import { MODULE_SECTIONS } from "@/lib/dashboard/modules";

export const dynamic = "force-dynamic";

/** Every chart below reads `data-theme="erp"` → blue. No color prop here. */
export default function ErpModulePage() {
  return (
    <ModulePage
      kind="erp"
      related={MODULE_SECTIONS.erp}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <BarsCard
          title="سطح موجودی انبار"
          data={[
            { label: "فروردین", value: 86, display: "۸۶" },
            { label: "اردیبهشت", value: 78, display: "۷۸" },
            { label: "خرداد", value: 71, display: "۷۱" },
            { label: "تیر", value: 64, display: "۶۴" },
            { label: "مرداد", value: 57, display: "۵۷" },
            { label: "شهریور", value: 49, display: "۴۹" },
          ]}
        />
        <MetersCard
          title="وضعیت تأمین"
          items={[
            { label: "قهوه", value: 48, display: "۴۸٪" },
            { label: "شیر", value: 33, display: "۳۳٪" },
            { label: "لیوان", value: 21, display: "۲۱٪" },
          ]}
        />
        <InventoryAlertCard />
        <ActivityCard />
      </div>
    </ModulePage>
  );
}
