import { NextResponse } from "next/server";
import { actor, body, failure, runtime as agent } from "@/lib/agent/http";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const slug = new URL(req.url).searchParams.get("slug") ?? undefined;
    return NextResponse.json({ skills: await agent.listSkills(await actor(), { slug: slug && /^[a-z0-9-]{3,40}$/.test(slug) ? slug : undefined }) });
  } catch (e) { return failure(e); }
}
export async function POST(req: Request) {
  try {
    const user = await actor();
    const input = await body(req);
    return NextResponse.json({ skill: await agent.createSkillDraft(user, input) });
  } catch (e) { return failure(e); }
}
