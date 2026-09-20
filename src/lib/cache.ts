import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "";
export const CACHE_ENABLED =
  (process.env.CACHE_ENABLED ?? (REDIS_URL ? "true" : "false")).toLowerCase() === "true";

export const CACHE_TTL = {
  MENU: Number(process.env.CACHE_TTL_MENU ?? 60), // catalog reads (hot path)
  PRODUCT: Number(process.env.CACHE_TTL_MENU ?? 60),
  SEARCH: Number(process.env.CACHE_TTL_SEARCH ?? 30),
  ORDER_LIST: Number(process.env.CACHE_TTL_ORDERS ?? 10), // short: orders change fast
  ANALYTICS: Number(process.env.CACHE_TTL_ANALYTICS ?? 60),
} as const;

let redis: Redis | null = null;
let warned = false;

function warnOnce(msg: string) {
  if (!warned) {
    warned = true;
    console.warn(`[cache] ${msg} — falling back to in-process memory cache`);
  }
}

if (CACHE_ENABLED && REDIS_URL) {
  try {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: false,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
    });
    redis.on("error", (e) => warnOnce(`redis error: ${(e as Error).message}`));
  } catch (e) {
    warnOnce(`cannot init redis: ${(e as Error).message}`);
    redis = null;
  }
} else if (CACHE_ENABLED && !REDIS_URL) {
  warnOnce("CACHE_ENABLED=true but REDIS_URL is empty");
}

// Tiny in-process fallback so reads stay fast even when Redis is down.
// Bounded Map with per-entry expiry (prevents unbounded growth).
const mem = new Map<string, { v: string; exp: number }>();
const MEM_LIMIT = 500;

function memGet(key: string): string | null {
  const e = mem.get(key);
  if (!e) return null;
  if (Date.now() > e.exp) {
    mem.delete(key);
    return null;
  }
  return e.v;
}

function memSet(key: string, v: string, ttlSec: number) {
  if (mem.size >= MEM_LIMIT) {
    const first = mem.keys().next().value;
    if (first) mem.delete(first);
  }
  mem.set(key, { v, exp: Date.now() + ttlSec * 1000 });
}

export async function cacheGet(key: string): Promise<string | null> {
  if (!CACHE_ENABLED) return memGet(key);
  if (redis) {
    try {
      const v = await redis.get(key);
      if (v !== null) return v;
    } catch {
      // fall through to memory
    }
  }
  return memGet(key);
}

export async function cacheSet(key: string, value: string, ttlSec: number): Promise<void> {
  memSet(key, value, ttlSec);
  if (!CACHE_ENABLED || !redis) return;
  try {
    await redis.set(key, value, "EX", ttlSec);
  } catch {
    /* memory copy already stored */
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  for (const k of keys) mem.delete(k);
  if (!CACHE_ENABLED || !redis || keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch {
    /* ignore */
  }
}

/** Delete every key matching a prefix (menu:*, orders:*). Uses SCAN so it is safe in prod. */
export async function cacheDelByPrefix(prefix: string): Promise<void> {
  for (const k of [...mem.keys()]) if (k.startsWith(prefix)) mem.delete(k);
  if (!CACHE_ENABLED || !redis) return;
  try {
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 100);
      cursor = next;
      if (keys.length) await redis.del(...keys);
    } while (cursor !== "0");
  } catch {
    /* ignore */
  }
}

/**
 * Cache-aside helper for hot read paths (menu / catalog / order lists).
 * On high traffic, concurrent callers share one in-flight DB fetch
 * (single-flight) so Postgres is hit once per key per TTL window.
 */
const inflight = new Map<string, Promise<string>>();

export async function cached<T>(key: string, ttlSec: number, loader: () => Promise<T>): Promise<T> {
  const hit = await cacheGet(key);
  if (hit !== null) {
    try {
      return JSON.parse(hit) as T;
    } catch {
      /* corrupt entry → reload */
    }
  }
  const ongoing = inflight.get(key);
  if (ongoing) {
    try {
      return JSON.parse(await ongoing) as T;
    } catch {
      /* fall through to fresh load */
    }
  }
  const p = (async () => {
    const data = await loader();
    const raw = JSON.stringify(data);
    await cacheSet(key, raw, ttlSec);
    return raw;
  })();
  inflight.set(key, p);
  try {
    const raw = await p;
    return JSON.parse(raw) as T;
  } finally {
    inflight.delete(key);
  }
}

export const cacheKeys = {
  categories: "menu:categories",
  products: (opts: { categorySlug?: string; search?: string; limit?: number }) =>
    `menu:products:${opts.categorySlug ?? "all"}:${opts.search ?? ""}:${opts.limit ?? 100}`,
  productSlug: (slug: string) => `menu:product:slug:${slug}`,
  productId: (id: string) => `menu:product:id:${id}`,
  allergens: "menu:allergens",
  dietaryTags: "menu:dietary-tags",
  orderList: (status?: string | null) => `orders:list:${status ?? "all"}`,
  analytics: (name: string, args = "") => `analytics:${name}:${args}`,
};

/** Call after any catalog write (product/category/allergen/tag). */
export async function invalidateMenuCache(productId?: string, slug?: string): Promise<void> {
  await cacheDelByPrefix("menu:");
  if (productId) await cacheDel(cacheKeys.productId(productId));
  if (slug) await cacheDel(cacheKeys.productSlug(slug));
}

/** Call after any order write/transition so the kitchen board refreshes. */
export async function invalidateOrdersCache(): Promise<void> {
  await cacheDelByPrefix("orders:");
  await cacheDelByPrefix("analytics:");
}
