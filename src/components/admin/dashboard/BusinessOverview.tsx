import { ModuleRing } from "./ModuleChart";

type ModuleData = { kind: "erp" | "accounting" | "crm"; label: string; subtitle: string; percent: number; stats: Array<{ label: string; value: string; status: string; tone: "green" | "yellow" | "red" | "blue" }>; href: string; buttonLabel: string };

export function BusinessOverview({ erp, accounting, crm }: { erp: ModuleData; accounting: ModuleData; crm: ModuleData }) {
  return <section aria-label="سه ماژول اصلی" className="mb-4"><div dir="ltr" className="grid items-center gap-4 md:grid-cols-[minmax(0,1.34fr)_minmax(19rem,1fr)_minmax(0,1.34fr)] md:gap-5"><div className="order-2 min-w-0 md:order-1"><ModuleRing {...erp} /></div><div className="order-1 min-w-0 md:order-2"><ModuleRing {...accounting} featured /></div><div className="order-3 min-w-0 md:order-3"><ModuleRing {...crm} /></div></div></section>;
}
