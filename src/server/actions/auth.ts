"use server";

import { db } from "@/lib/db";
import { setSessionCookie, clearSessionCookie } from "@/lib/auth";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/agents/activity";

export async function loginAction(
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email and password are required." };

  const user = await db.user.findUnique({ where: { email } });
  if (!user || user.password !== password)
    return { error: "Invalid credentials. Use the demo account shown below." };

  await setSessionCookie(user.id);
  await logActivity({
    companyId: user.companyId,
    agentKey: "user",
    actor: user.name,
    action: "login",
    message: `${user.name} signed in`,
  });
  redirect("/dashboard");
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}
