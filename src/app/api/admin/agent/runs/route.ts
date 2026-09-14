import { NextResponse } from "next/server";
import { actor, body, failure, reply, runtime as agent } from "@/lib/agent/http";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const sessionId = new URL(req.url).searchParams.get("sessionId") ?? undefined;
    return NextResponse.json({ runs: await agent.list(await actor(), sessionId ? { sessionId } : undefined) });
  } catch (e) { return failure(e); }
}
export async function POST(req: Request) {
  try { const user = await actor(); return await reply(await agent.create(user, await body(req))); } catch (e) { return failure(e); }
}