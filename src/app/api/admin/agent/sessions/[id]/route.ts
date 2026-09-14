import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import { isOwner } from "@/lib/constants";
import { AgentError } from "@/lib/agent/contracts";
import { failure } from "@/lib/agent/http";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  archived: z.boolean().optional(),
}).strict();

/**
 * One conversation: read (chronological, bounded window + pagination),
 * rename, archive/unarchive. Ownership is enforced on every method.
 * Legacy ownerless sessions: readable ONLY by an OWNER, explicitly labelled,
 * and immutable (403 LEGACY_SESSION_READ_ONLY on any mutation).
 */
async function loadOwned(id: string, userId: string, role: string, messageTake: number, before?: string | null) {
  const session = await prisma.aIChatSession.findUnique({ where: { id } });
  if (!session) throw new AgentError("NOT_FOUND", 404);
  if (session.ownerId === null) {
    if (!isOwner(role)) throw new AgentError("NOT_FOUND", 404);
    return { session, legacy: true as const };
  }
  if (session.ownerId !== userId) throw new AgentError("NOT_FOUND", 404);
  return { session, legacy: false as const };
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const g = await guard("ai.use");
    if ("res" in g) return g.res;
    const url = new URL(req.url);
    const before = url.searchParams.get("before");
    const take = Math.min(Number(url.searchParams.get("take") ?? 50), 100);
    const { session, legacy } = await loadOwned(params.id, g.user.id, g.user.role, take, before);
    // Bounded recent window, chronological order (R02: never an outdated
    // "first 50" slice — take the LAST N messages ascending). The id
    // tie-breaker keeps same-millisecond rows (bulk inserts) stable.
    const total = await prisma.aIChatMessage.count({ where: { sessionId: session.id } });
    const messages = await prisma.aIChatMessage.findMany({
      where: { sessionId: session.id, ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take,
    });
    return NextResponse.json({
      session: {
        id: session.id, title: session.title, ownerId: session.ownerId, legacy,
        archived: session.archived, totalMessages: total,
        hasMore: before ? messages.length === take : total > messages.length,
      },
      messages: messages.reverse().map(m => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt.toISOString() })),
    });
  } catch (e) { return failure(e); }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const g = await guard("ai.use");
    if ("res" in g) return g.res;
    const parsed = z.object({ title: z.string().trim().min(1).max(80).optional(), archived: z.boolean().optional() }).strict().safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
    const { session, legacy } = await loadOwned(params.id, g.user.id, g.user.role, 1);
    if (legacy) return NextResponse.json({ error: "LEGACY_SESSION_READ_ONLY" }, { status: 403 });
    const updated = await prisma.aIChatSession.update({
      where: { id: session.id },
      data: { ...(parsed.data.title ? { title: parsed.data.title } : {}), ...(parsed.data.archived !== undefined ? { archived: parsed.data.archived } : {}) },
    });
    return NextResponse.json({ ok: true, id: updated.id, archived: updated.archived, title: updated.title });
  } catch (e) { return failure(e); }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await guard("ai.configure");
  if ("res" in g) return g.res;
  const session = await prisma.aIChatSession.findUnique({ where: { id: params.id } });
  if (!session) return NextResponse.json({ error: "گفتگو یافت نشد" }, { status: 404 });
  if (session.ownerId === null) return NextResponse.json({ error: "LEGACY_SESSION_READ_ONLY" }, { status: 403 });
  if (session.ownerId !== g.user.id) return NextResponse.json({ error: "گفتگو یافت نشد" }, { status: 404 });
  await prisma.aIChatSession.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
