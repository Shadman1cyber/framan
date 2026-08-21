"use server";

import { requireSession } from "@/lib/auth";
import { runCommand } from "@/lib/agents/command";
import { revalidatePath } from "next/cache";

export async function runCommandAction(
  text: string
): Promise<{ ok: boolean; error?: string; result?: unknown }> {
  const session = await requireSession();
  const t = String(text ?? "").trim();
  if (t.length < 3) return { ok: false, error: "Type a command first." };
  if (t.length > 500) return { ok: false, error: "Command too long." };

  const result = await runCommand(session.companyId, session.id, t);
  revalidatePath("/ai/activity");
  return { ok: true, result };
}
