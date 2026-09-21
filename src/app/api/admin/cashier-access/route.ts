import { NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/api";
import { CASHIER_TABS, setEnabledCashierTabs } from "@/lib/cashier-access";

const ids = CASHIER_TABS.map((tab) => tab.id) as [string, ...string[]];
const schema = z.object({ tabs: z.array(z.enum(ids)) });

export async function PUT(req: Request) {
  const g = await guard("users.manage");
  if ("res" in g) return g.res;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
  const tabs = await setEnabledCashierTabs(parsed.data.tabs as never);
  return NextResponse.json({ tabs });
}
