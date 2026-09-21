"use client";

import { createQueuedActionId, enqueueAction } from "./queue";

export type OfflineAdminMethod = "POST" | "PUT" | "PATCH";

export type OfflineAdminMutation = {
  path: string;
  method: OfflineAdminMethod;
  body: Record<string, unknown>;
};

export type OfflineMutationResult<T = Record<string, unknown>> =
  | { queued: true; mutationId: string }
  | { queued: false; mutationId: string; data: T };

const ALLOWED_MUTATIONS: Array<{ method: OfflineAdminMethod; path: RegExp }> = [
  { method: "POST", path: /^\/api\/admin\/orders$/ },
  { method: "PUT", path: /^\/api\/admin\/orders\/[^/]+\/status$/ },
  { method: "PUT", path: /^\/api\/admin\/tables\/[^/]+$/ },
  { method: "POST", path: /^\/api\/admin\/reservations$/ },
  { method: "PUT", path: /^\/api\/admin\/reservations\/[^/]+$/ },
  { method: "POST", path: /^\/api\/admin\/customers\/[^/]+\/points$/ },
];

export function isAllowedOfflineAdminMutation(mutation: OfflineAdminMutation): boolean {
  if (!ALLOWED_MUTATIONS.some((item) => item.method === mutation.method && item.path.test(mutation.path))) {
    return false;
  }
  // Cashiers may queue only the operational occupancy field for tables.
  if (/^\/api\/admin\/tables\/[^/]+$/.test(mutation.path)) {
    return Object.keys(mutation.body).length === 1 && typeof mutation.body.isOccupied === "boolean";
  }
  return true;
}

function parseResponse(text: string): Record<string, unknown> {
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { error: text };
  }
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 502 || status === 503 || status === 504;
}

async function persist(
  actorId: string,
  mutationId: string,
  mutation: OfflineAdminMutation,
): Promise<OfflineMutationResult> {
  await enqueueAction({
    id: mutationId,
    type: "ADMIN_MUTATION",
    actorId,
    payload: mutation,
  });
  return { queued: true, mutationId };
}

export async function executeOrQueueAdminMutation<T extends Record<string, unknown> = Record<string, unknown>>({
  actorId,
  online,
  mutation,
}: {
  actorId: string;
  online: boolean;
  mutation: OfflineAdminMutation;
}): Promise<OfflineMutationResult<T>> {
  if (!actorId) throw new Error("هویت کاربر برای ذخیره آفلاین مشخص نیست");
  if (!isAllowedOfflineAdminMutation(mutation)) throw new Error("این تغییر برای حالت آفلاین مجاز نیست");

  const serialized = JSON.stringify(mutation.body);
  if (serialized.length > 64 * 1024) throw new Error("حجم تغییر آفلاین بیش از حد مجاز است");
  const mutationId = createQueuedActionId("ADMIN_MUTATION");

  if (!online) return persist(actorId, mutationId, mutation) as Promise<OfflineMutationResult<T>>;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(mutation.path, {
      method: mutation.method,
      headers: {
        "Content-Type": "application/json",
        "X-Farman-Mutation-Id": mutationId,
      },
      body: serialized,
      signal: controller.signal,
    });
    const data = parseResponse(await response.text());
    if (response.ok) return { queued: false, mutationId, data: data as T };
    if (retryableStatus(response.status)) return persist(actorId, mutationId, mutation) as Promise<OfflineMutationResult<T>>;
    throw new Error(typeof data.error === "string" ? data.error : "اعمال تغییر انجام نشد");
  } catch (error) {
    if (error instanceof TypeError || (error instanceof DOMException && error.name === "AbortError")) {
      return persist(actorId, mutationId, mutation) as Promise<OfflineMutationResult<T>>;
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
