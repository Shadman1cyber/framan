import { loadEnvConfig } from "@next/env";

// Load the same .env files as Next before importing modules that read settings
// or create Prisma clients. Existing shell/service environment values win.
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
void import("./index").catch(error => {
  console.error("[worker] bootstrap failed", error);
  process.exit(1);
});
