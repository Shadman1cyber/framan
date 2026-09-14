import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * One-off data migration for existing databases:
 *  - roles: ADMIN -> OWNER, STAFF -> CASHIER
 *  - allergenStatus: SAFE/UNKNOWN/MAY_CONTAIN -> FREE (unless CONTAINS rows exist)
 * Only touches rows that need changing; safe to run repeatedly.
 */
async function main() {
  await prisma.user.updateMany({ where: { role: "ADMIN" }, data: { role: "OWNER" } });
  await prisma.user.updateMany({ where: { role: "STAFF" }, data: { role: "CASHIER" } });

  const products = await prisma.product.findMany({ select: { id: true, allergenStatus: true } });
  for (const p of products) {
    if (p.allergenStatus === "CONTAINS") continue;
    const hasContains = await prisma.productAllergen.count({ where: { productId: p.id } });
    await prisma.product.update({
      where: { id: p.id },
      data: { allergenStatus: hasContains > 0 ? "CONTAINS" : "FREE" },
    });
  }
  console.log("✅ Data migration completed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
