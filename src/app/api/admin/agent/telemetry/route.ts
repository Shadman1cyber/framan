import { NextResponse } from "next/server";
import { actor, body, failure, runtime as agent } from "@/lib/agent/http";
import { prisma } from "@/lib/db";
import { flushTelemetry } from "@/lib/agent/telemetry";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const user = await actor(); z.object({}).strict().parse(await body(req));
    await agent.list(user); // Fresh database OWNER permission and single-cafe scope.
    return NextResponse.json(await flushTelemetry(prisma));
  } catch (e) { return failure(e); }
}
