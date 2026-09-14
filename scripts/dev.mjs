import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import nextEnv from "@next/env";

const require = createRequire(import.meta.url);
process.env.NODE_ENV ??= "development";
nextEnv.loadEnvConfig(process.cwd(), true);

const children = [];
let stopping = false;
let exitCode = 0;
let forceTimer;

function signalChild(child, signal) {
  if (!child.pid) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal); // Include Next/tsx subprocesses.
  } catch (error) {
    if (error.code !== "ESRCH") console.error(`[dev] could not stop child: ${error.message}`);
  }
}

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  for (const child of children) signalChild(child, "SIGTERM");
  forceTimer = setTimeout(() => {
    for (const child of children) signalChild(child, "SIGKILL");
    process.exit(exitCode);
  }, 5000);
  finishIfStopped();
}

function finishIfStopped() {
  if (stopping && children.every(child => child.exitCode !== null || child.signalCode !== null || !child.pid)) {
    clearTimeout(forceTimer);
    process.exit(exitCode);
  }
}

function start(name, args) {
  const child = spawn(process.execPath, args, {
    stdio: "inherit",
    env: process.env,
    detached: process.platform !== "win32",
  });
  children.push(child);
  child.on("error", error => {
    console.error(`[dev] ${name} failed: ${error.message}`);
    shutdown(1);
  });
  child.on("exit", code => {
    if (!stopping) {
      console.error(`[dev] ${name} exited; stopping development processes`);
      shutdown(code || 1);
    }
    finishIfStopped();
  });
}

process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());

start("Next.js", [require.resolve("next/dist/bin/next"), "dev", "-p", process.env.PORT || "3080", ...process.argv.slice(2)]);
if (process.env.AGENT_ENABLED === "true") {
  start("agent worker", [require.resolve("tsx/cli"), "watch", "worker/bootstrap.ts"]);
} else {
  console.log("[dev] agent worker disabled (AGENT_ENABLED is not true)");
}
