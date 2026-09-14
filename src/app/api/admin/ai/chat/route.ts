import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import { aiService } from "@/lib/ai/service";
import type { AiTopic } from "@/lib/ai/context";

export const dynamic = "force-dynamic";

const schema = z.object({
  question: z.string().min(2).max(1000),
  topic: z.enum(["general", "finance", "inventory", "operations"]).optional(),
  sessionId: z.string().optional().nullable(),
});

function titleFrom(question: string): string {
  const t = question.trim().replace(/\s+/g, " ");
  return t.length > 42 ? `${t.slice(0, 42)}…` : t;
}

/**
 * Ask the AI assistant. Owner-only (Rule 24). Ownership-corrected (R02):
 * - every existing session is checked: must exist, be owned by the caller and
 *   not archived; ownerless sessions are read-only legacy archives;
 * - the model context uses the LAST 50 messages in chronological order
 *   (bounded recent window), never the outdated "first 50" slice;
 * - new sessions are created with ownerId so history stays per-user.
 */
export async function POST(req: Request) {
  const g = await guard("ai.use");
  if ("res" in g) return g.res;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });

  const { question, topic } = parsed.data;
  let sessionId = parsed.data.sessionId ?? null;
  let history: Array<{ role: "user" | "assistant"; content: string }> = [];

  if (sessionId) {
    const session = await prisma.aIChatSession.findUnique({ where: { id: sessionId } });
    if (!session) return NextResponse.json({ error: "گفتگو یافت نشد" }, { status: 404 });
    if (session.ownerId === null) return NextResponse.json({ error: "LEGACY_SESSION_READ_ONLY" }, { status: 403 });
    if (session.ownerId !== g.user.id) return NextResponse.json({ error: "گفتگو یافت نشد" }, { status: 404 });
    if (session.archived) return NextResponse.json({ error: "SESSION_ARCHIVED" }, { status: 409 });
    // R02 fix: bounded recent window — last 50 turns, chronological order.
    const recent = await prisma.aIChatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    history = recent.reverse().map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
  }

  const result = await aiService.ask(question, topic as AiTopic | undefined, history);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }

  if (!sessionId) {
    const session = await prisma.aIChatSession.create({
      data: { userId: g.user.id, ownerId: g.user.id, title: titleFrom(question) },
    });
    sessionId = session.id;
  }
  const now = Date.now();
  await prisma.aIChatMessage.createMany({
    // Explicit distinct timestamps: both rows would otherwise share the same
    // millisecond and the session route's `orderBy createdAt desc` tie-break
    // could render the answer ABOVE its own question.
    data: [
      { sessionId, role: "user", content: question, createdAt: new Date(now) },
      { sessionId, role: "assistant", content: result.answer, createdAt: new Date(now + 1) },
    ],
  });
  await prisma.aIChatSession.update({ where: { id: sessionId }, data: { updatedAt: new Date() } });

  return NextResponse.json({ answer: result.answer, model: result.model, sessionId });
}
