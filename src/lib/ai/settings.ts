import { prisma } from "@/lib/db";
import { aiEnvEnabled, AI_MODEL, AI_PROVIDER } from "@/lib/config";

/**
 * AI configuration. The master switch lives in the DB (management can toggle it)
 * and falls back to the AI_ENABLED environment variable. AI is opt-in only.
 */

export type AiSettings = {
  enabled: boolean;
  provider: string;
  model: string;
  hasApiKey: boolean;
};

const AI_ENABLED_KEY = "ai.enabled";

export async function isAiEnabled(): Promise<boolean> {
  const row = await prisma.setting.findUnique({ where: { key: AI_ENABLED_KEY } });
  if (row) return row.value === "true";
  return aiEnvEnabled();
}

export async function setAiEnabled(enabled: boolean, db: Pick<typeof prisma, "setting"> = prisma): Promise<void> {
  await db.setting.upsert({
    where: { key: AI_ENABLED_KEY },
    create: { key: AI_ENABLED_KEY, value: enabled ? "true" : "false" },
    update: { value: enabled ? "true" : "false" },
  });
}

export async function getAiSettings(): Promise<AiSettings> {
  const enabled = await isAiEnabled();
  return {
    enabled,
    provider: AI_PROVIDER,
    model: AI_MODEL,
    hasApiKey: Boolean(process.env.ZHIPU_API_KEY?.trim()),
  };
}
