import { NextResponse } from "next/server";
import { actor, body, failure, reply, runtime as agent } from "@/lib/agent/http";
import { controlSchema } from "@/lib/agent/contracts";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try { return NextResponse.json({ run: await agent.get(await actor(), params.id) }); } catch (e) { return failure(e); }
}
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try { const user = await actor(); const input = controlSchema.parse(await body(req)); return await reply(await agent.control(user, params.id, input.action, input.inputHash, input.note, input.subtask)); } catch (e) { return failure(e); }
}
