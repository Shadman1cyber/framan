import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import { isOwner } from "@/lib/constants";

export const dynamic = "force-dynamic";

const createSchema = z.object({ title: z.string().trim().min(1).max(80).optional() }).strict();

/**
 * Conversation list (R02). Only the caller's own sessions are returned.
 * Ownerless legacy sessions appear in a separately labelled archive section
 * for OWNER holders only, always read-only, and are never implicitly claimed.
 */
export async function GET() {
  const g = await guard("ai.use");
  if ("res" in g) return g.res;
  const [sessions, legacyCount] = await Promise.all([
    prisma.aIChatSession.findMany({
      where: { ownerId: g.user.id, archived: false },
      orderBy: { updatedAt: "desc" }, take: 50,
      include: { _count: { select: { messages: true } } },
    }),
    isOwner(g.user.role)
      ? prisma.aIChatSession.count({ where: { ownerId: null } })
      : Promise.resolve(0),
  ]);
  return NextResponse.json({
    sessions: sessions.map(s => ({
      id: s.id, title: s.title, messageCount: s._count.messages,
      createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString(),
      archived: s.archived, legacy: false,
    })),
    legacyArchiveCount: legacyCount,
  });
}

export async function POST(req: Request) {
  const g = await guard("ai.use");
  if ("res" in g) return g.res;
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
  const session = await prisma.aIChatSession.create({
    data: { ownerId: g.user.id, userId: g.user.id, ...(parsed.data.title ? { title: parsed.data.title } : {}) },
  });
  return NextResponse.json({ session: { id: session.id, title: session.title } });
}
