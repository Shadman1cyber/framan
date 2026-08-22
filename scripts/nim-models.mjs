#!/usr/bin/env node
// Lists models available to your NVIDIA NIM key and highlights GLM options.
// Usage: NVAPI_KEY=nvapi-... node scripts/nim-models.mjs   (or rely on .env)

import { readFileSync } from "node:fs";

function envFromDotenv() {
  try {
    for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}
envFromDotenv();

const base = process.env.FARMAN_NIM_BASE_URL || "https://integrate.api.nvidia.com/v1";
const key = process.env.NVAPI_KEY;
if (!key) {
  console.error("NVAPI_KEY missing (set it in .env)");
  process.exit(1);
}

try {
  const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) {
    console.error(`HTTP ${res.status} from ${base}/models`);
    if (res.status === 403)
      console.error("→ The NVIDIA edge rejected the request. Common causes:\n" +
        "  • geo-restricted network (NVIDIA blocks some regions) — route via a proxy\n" +
        "    (set NODE_USE_ENV_PROXY=1 + HTTPS_PROXY in .env) or use another network\n" +
        "  • revoked/invalid key — regenerate at build.nvidia.com");
    process.exit(1);
  }
  const data = await res.json();
  const ids = data.data.map((m) => m.id).sort();
  console.log(`Available models (${ids.length}):\n`);
  for (const id of ids) console.log("  " + id);
  const glm = ids.filter((id) => /glm/i.test(id));
  console.log(`\nGLM candidates:` + (glm.length ? "" : " none"));
  for (const g of glm) console.log("  → " + g);
} catch (e) {
  console.error("Network error:", e.cause?.code ?? e.message);
}
