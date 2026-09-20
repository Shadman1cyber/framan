"use client";

export type QueuedActionType = "PLACE_ORDER" | "UPDATE_PROFILE" | "SUBMIT_RATING" | "ADMIN_MUTATION";
export type QueuedActionState = "pending" | "conflict";

export type QueuedAction = {
  id: string;
  type: QueuedActionType;
  payload: unknown;
  /** Admin mutations are bound to the authenticated staff member who queued them. */
  actorId?: string;
  timestamp: number;
  retryCount: number;
  state: QueuedActionState;
  lastError?: string;
};

const DB_NAME = "farmans-offline-queue";
const STORE_NAME = "actions";
const DB_VERSION = 2;
export const OFFLINE_QUEUE_CHANGED_EVENT = "farman:offline-queue-changed";

let dbPromise: Promise<IDBDatabase> | null = null;
let lastTimestamp = 0;

function nextTimestamp(): number {
  const now = Date.now();
  lastTimestamp = Math.max(now, lastTimestamp + 1);
  return lastTimestamp;
}

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("IndexedDB not available on server"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      let store: IDBObjectStore;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("type", "type", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
      } else {
        store = (event.target as IDBOpenDBRequest).transaction!.objectStore(STORE_NAME);
      }
      if (!store.indexNames.contains("actorId")) store.createIndex("actorId", "actorId", { unique: false });
      if (!store.indexNames.contains("state")) store.createIndex("state", "state", { unique: false });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function notifyQueueChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OFFLINE_QUEUE_CHANGED_EVENT));
}

export function createQueuedActionId(type: QueuedActionType): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replaceAll("-", "")
    : `${Date.now()}${Math.random().toString(36).slice(2)}`;
  return `fm_${type.toLowerCase()}_${random}`;
}

type EnqueueActionInput = Omit<QueuedAction, "id" | "retryCount" | "timestamp" | "state"> & {
  id?: string;
  state?: QueuedActionState;
};

export async function enqueueAction(action: EnqueueActionInput): Promise<string> {
  const id = action.id ?? createQueuedActionId(action.type);
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const record: QueuedAction = {
      ...action,
      id,
      timestamp: nextTimestamp(),
      retryCount: 0,
      state: action.state ?? "pending",
    };
    const req = store.add(record);
    req.onsuccess = () => {
      notifyQueueChanged();
      resolve(id);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getQueuedActions(): Promise<QueuedAction[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(
      (req.result as QueuedAction[])
        .map((action) => ({ ...action, state: action.state ?? "pending" }))
        .sort((a, b) => a.timestamp - b.timestamp),
    );
    req.onerror = () => reject(req.error);
  });
}

export async function getQueuedActionsByType(type: QueuedAction["type"]): Promise<QueuedAction[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("type");
    const req = index.getAll(type);
    req.onsuccess = () => resolve((req.result as QueuedAction[]).map((action) => ({ ...action, state: action.state ?? "pending" })));
    req.onerror = () => reject(req.error);
  });
}

export async function removeAction(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => {
      notifyQueueChanged();
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function updateAction(action: QueuedAction): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(action);
    req.onsuccess = () => {
      notifyQueueChanged();
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function clearAllActions(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => {
      notifyQueueChanged();
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getActionCount(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getQueueStats(): Promise<{ total: number; conflicts: number }> {
  const actions = await getQueuedActions();
  return {
    total: actions.length,
    conflicts: actions.filter((action) => action.state === "conflict").length,
  };
}
