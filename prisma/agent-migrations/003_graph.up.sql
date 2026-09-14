-- 003_graph (Phase 3): derived knowledge graph for catalog entities with
-- provenance and validity. Additive only; never a business source of truth.
CREATE TABLE "GraphNode" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "scopeId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "refId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "searchText" TEXT NOT NULL,
  "properties" TEXT NOT NULL DEFAULT '{}',
  "sourceId" TEXT NOT NULL,
  "sourceVersion" TEXT NOT NULL,
  "observedAt" DATETIME NOT NULL,
  "validFrom" DATETIME NOT NULL,
  "validTo" DATETIME,
  "status" TEXT NOT NULL DEFAULT 'active',
  "confidence" REAL NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "GraphNode_scopeId_kind_refId_key" ON "GraphNode"("scopeId", "kind", "refId");
CREATE INDEX "GraphNode_scopeId_status_kind_idx" ON "GraphNode"("scopeId", "status", "kind");

CREATE TABLE "GraphEdge" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "scopeId" TEXT NOT NULL,
  "relation" TEXT NOT NULL,
  "fromId" TEXT NOT NULL,
  "toId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "sourceVersion" TEXT NOT NULL,
  "observedAt" DATETIME NOT NULL,
  "validFrom" DATETIME NOT NULL,
  "validTo" DATETIME,
  "status" TEXT NOT NULL DEFAULT 'active',
  "confidence" REAL NOT NULL DEFAULT 1,
  CONSTRAINT "GraphEdge_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "GraphNode" ("id") ON DELETE CASCADE,
  CONSTRAINT "GraphEdge_toId_fkey" FOREIGN KEY ("toId") REFERENCES "GraphNode" ("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "GraphEdge_scopeId_relation_fromId_toId_key" ON "GraphEdge"("scopeId", "relation", "fromId", "toId");
CREATE INDEX "GraphEdge_scopeId_fromId_status_idx" ON "GraphEdge"("scopeId", "fromId", "status");

CREATE TABLE "GraphSync" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "scopeId" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "watermark" DATETIME NOT NULL,
  "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "GraphSync_scopeId_entity_key" ON "GraphSync"("scopeId", "entity");
