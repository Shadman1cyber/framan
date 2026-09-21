import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { getProductMatrix, parseDateRange } from "@/lib/operations";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await guard("finance.view");
  if ("res" in g) return g.res;
  const { searchParams } = new URL(req.url);
  let range;
  try {
    range = parseDateRange(searchParams.get("from"), searchParams.get("to"), 30);
  } catch {
    return NextResponse.json({ error: "بازهٔ تاریخ نامعتبر است" }, { status: 400 });
  }
  const matrix = await getProductMatrix(range.from, range.to);
  return NextResponse.json(matrix);
}
