import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getSessionUser } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { AgentError } from "./contracts";
import { AgentRuntime, responseText } from "./runtime";
import { plan } from "./planner";
import { flushAllTelemetry } from "./telemetry";

export const runtime = new AgentRuntime(prisma, plan);
export async function actor() {
  const user = await getSessionUser();
  if (!user) throw new AgentError("UNAUTHENTICATED", 401);
  return user.id;
}
function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const allowed = new Set<string>();
  for (const value of [process.env.NEXTAUTH_URL, process.env.PUBLIC_APP_URL]) {
    try {
      if (value) allowed.add(new URL(value).origin);
    } catch {
      continue;
    }
  }
  try {
    const requestUrl = new URL(req.url);
    allowed.add(requestUrl.origin);
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    const protocol = req.headers.get("x-forwarded-proto") || requestUrl.protocol.replace(":", "");
    if (host) allowed.add(`${protocol}://${host}`);
  } catch {
    return false;
  }
  return allowed.has(origin);
}

export async function body(req: Request) {
  if (!isAllowedOrigin(req)) throw new AgentError("INVALID_ORIGIN", 403);
  if (req.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new AgentError("JSON_REQUIRED", 415);
  const reader = req.body?.getReader();
  if (!reader) throw new AgentError("INVALID_INPUT", 400);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 8192) { await reader.cancel(); throw new AgentError("INPUT_TOO_LARGE", 413); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (e) { if (e instanceof AgentError) throw e; throw new AgentError("INVALID_INPUT", 400); }
}
export function failure(e: unknown) {
  if (e instanceof AgentError) return NextResponse.json({ error: e.code }, { status: e.status });
  if (e instanceof ZodError) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  return NextResponse.json({ error: "EXECUTION_UNAVAILABLE_RETRY_SAME_KEY" }, { status: 503 });
}
export async function reply(run: Awaited<ReturnType<AgentRuntime["create"]>>) {
  // A telemetry failure must never turn a committed write into an HTTP failure.
  await flushAllTelemetry(prisma).catch(() => undefined);
  return NextResponse.json({ run, answer: responseText(run) });
}
