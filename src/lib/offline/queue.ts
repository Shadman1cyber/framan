"use client";

export type QueuedAction = {
  id: string;
  type: "PLACE_ORDER" | "UPDATE_PROFILE" | "SUBMIT_RATING";
  payload: unknown;
  timestamp: number;
  retryCount: number;
  lastError?: string;
};

const DB_NAME = "farmans-offline-queue";
const STORE_NAME = "actions";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

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
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("type", "type", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

export async function enqueueAction(action: Omit<QueuedAction, "id" | "retryCount" | "timestamp">): Promise<string> {
  const id = `${action.type}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const record: QueuedAction = {
      ...action,
      id,
      timestamp: Date.now(),
      retryCount: 0,
    };
    const req = store.add(record);
    req.onsuccess = () => resolve(id);
    req.onerror = () => reject(req.error);
  });
}

export async function getQueuedActions(): Promise<QueuedAction[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as QueuedAction[]);
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
    req.onsuccess = () => resolve(req.result as QueuedAction[]);
    req.onerror = () => reject(req.error);
  });
}

export async function removeAction(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function updateAction(action: QueuedAction): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(action);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearAllActions(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => resolve();
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