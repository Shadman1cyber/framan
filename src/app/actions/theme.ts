"use server";

// Dark-only app: theme APIs are kept as no-ops so existing imports don't break.

export type ThemeMode = "dark";

export async function getUserTheme(): Promise<ThemeMode> {
  return "dark";
}

export async function setUserTheme(): Promise<{ ok: boolean }> {
  return { ok: true };
}