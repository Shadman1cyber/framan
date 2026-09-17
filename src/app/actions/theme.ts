"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export type ThemeMode = "light" | "dark" | "system";

export async function getUserTheme(): Promise<ThemeMode> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return "system";
  const userId = (session.user as { id?: string }).id!;
  const pref = await prisma.userPreference.findUnique({
    where: { userId_key: { userId, key: "theme" } },
  });
  return (pref?.value as ThemeMode) ?? "system";
}

export async function setUserTheme(mode: ThemeMode): Promise<{ ok: boolean }> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { ok: false };
  const userId = (session.user as { id?: string }).id!;
  await prisma.userPreference.upsert({
    where: { userId_key: { userId, key: "theme" } },
    update: { value: mode },
    create: { userId, key: "theme", value: mode },
  });
  return { ok: true };
}