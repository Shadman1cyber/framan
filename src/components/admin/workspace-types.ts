"use client";

/* Shared types of the workspace client (R01). */

export type AiSettings = { enabled: boolean; provider: string; model: string; hasApiKey: boolean };
export type Session = { id: string; title: string; messageCount: number; updatedAt: string };
export type ChatMessage = { id: string; role: string; content: string; createdAt: string };
export type Step = { idx: number; tool: string; state: string; result: unknown; error: string | null };
export type Child = { id: string; tool: string; state: string; result: Record<string, unknown> | null; lastError: string | null };
export type Run = {
  id: string; state: string; tool: string; input: string; inputHash: string; previous: string | null; expiresAt: string | null;
  traceId: string; result: string | null; lastError?: string | null; attemptCount?: number; parentRunId?: string | null;
  sessionId?: string | null; planKind?: string; modelId?: string | null; promptVersion?: string | null; skillVersion?: string | null;
  steps?: Step[]; children?: Child[]; events?: { id: string; name: string; state: string }[];
};
export type Artifact = {
  id: string; kind: string; filename: string; mimeType: string; sizeBytes: number; createdAt: string; runId?: string | null;
  meta?: { preview?: { rows?: string[][]; note?: string }; title?: string; generationInputs?: unknown; sources?: string[] };
};
export type Skill = {
  id: string; slug: string; version: string; status: string;
  testResult: { passed: boolean; evaluated: boolean; steps: { tool: string; mocked: boolean; ok: boolean; detail: string }[] } | null;
  definition: { description: string };
};
export type Lesson = { id: string; topic: string; statement: string; status: string; evidence: { id: string; tool: string; state: string }[] };
export type Status = { enabled: boolean; writes: boolean; shadow: boolean; approvalQueue: number; running: number; promptVersion: string };