import { ActivityCard } from "./ActivityCard";
import { InventoryAlertCard } from "./InventoryAlertCard";
import { OverduePaymentsCard } from "./OverduePaymentsCard";
import { SalesCard } from "./SalesCard";

export function BottomOverview() {
  return <section aria-label="خلاصه کسب‌وکار" dir="rtl" className="mt-[48px] grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.11fr_1fr_1fr_1.11fr] xl:gap-5"><ActivityCard /><OverduePaymentsCard /><InventoryAlertCard /><SalesCard /></section>;
}
