import { NextResponse } from "next/server";
import { actor, body, failure, runtime as agent } from "@/lib/agent/http";
import { z } from "zod";
export const dynamic = "force-dynamic";
const bodySchema = z.object({ action: z.enum(["test", "activate", "deactivate", "rollback"]) }).strict();
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await actor();
    const { action } = bodySchema.parse(await body(req));
    if (action === "test") return NextResponse.json({ skill: await agent.testSkill(user, params.id) });
    return NextResponse.json({ skill: await agent.controlSkill(user, params.id, action) });
  } catch (e) { return failure(e); }
}
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await actor();
    const skills = await agent.listSkills(user);
    const skill = skills.find(s => s.id === params.id);
    if (!skill) throw new (await import("@/lib/agent/contracts")).AgentError("NOT_FOUND", 404);
    return NextResponse.json({ skill });
  } catch (e) { return failure(e); }
}
