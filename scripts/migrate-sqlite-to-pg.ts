/**
 * One-off data migration: SQLite (prisma/dev.db) → PostgreSQL.
 *
 * Usage:
 *   1. Start Postgres and set DATABASE_URL to the Postgres connection string.
 *   2. npx prisma db push          (creates the schema in Postgres)
 *   3. SQLITE_URL="file:./prisma/dev.db" npx tsx scripts/migrate-sqlite-to-pg.ts
 *
 * Copy order respects FK dependencies; child rows are copied after parents.
 * Uses createMany with skipDuplicates so a re-run never corrupts data.
 */
import { PrismaClient } from "@prisma/client";

const pg = new PrismaClient();
const sqlite = new PrismaClient({
  datasourceUrl: process.env.SQLITE_URL ?? "file:./prisma/dev.db",
});

// Parents first, children after. Agent tables last (self-contained chains).
const TABLES = [
  "cafe", "branch", "cafeTable", "qRCode",
  "user", "allergen", "dietaryTag", "ingredient",
  "ingredientAllergen", "userAllergy", "userPreference", "userDietaryTag",
  "category", "product", "productIngredient", "productAllergen",
  "productDietaryTag", "coffeeLine", "productCoffeeLine", "productImage",
  "rating", "staff", "staffAttendance", "staffLeave",
  "order", "orderItem", "orderStageEvent", "tableReservation",
  "goal", "setting", "salesFlowSettings", "salesFlowSchedule",
  "aIInsight", "aIChatSession", "aIChatMessage", "importJob",
  // Agent workspace + graph (additive chain 001–007)
  "graphNode", "graphEdge", "graphSync",
  "agentRun", "agentStep", "agentEvent", "agentArtifact",
  "agentEpisode", "agentLesson", "agentSkill",
] as const;

async function main() {
  const counts: Record<string, number> = {};
  for (const table of TABLES) {
    const model = (sqlite as unknown as Record<string, { findMany: (a?: unknown) => Promise<unknown[]> }>)[table];
    const target = (pg as unknown as Record<string, { createMany: (a: unknown) => Promise<{ count: number }> }>)[table];
    if (!model || !target) {
      console.warn(`⚠ skip ${table} (model not found)`);
      continue;
    }
    const rows = await model.findMany();
    if (!rows.length) {
      counts[table] = 0;
      continue;
    }
    // Chunk large tables to stay well under parameter limits.
    let copied = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const res = await target.createMany({ data: rows.slice(i, i + 200), skipDuplicates: true });
      copied += res.count;
    }
    counts[table] = copied;
  }
  console.table(counts);
  console.log("✅ SQLite → PostgreSQL migration finished");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await pg.$disconnect();
    await sqlite.$disconnect();
  });
