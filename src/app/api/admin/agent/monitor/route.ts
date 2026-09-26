import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guard("ai.configure");
  if ("res" in g) return g.res;
  const events = await prisma.agentMonitorEvent.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return NextResponse.json({ events }, { headers: { "Cache-Control": "private, no-store" } });
}
