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

function run(cmd: string, args: string[], root: string, timeoutMs: number, envOverride?: Record<string, string | undefined>): boolean {
  const r = spawnSync(cmd, args, {
    cwd: root,
    env: { ...process.env, ...envOverride },
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
  const isPostgres = (process.env.DATABASE_URL ?? "").startsWith("postgres");
  try {
    // Dialect-aware presence check: sqlite_master exists only on SQLite,
    // pg_tables only on Postgres. The wrong query throws, which the catch
    // below treats as "needs push" — so pick the right one per URL.
    const tables = isPostgres
      ? await checker.$queryRawUnsafe<{ tablename: string }[]>(
          "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('Category','Product','Allergen','User')",
        )
      : await checker.$queryRawUnsafe<{ name: string }[]>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('Category','Product','Allergen','User')",
        );
    if (tables.length === 4) return; // schema present — nothing to do
    console.error(`[db-boot] missing tables (${tables.length}/4) — running prisma db push...`);
  } catch (err) {
    const msg = (err as Error).message;
    // Empty/corrupt/unreadable file (P2021, code 14, …) — push will recreate.
    // P1001 = server unreachable (wrong host, paused Supabase project,
    // bad password): push cannot help, but try once anyway then hint.
    console.error(`[db-boot] DB check failed (${msg.slice(0, 120)}) — running prisma db push...`);
    if (msg.includes("Can't reach database server")) {
      console.error(
        "[db-boot] hint: verify DATABASE_URL host/password and that the Postgres " +
          "server (e.g. Supabase project) is running and not paused. " +
          "For Supabase pooler URLs use DIRECT_URL for schema push (see below).",
      );
    }
  } finally {
    await checker.$disconnect().catch(() => {});
  }

  const root = findProjectRoot();
  const schema = path.join(root, "prisma", "schema.prisma");
  // Supabase-style split: pooled DATABASE_URL for the app, direct connection
  // for schema changes (pgbouncer transaction mode cannot run db push).
  const pushEnv = process.env.DIRECT_URL ? { DATABASE_URL: process.env.DIRECT_URL } : undefined;
  if (!run("npx", ["prisma", "db", "push", "--skip-generate", "--schema", schema], root, 120_000, pushEnv)) return;

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
