import { createHash, randomUUID } from "crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

export const GRAPH_ENTITIES = ["Category", "Product", "Ingredient", "Allergen", "DietaryTag"] as const;
export type GraphEntity = (typeof GRAPH_ENTITIES)[number];
export const GRAPH_RELATIONS = ["BELONGS_TO", "CONTAINS", "USES", "TAGGED"] as const;

type DB = Prisma.TransactionClient;
const versionOf = (updatedAt: Date, id: string) => `${updatedAt.toISOString()}:${createHash("sha1").update(id).digest("hex").slice(0, 8)}`;
const searchTextOf = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join("\n").toLowerCase();

/**
 * Phase 3 sync. SQLite interim mapping of the planned pipeline: the source
 * tables' updatedAt acts as the transactional outbox, the watermark per entity
 * kind is the consumer cursor, and every sync run is also the reconciliation
 * job (delete/ACL/expiry propagation). Stale events never overwrite newer
 * graph versions; identity joins use source IDs, never name similarity.
 * Writes only derived Graph* tables — business sources stay untouched.
 */
export async function syncGraph(db: DB, scopeId: string, now = new Date()) {
  const changed: Record<string, number> = {};
  const current = new Map<string, Set<string>>();
  for (const entity of GRAPH_ENTITIES) {
    const watermark = (await db.graphSync.findUnique({ where: { scopeId_entity: { scopeId, entity } } }))?.watermark ?? new Date(0);
    const sourceId = (id: string) => `${entity}:${id}`;
    const upsertNode = async (refId: string, label: string, searchParts: (string | null | undefined)[], properties: object, updatedAt: Date, validFrom: Date) => {
      const sourceVersion = versionOf(updatedAt, refId);
      const existing = await db.graphNode.findUnique({ where: { scopeId_kind_refId: { scopeId, kind: entity, refId } } });
      if (existing && existing.sourceVersion >= sourceVersion && existing.status === "active") return false;
      const data = {
        label, searchText: searchTextOf(...searchParts), properties: JSON.stringify(properties),
        sourceId: sourceId(refId), sourceVersion, observedAt: now, validFrom,
        validTo: null, status: "active", confidence: 1,
      };
      await db.graphNode.upsert({ where: { scopeId_kind_refId: { scopeId, kind: entity, refId } }, create: { id: randomUUID(), scopeId, kind: entity, refId, ...data }, update: data });
      return true;
    };
    const track = (kind: string, id: string, set: Map<string, Set<string>>) => {
      if (!set.has(kind)) set.set(kind, new Set());
      set.get(kind)!.add(id);
    };

    if (entity === "Category") {
      const rows = await db.category.findMany({ where: { updatedAt: { gt: watermark } } });
      for (const r of rows) { if (await upsertNode(r.id, r.nameFa, [r.nameFa, r.nameEn, r.slug], { slug: r.slug, isActive: r.isActive }, r.updatedAt, r.createdAt)) changed.Category = (changed.Category ?? 0) + 1; track("Category", r.id, current); }
      current.set("Category", new Set((await db.category.findMany({ select: { id: true } })).map(r => r.id)));
    } else if (entity === "Product") {
      const rows = await db.product.findMany({ where: { updatedAt: { gt: watermark } }, include: { category: { select: { id: true } } } });
      for (const r of rows) { if (await upsertNode(r.id, r.nameFa, [r.nameFa, r.nameEn, r.slug, r.description], { slug: r.slug, isAvailable: r.isAvailable, categoryId: r.categoryId }, r.updatedAt, r.createdAt)) changed.Product = (changed.Product ?? 0) + 1; track("Product", r.id, current); }
      current.set("Product", new Set((await db.product.findMany({ select: { id: true } })).map(r => r.id)));
    } else if (entity === "Ingredient") {
      const rows = await db.ingredient.findMany({ where: { updatedAt: { gt: watermark } } });
      for (const r of rows) { if (await upsertNode(r.id, r.nameFa, [r.nameFa, r.nameEn], { unit: r.unit, isActive: r.isActive }, r.updatedAt, r.createdAt)) changed.Ingredient = (changed.Ingredient ?? 0) + 1; track("Ingredient", r.id, current); }
      current.set("Ingredient", new Set((await db.ingredient.findMany({ select: { id: true } })).map(r => r.id)));
    } else if (entity === "Allergen") {
      const rows = await db.allergen.findMany({ where: { updatedAt: { gt: watermark } } });
      for (const r of rows) { if (await upsertNode(r.id, r.nameFa, [r.nameFa, r.nameEn, r.key], { key: r.key }, r.updatedAt, r.createdAt)) changed.Allergen = (changed.Allergen ?? 0) + 1; track("Allergen", r.id, current); }
      current.set("Allergen", new Set((await db.allergen.findMany({ select: { id: true } })).map(r => r.id)));
    } else {
      const rows = await db.dietaryTag.findMany({ where: { updatedAt: { gt: watermark } } });
      for (const r of rows) { if (await upsertNode(r.id, r.nameFa, [r.nameFa, r.nameEn, r.key], { key: r.key }, r.updatedAt, r.createdAt)) changed.DietaryTag = (changed.DietaryTag ?? 0) + 1; track("DietaryTag", r.id, current); }
      current.set("DietaryTag", new Set((await db.dietaryTag.findMany({ select: { id: true } })).map(r => r.id)));
    }

    // Reconciliation: a source row that disappeared must deactivate its node
    // (deletion propagation), never vanish silently from the graph.
    const liveIds = current.get(entity)!;
    const stale = await db.graphNode.findMany({ where: { scopeId, kind: entity, status: "active", refId: { notIn: [...liveIds] } }, select: { id: true } });
    for (const node of stale) await db.graphNode.update({ where: { id: node.id }, data: { status: "deleted", validTo: now, observedAt: now } });
    if (stale.length) changed[`${entity}:deleted`] = stale.length;
  }

  // Edges are rebuilt from the authoritative join tables with version-guarded
  // upserts; missing rows are deactivated the same way as nodes.
  const products = await db.product.findMany({ select: { id: true, updatedAt: true, createdAt: true } });
  const productVersion = new Map(products.map(p => [p.id, versionOf(p.updatedAt, p.id)]));
  const joins = await Promise.all([
    db.product.findMany({ select: { id: true, categoryId: true } }),
    db.productAllergen.findMany(),
    db.productIngredient.findMany(),
    db.productDietaryTag.findMany(),
  ]);
  const wanted = new Map<string, { relation: string; fromId: string; toId: string; version: string }>();
  const nodeIds = new Map<string, string>();
  const nodes = await db.graphNode.findMany({ where: { scopeId, status: "active" }, select: { id: true, kind: true, refId: true } });
  for (const n of nodes) nodeIds.set(`${n.kind}:${n.refId}`, n.id);
  const edgeKey = (relation: string, from: string, to: string) => `${relation}:${from}:${to}`;
  const addEdge = (relation: string, fromKind: string, fromRef: string, toKind: string, toRef: string, version: string) => {
    const fromId = nodeIds.get(`${fromKind}:${fromRef}`), toId = nodeIds.get(`${toKind}:${toRef}`);
    if (fromId && toId) wanted.set(edgeKey(relation, fromId, toId), { relation, fromId, toId, version });
  };
  for (const p of joins[0]) addEdge("BELONGS_TO", "Product", p.id, "Category", p.categoryId, productVersion.get(p.id)!);
  for (const j of joins[1]) addEdge("CONTAINS", "Product", j.productId, "Allergen", j.allergenId, productVersion.get(j.productId)!);
  for (const j of joins[2]) addEdge("USES", "Product", j.productId, "Ingredient", j.ingredientId, productVersion.get(j.productId)!);
  for (const j of joins[3]) addEdge("TAGGED", "Product", j.productId, "DietaryTag", j.dietaryTagId, productVersion.get(j.productId)!);
  const existingEdges = await db.graphEdge.findMany({ where: { scopeId }, select: { id: true, relation: true, fromId: true, toId: true, sourceVersion: true, status: true } });
  for (const e of existingEdges) {
    const key = edgeKey(e.relation, e.fromId, e.toId);
    const next = wanted.get(key);
    if (!next) {
      if (e.status === "active") await db.graphEdge.update({ where: { id: e.id }, data: { status: "deleted", validTo: now, observedAt: now } });
      continue;
    }
    wanted.delete(key);
    if (e.sourceVersion >= next.version && e.status === "active") continue;
    await db.graphEdge.update({ where: { id: e.id }, data: { sourceVersion: next.version, observedAt: now, validTo: null, status: "active" } });
  }
  for (const [key, e] of wanted) {
    await db.graphEdge.upsert({
      where: { scopeId_relation_fromId_toId: { scopeId, relation: e.relation, fromId: e.fromId, toId: e.toId } },
      create: { id: randomUUID(), scopeId, relation: e.relation, fromId: e.fromId, toId: e.toId, sourceId: `edge:${key}`, sourceVersion: e.version, observedAt: now, validFrom: now, status: "active", confidence: 1 },
      update: { sourceVersion: e.version, observedAt: now, validTo: null, status: "active" },
    });
    changed.Edge = (changed.Edge ?? 0) + 1;
  }

  for (const entity of GRAPH_ENTITIES) {
    const maxUpdatedAt = async () => {
      switch (entity) {
        case "Category": return (await db.category.aggregate({ _max: { updatedAt: true } }))._max.updatedAt;
        case "Product": return (await db.product.aggregate({ _max: { updatedAt: true } }))._max.updatedAt;
        case "Ingredient": return (await db.ingredient.aggregate({ _max: { updatedAt: true } }))._max.updatedAt;
        case "Allergen": return (await db.allergen.aggregate({ _max: { updatedAt: true } }))._max.updatedAt;
        case "DietaryTag": return (await db.dietaryTag.aggregate({ _max: { updatedAt: true } }))._max.updatedAt;
      }
    };
    const watermark = await maxUpdatedAt() ?? new Date(0);
    await db.graphSync.upsert({ where: { scopeId_entity: { scopeId, entity } }, create: { id: randomUUID(), scopeId, entity, watermark }, update: { watermark, syncedAt: now } });
  }
  return { changed };
}

/** Freshness gate (R09): freshness is judged by WHEN THE GRAPH WAS LAST
 *  SYNCED (GraphSync.syncedAt), not by the source watermark — an unchanged
 *  or empty catalog must never make a freshly synchronized graph look stale.
 *  A source kind that has no rows at all is vacuously fresh. A behind graph
 *  must never pass as authoritative. */
export async function graphFreshness(db: Pick<PrismaClient, "graphSync">, scopeId: string, maxStaleSeconds = Number(process.env.GRAPH_MAX_STALE_SECONDS ?? 300)) {
  const rows = await db.graphSync.findMany({ where: { scopeId } });
  const known = new Set(rows.map(r => r.entity));
  if (GRAPH_ENTITIES.some(e => !known.has(e))) return { asOf: null as Date | null, stale: true };
  const asOf = new Date(Math.min(...rows.map(r => r.syncedAt.getTime())));
  return { asOf, stale: Date.now() - asOf.getTime() > maxStaleSeconds * 1000 };
}
