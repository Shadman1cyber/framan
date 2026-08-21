"use server";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { createBusinessFromIdea } from "@/lib/agents/business/setup";
import { revalidatePath } from "next/cache";

export async function createBusinessAction(
  idea: string
): Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }> {
  const session = await requireSession();
  const text = String(idea ?? "").trim();
  if (text.length < 10)
    return { ok: false, error: "Describe your business idea in a sentence or two." };
  if (text.length > 1000) return { ok: false, error: "Please keep the description under 1000 characters." };

  const business = await createBusinessFromIdea(session.companyId, text);
  revalidatePath("/business/setup");
  revalidatePath("/business/tasks");
  revalidatePath("/dashboard");
  return { ok: true, id: business.id, name: business.name };
}

export async function toggleBusinessTaskAction(
  taskId: string,
  done: boolean
): Promise<{ ok: boolean }> {
  const session = await requireSession();
  const task = await db.businessTask.findUnique({ where: { id: taskId }, include: { business: true } });
  if (!task || task.business.companyId !== session.companyId) return { ok: false };
  await db.businessTask.update({ where: { id: taskId }, data: { done } });
  revalidatePath("/business/tasks");
  return { ok: true };
}
