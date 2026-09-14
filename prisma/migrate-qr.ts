import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

/**
 * Regenerates predictable QR codes (e.g. "main-table-3") as unguessable random
 * tokens, so a guest cannot type another table's URL. Idempotent: codes already
 * starting with "t_" are kept (re-printed QRs keep working).
 */
async function main() {
  const qrs = await prisma.qRCode.findMany({ select: { id: true, code: true } });
  for (const qr of qrs) {
    if (qr.code.startsWith("t_")) continue;
    await prisma.qRCode.update({
      where: { id: qr.id },
      data: { code: `t_${crypto.randomBytes(6).toString("hex")}` },
    });
  }
  console.log(`✅ QR codes ensured unguessable (${qrs.length} checked)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
