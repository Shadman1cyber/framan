import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Explicitly-labelled read-only legacy archive (R02): pre-ownership sessions
 * (ownerId NULL) are visible ONLY to OWNER holders and can never be claimed
 * or mutated by anyone. Count is surfaced so the workspace can label it.
 */
export async function GET() {
  const g = await guard("ai.use");
  if ("res" in g) return g.res;
  if (g.user.role !== "OWNER") return NextResponse.json({ sessions: [] });
  const sessions = await prisma.aIChatSession.findMany({
    where: { ownerId: null },
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: { _count: { select: { messages: true } } },
  });
  return NextResponse.json({
    sessions: sessions.map(s => ({
      id: s.id, title: s.title, messageCount: s._count.messages,
      createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString(),
      legacy: true,
    })),
  });
}
