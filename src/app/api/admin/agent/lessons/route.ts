import { NextResponse } from "next/server";
import { actor, body, failure, runtime as agent } from "@/lib/agent/http";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const topic = url.searchParams.get("topic") ?? undefined;
    return NextResponse.json({ lessons: await agent.listLessons(await actor(), { includeDrafts: Boolean(url.searchParams.get("drafts")), topic: topic && topic.length >= 2 && topic.length <= 60 ? topic : undefined }) });
  } catch (e) { return failure(e); }
}
export async function POST(req: Request) {
  try { return NextResponse.json({ lesson: await agent.proposeLesson(await actor(), await body(req)) }); } catch (e) { return failure(e); }
}
