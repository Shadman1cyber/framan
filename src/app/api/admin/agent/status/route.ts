import { NextResponse } from "next/server";
import { actor, failure, runtime as agent } from "@/lib/agent/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json({ status: await agent.status(await actor()) }); } catch (e) { return failure(e); }
}
