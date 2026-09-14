import { actor, failure, runtime as agent } from "@/lib/agent/http";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Durable SSE event stream (R03). Events are committed to SQLite first and
 * read with a cursor, so reconnects resume without loss: the client sends its
 * last received event id as ?cursor= and only later events stream. Ownership
 * is enforced server-side: only the caller's own runs' events are streamed.
 * The stream self-closes after ~50s; the browser EventSource reconnects and
 * resumes from the last id automatically.
 */
export async function GET(req: Request) {
  try {
    const user = await actor();
    const url = new URL(req.url);
    let cursorId = url.searchParams.get("cursor");

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        const deadline = Date.now() + 50_000;
        try {
          send("open", { cursor: cursorId ?? null });
          while (Date.now() < deadline) {
            const cursor = cursorId
              ? await (async () => {
                  const rows = await prisma.agentEvent.findMany({ where: { id: cursorId! }, take: 1, select: { createdAt: true } });
                  return rows[0] ? { createdAt: rows[0].createdAt, id: cursorId! } : undefined;
                })()
              : undefined;
            const events = await agent.events(user, cursor);
            if (events.length) {
              cursorId = events[events.length - 1].id;
              send("events", { events, cursor: cursorId });
            } else {
              send("ping", { t: Date.now() });
            }
            await new Promise(r => setTimeout(r, 1500));
          }
          send("close", { cursor: cursorId });
        } catch {
          // client gone or auth revoked; close quietly
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (e) { return failure(e); }
}
