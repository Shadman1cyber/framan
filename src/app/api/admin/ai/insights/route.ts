import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { aiInsightService } from "@/lib/ai/insights";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guard("ai.use");
  if ("res" in g) return g.res;
  const insights = await prisma.aIInsight.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return NextResponse.json({ insights });
}

/** Regenerate deterministic insights + optional AI summary. */
export async function POST() {
  const g = await guard("ai.use");
  if ("res" in g) return g.res;
  const created = await aiInsightService.refreshAndStore();
  const summary = await aiInsightService.aiSummary();
  return NextResponse.json({ created, summary });
}
