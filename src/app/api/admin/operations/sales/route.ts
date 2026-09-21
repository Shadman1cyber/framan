import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { getDayDetail, getSalesDemand, parseDateRange } from "@/lib/operations";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await guard("finance.view");
  if ("res" in g) return g.res;
  const { searchParams } = new URL(req.url);
  const day = searchParams.get("day");
  if (day) {
    try {
      return NextResponse.json(await getDayDetail(day));
    } catch {
      return NextResponse.json({ error: "تاریخ نامعتبر است (YYYY-MM-DD)" }, { status: 400 });
    }
  }
  let range;
  try {
    range = parseDateRange(searchParams.get("from"), searchParams.get("to"), 14);
  } catch {
    return NextResponse.json({ error: "بازهٔ تاریخ نامعتبر است" }, { status: 400 });
  }
  return NextResponse.json(await getSalesDemand(range.from, range.to));
}
