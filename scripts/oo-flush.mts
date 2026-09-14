import { PrismaClient } from "@prisma/client";
import { flushAllTelemetry } from "../src/lib/agent/telemetry";

const db = new PrismaClient();
const pending = await db.agentEvent.count({ where: { exportedAt: null } });
const result = await flushAllTelemetry(db);
const remaining = await db.agentEvent.count({ where: { exportedAt: null } });
const exported = await db.agentEvent.count({ where: { exportedAt: { not: null } } });
console.log(JSON.stringify({ pendingBefore: pending, sent: result.sent, pendingAfter: remaining, exportedTotal: exported }));
await db.$disconnect();