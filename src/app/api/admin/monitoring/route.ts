import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Owner-only monitoring status (R10): reports OpenObserve wiring and the
 * durable outbox state without exposing credentials or telemetry content.
 */
export async function GET() {
  const g = await guard("ai.use");
  if ("res" in g) return g.res;
  const [pending, exported] = await Promise.all([
    prisma.agentEvent.count({ where: { exportedAt: null } }),
    prisma.agentEvent.count({ where: { exportedAt: { not: null } } }),
  ]);
  const configured = Boolean(process.env.OPENOBSERVE_TRACES_URL && process.env.OPENOBSERVE_AUTHORIZATION);
  return NextResponse.json({
    openobserve: {
      configured,
      dashboardUrl: process.env.OPENOBSERVE_DASHBOARD_URL || (process.env.OPENOBSERVE_TRACES_URL ? new URL(process.env.OPENOBSERVE_TRACES_URL).origin : ""),
      tracesEndpointConfigured: Boolean(process.env.OPENOBSERVE_TRACES_URL),
      authorizationConfigured: Boolean(process.env.OPENOBSERVE_AUTHORIZATION),
    },
    outbox: { pending, exported },
  });
}