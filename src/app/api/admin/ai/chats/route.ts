import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";

export const dynamic = "force-dynamic";

/** List the caller's own AI chat sessions (history sidebar). Legacy
 *  ownerless sessions are excluded here; they live in the labelled archive
 *  surface only (/api/admin/ai/chats/legacy). */
export async function GET() {
  const g = await guard("ai.use");
  if ("res" in g) return g.res;
  const sessions = await prisma.aIChatSession.findMany({
    where: { ownerId: g.user.id, archived: false },
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: { _count: { select: { messages: true } } },
  });
  return NextResponse.json({
    sessions: sessions.map(s => ({
      id: s.id,
      title: s.title,
      messageCount: s._count.messages,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
  });
}
