import type { PrismaClient } from "@prisma/client";
import { graphFreshness } from "./sync";

type DB = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export const RETRIEVAL_BUDGET = { candidates: 20, neighbors: 40, hop: 1 } as const;

/**
 * Bounded catalog retrieval with provenance. Scope and validity are filtered
 * before anything is returned; deleted/expired nodes never surface. No
 * embeddings in the SQLite interim — exact/substring match on labels and
 * slugs, so retrieval quality is deliberately conservative and every result
 * carries its source so consumers can verify against the live source.
 */
export async function searchCatalog(db: DB, scopeId: string, query: string) {
  const now = new Date();
  const freshness = await graphFreshness(db, scopeId);
  const q = query.trim().toLowerCase();
  const nodes = await db.graphNode.findMany({
    where: {
      scopeId, status: "active", validFrom: { lte: now },
      AND: [{ OR: [{ validTo: null }, { validTo: { gt: now } }] }, { OR: [{ searchText: { contains: q } }, { label: { contains: q } }] }],
    },
    select: { id: true, kind: true, refId: true, label: true, sourceId: true, sourceVersion: true, observedAt: true, properties: true },
    take: RETRIEVAL_BUDGET.candidates, orderBy: [{ kind: "asc" }, { label: "asc" }],
  });
  const edges = nodes.length
    ? await (async () => { const ids = nodes.map(n => n.id); return db.graphEdge.findMany({
        where: {
          scopeId, status: "active", validFrom: { lte: now },
          AND: [{ OR: [{ validTo: null }, { validTo: { gt: now } }] }, { OR: [{ fromId: { in: ids } }, { toId: { in: ids } }] }],
        },
        select: { relation: true, fromId: true, toId: true, sourceId: true },
        take: RETRIEVAL_BUDGET.neighbors,
      }); })()
    : [];
  const neighborIds = [...new Set(edges.flatMap(e => [e.fromId, e.toId]))].filter(id => !nodes.some(n => n.id === id));
  // R09: neighbor nodes get the same validity/status/scope filters as primary
  // results — an expired or deleted neighbor never surfaces.
  const neighbors = neighborIds.length
    ? await db.graphNode.findMany({
        where: {
          id: { in: neighborIds }, scopeId, status: "active", validFrom: { lte: now },
          AND: [{ OR: [{ validTo: null }, { validTo: { gt: now } }] }],
        },
        select: { id: true, kind: true, refId: true, label: true, sourceId: true, sourceVersion: true, observedAt: true, properties: true },
        take: RETRIEVAL_BUDGET.candidates, orderBy: [{ kind: "asc" as const }, { label: "asc" as const }],
      })
    : [];
  const byId = new Map([...nodes, ...neighbors].map(n => [n.id, n]));
  const neighborSet = new Set(neighbors.map(n => n.id));
  // Graph nodes are discovery metadata. Resolve volatile product fields from
  // the live table in one bounded query so a name/price question is answerable.
  const productIds = [...nodes, ...neighbors].filter(n => n.kind === "Product").map(n => n.refId);
  const products = productIds.length ? await db.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, price: true, isAvailable: true, coffeeLines: { where: { isActive: true }, select: { coffeeLineId: true, price: true } } },
  }) : [];
  const liveProducts = new Map(products.map(p => [p.id, p]));
  const relsOf = (n: { id: string }) => edges
    .filter(e => e.fromId === n.id || e.toId === n.id)
    .map(e => ({
      relation: e.relation, direction: e.fromId === n.id ? "out" as const : "in" as const,
      other: { kind: byId.get(e.fromId === n.id ? e.toId : e.fromId)?.kind ?? "unknown", label: byId.get(e.fromId === n.id ? e.toId : e.fromId)?.label ?? "unknown", sourceId: e.sourceId },
    }));
  // One-hop neighbors are results too (R09): a category query must surface its
  // products, an ingredient query its products — same provenance and filters
  // as direct matches, `via: "neighbor"` marks how they were reached.
  const results = [...nodes, ...neighbors].map(n => ({
    kind: n.kind, refId: n.refId, label: n.label, sourceId: n.sourceId, sourceVersion: n.sourceVersion, observedAt: n.observedAt.toISOString(),
    ...(neighborSet.has(n.id) ? { via: "neighbor" as const } : {}),
    ...(liveProducts.has(n.refId) && n.kind === "Product" ? {
      price: liveProducts.get(n.refId)!.price, isAvailable: liveProducts.get(n.refId)!.isAvailable,
      coffeeLines: liveProducts.get(n.refId)!.coffeeLines, liveSource: "Product:live",
    } : {}),
    relations: relsOf(n),
  }));
  return { query, count: results.length, results, graphAsOf: freshness.asOf?.toISOString() ?? null, stale: freshness.stale };
}
