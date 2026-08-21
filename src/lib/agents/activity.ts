import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { AgentKey } from "@/lib/domain";

// Central audit trail helper — every meaningful agent action lands here.

export async function logActivity(opts: {
  companyId: string;
  agentKey: AgentKey | "system" | "user";
  actor: string;
  action: string;
  message: string;
  level?: "info" | "success" | "warning" | "error";
  meta?: Record<string, unknown>;
  requestId?: string;
}) {
  await db.activityLog.create({
    data: {
      companyId: opts.companyId,
      agentKey: opts.agentKey,
      actor: opts.actor,
      action: opts.action,
      message: opts.message,
      level: opts.level ?? "info",
      metaJson: (opts.meta as Prisma.InputJsonValue) ?? undefined,
      requestId: opts.requestId,
    },
  });
}

export async function setAgentStatus(
  key: AgentKey,
  status: "idle" | "working" | "waiting" | "error",
  currentTask?: string | null
) {
  await db.agent.update({
    where: { key },
    data: {
      status,
      currentTask: currentTask ?? null,
      lastActiveAt: new Date(),
    },
  });
}

export async function bumpAgentTasks(key: AgentKey, by = 1) {
  const agent = await db.agent.findUnique({ where: { key } });
  if (agent)
    await db.agent.update({ where: { key }, data: { tasksRun: agent.tasksRun + by } });
}
