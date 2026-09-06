import { prisma } from "./db";

export type QRContext = {
  qrCodeId: string;
  code: string;
  tableId: string | null;
  tableNumber: string | null;
  tableLabel: string | null;
  branchId: string;
  branchNameFa: string;
  isActive: boolean;
  isExpired: boolean;
};

export async function resolveQR(code: string | null | undefined): Promise<QRContext | null> {
  if (!code) return null;
  const qr = await prisma.qRCode.findUnique({
    where: { code },
    include: {
      branch: true,
      table: true,
    },
  });
  if (!qr) return null;
  return {
    qrCodeId: qr.id,
    code: qr.code,
    tableId: qr.tableId ?? null,
    tableNumber: qr.table?.number ?? null,
    tableLabel: qr.table?.label ?? qr.label ?? null,
    branchId: qr.branchId,
    branchNameFa: qr.branch.nameFa,
    isActive: qr.isActive,
    isExpired: qr.expiresAt ? qr.expiresAt < new Date() : false,
  };
}