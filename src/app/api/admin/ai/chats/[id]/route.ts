import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import { isOwner } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * One legacy chat session. Ownership enforced (R02): a session belongs to its
 * owner; ownerless sessions are the explicitly-labelled read-only legacy
 * archive, readable only by OWNER holders and never mutated.
 */
async function loadAuthorized(id: string, userId: string, role: string) {
  const session = await prisma.aIChatSession.findUnique({ where: { id } });
  if (!session) return null;
  if (session.ownerId === null) return isOwner(role) ? session : null;
  return session.ownerId === userId ? session : null;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await guard("ai.use");
  if ("res" in g) return g.res;
  const session = await loadAuthorized(params.id, g.user.id, g.user.role);
  if (!session) return NextResponse.json({ error: "گفتگو یافت نشد" }, { status: 404 });
  const messages = await prisma.aIChatMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    session: {
      id: session.id,
      title: session.title,
      legacy: session.ownerId === null,
      ownerId: session.ownerId,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    },
  });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await guard("ai.use");
  if ("res" in g) return g.res;
  const session = await loadAuthorized(params.id, g.user.id, g.user.role);
  if (!session) return NextResponse.json({ error: "گفتگو یافت نشد" }, { status: 404 });
  if (session.ownerId === null) return NextResponse.json({ error: "LEGACY_SESSION_READ_ONLY" }, { status: 403 });
  const parsed = z.object({ title: z.string().trim().min(1).max(80).optional(), archived: z.boolean().optional() }).strict()
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
  const updated = await prisma.aIChatSession.update({
    where: { id: session.id },
    data: { ...(parsed.data.title ? { title: parsed.data.title } : {}), ...(parsed.data.archived !== undefined ? { archived: parsed.data.archived } : {}) },
  });
  return NextResponse.json({ ok: true, archived: updated.archived, title: updated.title });
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
