import type { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";

/**
 * Durable outbox to OpenObserve OTLP/HTTP (R10). Only allowlisted metadata
 * leaves the app: run/tool/state names, measured durations, provider-reported
 * token counts. No prompts, inputs, results, user IDs, credentials or private
 * reasoning. HTTP is allowed for localhost/127.0.0.1 AND the explicitly
 * configured internal Compose hostname (OPENOBSERVE_INTERNAL_HOST) — never
 * for arbitrary insecure destinations.
 */

const internalHost = () => process.env.OPENOBSERVE_INTERNAL_HOST?.trim();

function endpointAllowed(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol === "https:") return true;
    if (url.protocol !== "http:") return false;
    if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return true;
    // Narrow exception: the explicitly configured internal Compose hostname.
    const configured = internalHost();
    return Boolean(configured) && url.hostname === configured;
  } catch { return false; }
}

export async function flushTelemetry(db: PrismaClient) {
  const endpoint = process.env.OPENOBSERVE_TRACES_URL;
  const authorization = process.env.OPENOBSERVE_AUTHORIZATION;
  if (!endpoint || !authorization) return { sent: 0, pending: true };
  if (!endpointAllowed(endpoint)) return { sent: 0, pending: true };
  const events = await db.agentEvent.findMany({
    where: { exportedAt: null }, take: 50, orderBy: { createdAt: "asc" },
    include: { run: { select: { traceId: true, tool: true, skillVersion: true } } },
  });
  if (!events.length) return { sent: 0, pending: false };
  // Adjacent same-name events bracket a measured phase (started → verified):
  // duration spans are computed from the durable event timestamps themselves.
  const spans = events.map(e => {
    const durationAttr = e.durationMs != null
      ? [{ key: "agent.duration_ms", value: { doubleValue: e.durationMs } }]
      : [];
    const usageAttrs = [
      ...(e.promptTokens != null ? [{ key: "gen_ai.usage.prompt_tokens", value: { intValue: e.promptTokens } }] : []),
      ...(e.completionTokens != null ? [{ key: "gen_ai.usage.completion_tokens", value: { intValue: e.completionTokens } }] : []),
    ];
    return {
      traceId: e.run.traceId,
      spanId: createHash("sha256").update(e.id).digest("hex").slice(0, 16),
      name: e.name, kind: 1,
      startTimeUnixNano: (BigInt(e.createdAt.getTime()) * 1000000n).toString(),
      endTimeUnixNano: (BigInt(e.createdAt.getTime()) * 1000000n + BigInt(Math.max(1, e.durationMs ?? 0)) * 1000000n).toString(),
      attributes: [
        { key: "agent.run_id", value: { stringValue: e.runId } },
        { key: "agent.state", value: { stringValue: e.state } },
        { key: "agent.tool", value: { stringValue: e.run.tool } },
        ...(e.run.skillVersion ? [{ key: "agent.skill_version", value: { stringValue: e.run.skillVersion } }] : []),
        ...durationAttr, ...usageAttrs,
      ],
      status: { code: e.state === "failed" ? 2 : 0 },
    };
  });
  try {
    const res = await fetch(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: authorization },
      body: JSON.stringify({ resourceSpans: [{ resource: { attributes: [{ key: "service.name", value: { stringValue: "farman-agent" } }] }, scopeSpans: [{ scope: { name: "farman.agent", version: "2" }, spans }] }] }),
      signal: AbortSignal.timeout(2000), redirect: "error",
    });
    if (!res.ok) return { sent: 0, pending: true };
    // OTLP partial rejection must not silently drop the batch.
    const body = await res.json().catch(() => null);
    if (!body || Number(body.partialSuccess?.rejectedSpans ?? 0) > 0) return { sent: 0, pending: true };
    await db.agentEvent.updateMany({ where: { id: { in: events.map(e => e.id) }, exportedAt: null }, data: { exportedAt: new Date() } });
    return { sent: events.length, pending: events.length === 50 };
  } catch { return { sent: 0, pending: true }; }
}

/**
 * Periodic outbox delivery (R10): safe to call from the worker loop. Bounded,
 * failure-retaining, never affects business state. Returns whether the queue
 * drained (more events may have been produced during delivery).
 */
export async function flushAllTelemetry(db: PrismaClient, maxBatches = 5) {
  let total = 0;
  for (let i = 0; i < maxBatches; i++) {
    const r = await flushTelemetry(db);
    total += r.sent;
    if (!r.pending || r.sent === 0) break;
  }
  return { sent: total };
}
