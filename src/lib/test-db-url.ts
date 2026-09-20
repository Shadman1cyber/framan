import { randomUUID } from "crypto";
import { execFileSync } from "child_process";

/**
 * Disposable Postgres URL for integration tests.
 * Each test file gets its own Postgres schema (t_<label>_<id>) inside the
 * test database so parallel test files never collide. `prisma db push`
 * creates the schema automatically when the URL carries ?schema=...
 *
 * Base URL: TEST_DATABASE_URL, falling back to the local compose defaults.
 */
export function testDatabaseUrl(label: string): string {
  const base =
    process.env.TEST_DATABASE_URL ??
    "postgresql://farman:farman@localhost:5432/farman_test?schema=public";
  const schema = `t_${label}_${randomUUID().slice(0, 8)}`;
  if (base.includes("schema=")) return base.replace(/schema=[^&]*/, `schema=${schema}`);
  return `${base}${base.includes("?") ? "&" : "?"}schema=${schema}`;
}

/**
 * Synchronous TCP reachability probe for the test Postgres.
 * Integration suites call this once at module load: when the server is down
 * (e.g. no docker compose up) the whole suite is skipped instead of failing.
 */
export function postgresReachable(): boolean {
  const base =
    process.env.TEST_DATABASE_URL ??
    "postgresql://farman:farman@localhost:5432/farman_test?schema=public";
  const m = base.match(/@([^:/?]+):(\d+)/);
  if (!m) return false;
  const host = m[1];
  const port = Number(m[2]);
  const probe = [
    "const n=require('net');",
    `const s=n.createConnection({host:${JSON.stringify(host)},port:${port},timeout:1500});`,
    "s.on('connect',()=>{s.destroy();process.exit(0)});",
    "s.on('error',()=>process.exit(1));",
    "s.on('timeout',()=>{s.destroy();process.exit(1)});",
  ].join("");
  try {
    execFileSync(process.execPath, ["-e", probe], { timeout: 3000, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
