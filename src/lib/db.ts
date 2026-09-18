import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Ensure the SQLite directory exists before Prisma connects.
 * Prisma reports a missing/uncreatable file only as cryptic
 * "Error code 14: Unable to open the database file" at query time.
 * Absolute `file:` URLs (all Docker/prod deployments) are safe to
 * anchor here; relative URLs are left for Prisma's own resolution
 * (schema-dir relative) so local dev keeps working untouched.
 */
export function ensureSqliteDir() {
  const raw = process.env.DATABASE_URL;
  if (!raw?.startsWith("file:")) return;
  const p = raw.slice("file:".length).split("?")[0];
  if (!path.isAbsolute(p)) return;
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
  } catch (err) {
    console.error(
      `[db] cannot create SQLite directory ${path.dirname(p)}: ${(err as Error).message}. ` +
        `Fix the mount/permissions for DATABASE_URL=${raw}`,
    );
  }
  try {
    fs.accessSync(path.dirname(p), fs.constants.W_OK);
    if (fs.existsSync(p)) fs.accessSync(p, fs.constants.W_OK);
  } catch {
    console.error(
      `[db] SQLite path not writable: ${p} (DATABASE_URL=${raw}). ` +
        `In Docker this is usually a root-owned file in the named volume — ` +
        `fix with: docker compose exec -u root app chown -R nextjs:nodejs /app/prisma`,
    );
  }
}

ensureSqliteDir();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;