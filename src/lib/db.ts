import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function buildPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL ?? "";
  const isPostgres = url.startsWith("postgres");
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    // Connection pooling for Postgres (works when DATABASE_URL includes
    // ?connection_limit=N). SQLite ignores datasource options.
    ...(isPostgres
      ? { datasourceUrl: process.env.DATABASE_URL }
      : {}),
  });
}

export const prisma =
  globalForPrisma.prisma ?? buildPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
