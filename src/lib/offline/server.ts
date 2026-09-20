import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type MutationReceipt<T extends Record<string, unknown>> = {
  status: number;
  body: T;
  replayed: boolean;
};

type StoredReceipt<T> = {
  fingerprint: string;
  status: number;
  body: T;
};

export class OfflineMutationConflict extends Error {
  status = 409;
  constructor(message = "شناسه تغییر قبلاً برای درخواست دیگری استفاده شده است") {
    super(message);
  }
}

function mutationId(req: Request): string | null {
  const value = req.headers.get("x-farman-mutation-id")?.trim() ?? "";
  if (!value) return null;
  if (!/^fm_admin_mutation_[a-zA-Z0-9_-]{16,160}$/.test(value)) {
    throw new OfflineMutationConflict("شناسه تغییر آفلاین نامعتبر است");
  }
  return value;
}

function fingerprint(req: Request, input: unknown): string {
  const url = new URL(req.url);
  return createHash("sha256")
    .update(JSON.stringify({ method: req.method, path: url.pathname, input }))
    .digest("hex");
}

function receiptKey(actorId: string, id: string): string {
  return `offline.mutation.${createHash("sha256").update(`${actorId}:${id}`).digest("hex")}`;
}

function readStored<T extends Record<string, unknown>>(value: string): StoredReceipt<T> {
  return JSON.parse(value) as StoredReceipt<T>;
}

/**
 * Runs a queued business mutation and stores its exact response in the same DB
 * transaction. A reconnect or lost HTTP response therefore replays the receipt
 * instead of applying the mutation twice.
 */
export async function runIdempotentOfflineMutation<T extends Record<string, unknown>>(
  req: Request,
  actorId: string,
  input: unknown,
  execute: (tx: Prisma.TransactionClient) => Promise<{ status?: number; body: T }>,
): Promise<MutationReceipt<T>> {
  const id = mutationId(req);
  const hash = fingerprint(req, input);

  if (!id) {
    const result = await prisma.$transaction((tx) => execute(tx));
    return { status: result.status ?? 200, body: result.body, replayed: false };
  }

  const key = receiptKey(actorId, id);
  const run = async () => prisma.$transaction(async (tx) => {
    const existing = await tx.setting.findUnique({ where: { key } });
    if (existing) {
      const stored = readStored<T>(existing.value);
      if (stored.fingerprint !== hash) throw new OfflineMutationConflict();
      return { status: stored.status, body: stored.body, replayed: true };
    }

    const result = await execute(tx);
    const stored: StoredReceipt<T> = {
      fingerprint: hash,
      status: result.status ?? 200,
      body: result.body,
    };
    await tx.setting.create({ data: { key, value: JSON.stringify(stored) } });
    return { status: stored.status, body: stored.body, replayed: false };
  });

  try {
    return await run();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.setting.findUnique({ where: { key } });
      if (existing) {
        const stored = readStored<T>(existing.value);
        if (stored.fingerprint !== hash) throw new OfflineMutationConflict();
        return { status: stored.status, body: stored.body, replayed: true };
      }
    }
    throw error;
  }
}
