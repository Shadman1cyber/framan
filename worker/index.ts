import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import { AgentRuntime } from "../src/lib/agent/runtime";
import { plan } from "../src/lib/agent/planner";
import { flushAllTelemetry } from "../src/lib/agent/telemetry";

/**
 * Farman agent worker (R04): an independently supervised Node process that
 * drains the durable run queue.
 *
 * Guarantees:
 * - Atomic job claiming with a lease (SQLite conditional updateMany).
 * - Lease heartbeat while work is in flight; graceful release on shutdown.
 * - Restart recovery: reclaimExpired() returns crashed runs to the queue
 *   (their transaction rolled back, so no effect can duplicate).
 * - Model calls and file processing happen OUTSIDE database transactions;
 *   business mutations commit with their durable receipts in short transactions.
 */

const prisma = new PrismaClient();
const WORKER_ID = `${process.pid}-${randomUUID().slice(0, 8)}`;
const IDLE_MS = Number(process.env.AGENT_WORKER_IDLE_MS ?? 2000);

const runtime = new AgentRuntime(prisma, plan);
let stopping = false;

async function processOne(): Promise<boolean> {
  const run = await runtime.claimNext(WORKER_ID);
  if (!run) return false;
  console.log(`[worker] claimed ${run.id} tool=${run.tool}`);
  const heartbeat = setInterval(() => {
    runtime.heartbeat(run.id, WORKER_ID).catch(() => undefined);
  }, 15_000);
  try {
    const result = await runtime.executeClaimed(run.id, WORKER_ID);
    console.log(`[worker] finished ${run.id} state=${result.state}`);
  } catch (e) {
    console.log(`[worker] run ${run.id} not executable here: ${(e as Error).message}`);
  } finally {
    clearInterval(heartbeat);
    await flushAllTelemetry(prisma).catch(() => undefined);
  }
  return true;
}

async function main() {
  console.log(`[worker] starting id=${WORKER_ID}`);
  await runtime.reclaimExpired();
  console.log("[worker] recovery done; entering loop");
  for (;;) {
    if (stopping) break;
    try {
      const worked = await processOne();
      if (!worked) await new Promise(r => setTimeout(r, IDLE_MS));
    } catch (e) {
      console.error(`[worker] loop error: ${(e as Error).message}`);
      await new Promise(r => setTimeout(r, IDLE_MS));
    }
  }
  console.log("[worker] stopped");
}

process.on("SIGINT", () => { stopping = true; process.exit(0); });
process.on("SIGTERM", () => { stopping = true; process.exit(0); });

main().catch(e => {
  console.error("[worker] fatal", e);
  process.exit(1);
});
