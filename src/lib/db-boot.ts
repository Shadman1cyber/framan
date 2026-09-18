import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { ensureSqliteDir } from "./db";

let ready: Promise<void> | null = null;

/** Walk up from cwd to find the project root (dir containing prisma/schema.prisma). */
function findProjectRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, "prisma", "schema.prisma"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function run(cmd: string, args: string[], root: string, timeoutMs: number): boolean {
  const r = spawnSync(cmd, args, {
    cwd: root,
    env: process.env,
    timeout: timeoutMs,
    stdio: "pipe",
    encoding: "utf-8",
  });
  if (r.status === 0) return true;
  console.error(
    `[db-boot] ${cmd} ${args.join(" ")} failed` +
      (r.error ? `: ${String(r.error)}` : r.stderr ? `: ${String(r.stderr).slice(-500)}` : ""),
  );
  return false;
}

async function boot() {
  // Never mutate the DB while Next is only building the production bundle.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (!process.env.DATABASE_URL) {
    console.error("[db-boot] DATABASE_URL is not set — skipping self-heal.");
    return;
  }
  ensureSqliteDir();

  const checker = new PrismaClient({ log: ["error"] });
  try {
    const tables = await checker.$queryRawUnsafe<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('Category','Product','Allergen','User')",
    );
    if (tables.length === 4) return; // schema present — nothing to do
    console.error(`[db-boot] missing tables (${tables.length}/4) — running prisma db push...`);
  } catch (err) {
    // Empty/corrupt/unreadable file (P2021, code 14, …) — push will recreate.
    console.error(`[db-boot] DB check failed (${(err as Error).message.slice(0, 120)}) — running prisma db push...`);
  } finally {
    await checker.$disconnect().catch(() => {});
  }

  const root = findProjectRoot();
  const schema = path.join(root, "prisma", "schema.prisma");
  if (!run("npx", ["prisma", "db", "push", "--skip-generate", "--schema", schema], root, 120_000)) return;

  // Seed only a truly empty DB — seed.ts wipes first (deleteMany), so this
  // gate must never pass on a database that already holds business data.
  const seeder = new PrismaClient({ log: ["error"] });
  try {
    const [users, products, categories] = await Promise.all([
      seeder.user.count(),
      seeder.product.count(),
      seeder.category.count(),
    ]);
    if (users === 0 && products === 0 && categories === 0) {
      console.error("[db-boot] empty DB after push — seeding demo data...");
      run("npx", ["tsx", "prisma/seed.ts"], root, 300_000);
    } else {
      console.error(`[db-boot] schema ready (users=${users}, products=${products}) — skipping seed.`);
    }
  } catch (err) {
    console.error(`[db-boot] post-push check failed: ${(err as Error).message}`);
  } finally {
    await seeder.$disconnect().catch(() => {});
  }
}

/** Idempotent boot-time self-heal. Never throws — worst case logs and serves. */
export function ensureDatabaseReady(): Promise<void> {
  if (!ready) ready = boot().catch((err) => console.error(`[db-boot] unexpected: ${String(err)}`));
  return ready;
}
