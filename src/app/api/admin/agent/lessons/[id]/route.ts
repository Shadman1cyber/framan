import { NextResponse } from "next/server";
import { actor, body, failure } from "@/lib/agent/http";
import { runtime as agent } from "@/lib/agent/http";
import { lessonControlSchema } from "@/lib/agent/contracts";
export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await actor();
    const input = lessonControlSchema.parse(await body(req));
    return NextResponse.json({ lesson: await agent.controlLesson(user, params.id, input.action) });
  } catch (e) { return failure(e); }
}
