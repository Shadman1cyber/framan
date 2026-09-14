import { prisma } from "@/lib/db";
import QRCode from "qrcode";
import { QrAdmin } from "@/components/admin/QrAdmin";
import { getPublicAppUrl } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function AdminQrPage() {
  // QR codes must point to an accessible base URL (LAN IP or PUBLIC_APP_URL),
  // never to localhost (Rule 15).
  const BASE_URL = getPublicAppUrl();

  const qrs = await prisma.qRCode.findMany({
    orderBy: { createdAt: "desc" },
    include: { branch: true, table: true },
    take: 200,
  });

  const rows = await Promise.all(
    qrs.map(async (q) => {
      let dataUrl: string | null = null;
      try {
        dataUrl = await QRCode.toDataURL(`${BASE_URL}/?table=${q.code}`, {
          margin: 1,
          width: 320,
          color: { dark: "#3E3A33", light: "#FFFDF7" },
        });
      } catch {}
      return {
        id: q.id,
        code: q.code,
        label: q.label,
        branchName: q.branch.nameFa,
        tableLabel: q.table ? (q.table.label ?? `میز ${q.table.number}`) : null,
        isActive: q.isActive,
        expiresAt: q.expiresAt?.toISOString() ?? null,
        url: `${BASE_URL}/?table=${q.code}`,
        dataUrl,
      };
    }),
  );

  return (
    <div>
      <h1 className="heading-section mb-6">کدهای QR</h1>
      <QrAdmin initial={rows} />
    </div>
  );
}