import { db } from "@/lib/db";

// Supplier discovery over the knowledge graph.
// Finds catalog items matching a category (or free-text), returning candidate
// offers with pricing/lead-time context for evaluation.
// Guarantees apples-to-apples comparison: every candidate quotes the same
// product — the best textual match, or the category's primary item (the one
// carried by the most suppliers).

export type CandidateOffer = {
  supplierId: string;
  supplierName: string;
  reliabilityScore: number;
  onTimeRate: number;
  avgDeliveryDays: number;
  riskLevel: string;
  riskScore: number;
  totalOrders: number;
  location: string;
  supplierProductId: string;
  productId: string;
  productName: string;
  unitPrice: number;
  leadTimeDays: number;
  minOrderQty: number;
  price30dAgo: number | null;
};

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9×]+/)
    .filter((t) => t.length >= 3);
}

export async function findCandidateOffers(
  companyId: string,
  category: string,
  quantity: number,
  query?: string
): Promise<CandidateOffer[]> {
  const rows = await db.supplierProduct.findMany({
    where: {
      product: { category },
      supplier: { status: "active", companyId },
      minOrderQty: { lte: Math.max(quantity, 1) },
    },
    include: {
      supplier: true,
      product: true,
      priceHistory: { orderBy: { recordedAt: "asc" } },
    },
  });
  if (rows.length === 0) return [];

  // Textual match strength between the request and each catalog item.
  const qTokens = new Set(tokens(query ?? ""));
  const scoreOf = (r: (typeof rows)[number]) => {
    if (qTokens.size === 0) return 0;
    const hay = `${r.product.name} ${r.product.sku} ${r.product.description ?? ""}`.toLowerCase();
    let hits = 0;
    qTokens.forEach((t) => {
      if (hay.includes(t)) hits++;
    });
    return hits;
  };

  const scored = rows.map((r) => ({ row: r, match: scoreOf(r) }));
  const maxMatch = Math.max(...scored.map((s) => s.match));

  let pool: typeof rows;
  if (maxMatch > 0) {
    pool = scored.filter((s) => s.match === maxMatch).map((s) => s.row);
  } else {
    // No textual signal: restrict to the category's primary product (most suppliers).
    const counts = new Map<string, Set<string>>();
    for (const r of rows) {
      counts.set(r.productId, (counts.get(r.productId) ?? new Set()).add(r.supplierId));
    }
    const primary = [...counts.entries()].sort((a, b) => b[1].size - a[1].size)[0][0];
    pool = rows.filter((r) => r.productId === primary);
  }

  // One offer per supplier: their cheapest qualifying listing.
  const bySupplier = new Map<string, CandidateOffer>();
  for (const r of pool) {
    const prev = bySupplier.get(r.supplierId);
    if (!prev || r.price < prev.unitPrice) {
      bySupplier.set(r.supplierId, {
        supplierId: r.supplier.id,
        supplierName: r.supplier.name,
        reliabilityScore: r.supplier.reliabilityScore,
        onTimeRate: r.supplier.onTimeRate,
        avgDeliveryDays: r.supplier.avgDeliveryDays,
        riskLevel: r.supplier.riskLevel,
        riskScore: r.supplier.riskScore,
        totalOrders: r.supplier.totalOrders,
        location: r.supplier.location,
        supplierProductId: r.id,
        productId: r.productId,
        productName: r.product.name,
        unitPrice: r.price,
        leadTimeDays: r.leadTimeDays,
        minOrderQty: r.minOrderQty,
        price30dAgo:
          r.priceHistory.length >= 2 ? r.priceHistory[r.priceHistory.length - 2].price : null,
      });
    }
  }

  return [...bySupplier.values()].sort((a, b) => a.unitPrice - b.unitPrice);
}
