import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { ensureSqliteDir } from "./db";

let ready: Promise<void> | null = null;
const schemaMarkerKey = "runtime.schema.fingerprint";

function findSchemaPath(databaseUrl: string): string {
  const configured = process.env.PRISMA_SCHEMA_PATH?.trim();
  if (configured && fs.existsSync(configured)) return path.resolve(configured);

  const useDesktop = databaseUrl.startsWith("file:");
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const schemas = useDesktop
      ? ["schema.desktop.prisma", "schema.prisma"]
      : ["schema.prisma", "schema.desktop.prisma"];
    for (const filename of schemas) {
      const candidate = path.join(dir, "prisma", filename);
      if (fs.existsSync(candidate)) return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.join(process.cwd(), "prisma", useDesktop ? "schema.desktop.prisma" : "schema.prisma");
}

function schemaFingerprint(schemaPath: string): string {
  if (!fs.existsSync(schemaPath)) return "";
  return crypto.createHash("sha256").update(fs.readFileSync(schemaPath)).digest("hex");
}

function run(cmd: string, args: string[], root: string, timeoutMs: number, envOverride?: Record<string, string | undefined>): boolean {
  const env = { ...process.env, ...envOverride };
  if ("electron" in process.versions) env.ELECTRON_RUN_AS_NODE = "1";
  const r = spawnSync(cmd, args, {
    cwd: root,
    env,
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
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (!process.env.DATABASE_URL) {
    console.error("[db-boot] DATABASE_URL is not set — skipping self-heal.");
    return;
  }
  ensureSqliteDir();

  const databaseUrl = process.env.DATABASE_URL;
  const schema = findSchemaPath(databaseUrl);
  const fingerprint = schemaFingerprint(schema);
  const checker = new PrismaClient({ log: ["error"] });
  const isPostgres = databaseUrl.startsWith("postgres");
  let needsPush = true;
  try {
    if (fingerprint) {
      const marker = await checker.setting.findUnique({ where: { key: schemaMarkerKey } });
      needsPush = marker?.value !== fingerprint;
    } else {
      const tables = isPostgres
        ? await checker.$queryRawUnsafe<{ tablename: string }[]>(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('Category','Product','Allergen','User')",
          )
        : await checker.$queryRawUnsafe<{ name: string }[]>(
            "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('Category','Product','Allergen','User')",
          );
      needsPush = tables.length !== 4;
    }
    if (!needsPush) return;
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`[db-boot] DB check failed (${msg.slice(0, 120)}) — running prisma db push...`);
    if (msg.includes("Can't reach database server")) {
      console.error(
        "[db-boot] hint: verify DATABASE_URL host/password and that the Postgres " +
          "server is running and not paused. For Supabase pooler URLs use DIRECT_URL " +
          "for schema push.",
      );
    }
  } finally {
    await checker.$disconnect().catch(() => {});
  }

  const root = path.dirname(path.dirname(schema));
  const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
  if (!fs.existsSync(prismaCli)) {
    console.error(`[db-boot] Prisma CLI is missing at ${prismaCli}`);
    return;
  }
  const pushEnv = process.env.DIRECT_URL ? { DATABASE_URL: process.env.DIRECT_URL } : undefined;
  if (!run(process.execPath, [prismaCli, "db", "push", "--skip-generate", "--schema", schema], root, 120_000, pushEnv)) return;

  const seeder = new PrismaClient({ log: ["error"] });
  try {
    const [users, products, categories] = await Promise.all([
      seeder.user.count(),
      seeder.product.count(),
      seeder.category.count(),
    ]);
    if (users === 0 && products === 0 && categories === 0 && process.env.DESKTOP_EMBEDDED !== "1") {
      console.error("[db-boot] empty DB after push — seeding demo data...");
      run("npx", ["tsx", "prisma/seed.ts"], root, 300_000);
    } else {
      console.error(`[db-boot] schema ready (users=${users}, products=${products}) — skipping seed.`);
    }
    if (fingerprint) {
      await seeder.setting.upsert({
        where: { key: schemaMarkerKey },
        create: { key: schemaMarkerKey, value: fingerprint },
        update: { value: fingerprint },
      });
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
