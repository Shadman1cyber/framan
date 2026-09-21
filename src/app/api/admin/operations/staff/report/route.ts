import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { getStaffMonthReport } from "@/lib/operations";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await guard("staff.manage");
  if ("res" in g) return g.res;
  const { searchParams } = new URL(req.url);
  const staffId = searchParams.get("staffId");
  const month = searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  if (!staffId) return NextResponse.json({ error: "staffId الزامی است" }, { status: 400 });
  try {
    return NextResponse.json(await getStaffMonthReport(staffId, month));
  } catch {
    return NextResponse.json({ error: "گزارش یافت نشد (ماه YYYY-MM)" }, { status: 400 });
  }
}
