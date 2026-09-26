import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { getInventoryStatus } from "@/lib/analytics";
import { suggestStaffPerHour } from "@/lib/operations";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guard("staff.manage");
  if ("res" in g) return g.res;
  const to = new Date();
  const from = new Date(to.getTime() - 14 * 86400000);
  const [inventory, staffing] = await Promise.all([getInventoryStatus(), suggestStaffPerHour(from, to)]);
  return NextResponse.json({
    asOf: to.toISOString(),
    lowStock: inventory.filter((row) => row.isLow),
    staffing: { days: staffing.days, hours: staffing.hours.filter((hour) => hour.peak), note: staffing.note },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
