import { NextResponse } from "next/server";
import { z } from "zod";
import { actor, body, failure, reply, runtime as agent } from "@/lib/agent/http";

export const dynamic = "force-dynamic";

const schema = z.object({ slug: z.string().trim().regex(/^[a-z0-9-]{3,40}$/) }).strict();

/** Execute an ACTIVE skill version through the governed run path (R08). */
export async function POST(req: Request) {
  try {
    const user = await actor();
    const input = schema.parse(await body(req));
    return await reply(await agent.executeSkill(user, input.slug));
  } catch (e) { return failure(e); }
}