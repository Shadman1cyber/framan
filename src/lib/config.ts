import os from "os";

/**
 * Central application configuration.
 * The port must never be hardcoded in individual places; always read from here.
 */

export const APP_PORT = Number(process.env.PORT ?? 3080) || 3080;

export const DEFAULT_HOST = process.env.HOST ?? "0.0.0.0";

/** Base URL of the app itself (auth callbacks, server-side absolute links). */
export function getAppBaseUrl(): string {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL.replace(/\/$/, "");
  return `http://localhost:${APP_PORT}`;
}

/**
 * Base URL that QR codes should point to.
 * Priority:
 *  1. PUBLIC_APP_URL (explicit configuration, always wins)
 *  2. Auto-detected LAN IP (convenience for development)
 */
export function getPublicAppUrl(): string {
  const explicit = process.env.PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const ip = detectLanIp();
  if (ip) return `http://${ip}:${APP_PORT}`;
  return getAppBaseUrl();
}

export function detectLanIp(): string | null {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const nets = interfaces[name] ?? [];
    for (const net of nets) {
      if (net.family !== "IPv4" || net.internal) continue;
      // Prefer typical private ranges
      if (
        net.address.startsWith("192.168.") ||
        net.address.startsWith("10.") ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(net.address)
      ) {
        return net.address;
      }
    }
  }
  return null;
}

/** AI configuration. AI is opt-in and must never be hardcoded on. */
export function aiEnvEnabled(): boolean {
  return (process.env.AI_ENABLED ?? "false").toLowerCase() === "true";
}

export const AI_PROVIDER = (process.env.AI_PROVIDER ?? "zhipu").toLowerCase();
export const AI_MODEL = process.env.AI_MODEL ?? "glm-4";
