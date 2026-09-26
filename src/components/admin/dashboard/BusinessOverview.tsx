import { ModuleRing } from "./ModuleChart";
import type { ModuleConfig } from "@/lib/dashboard/modules";

type ModuleData = ModuleConfig;

/**
 * The three rings only. Each column is a `data-theme` root, so every ring,
 * icon, arc and button inside it picks up that module's accent without a single
 * color literal at the call site.
 */
export function BusinessOverview({ erp, accounting, crm }: { erp: ModuleData; accounting: ModuleData; crm: ModuleData }) {
  return <section aria-label="سه ماژول اصلی" className="mb-4"><div dir="ltr" className="grid items-center gap-4 md:grid-cols-[minmax(0,1.34fr)_minmax(19rem,1fr)_minmax(0,1.34fr)] md:gap-5"><div data-theme={erp.kind} className="order-2 min-w-0 md:order-1"><ModuleRing {...erp} /></div><div data-theme={accounting.kind} className="order-1 min-w-0 md:order-2"><ModuleRing {...accounting} featured /></div><div data-theme={crm.kind} className="order-3 min-w-0 md:order-3"><ModuleRing {...crm} /></div></div></section>;
}
