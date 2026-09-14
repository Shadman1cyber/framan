/**
 * Eval corpus runner (plan item: 30–50 real scenarios with expected outcomes).
 * Runs model-free explicit proposals through the REAL governed runtime against
 * the real dev DB: identity, scope, permission, execution, receipt.
 * Records per-scenario pass/fail + latency; prints p50/p95 and correctness.
 * Env: DATABASE_URL, AGENT_ENABLED=true, AGENT_CAFE_ID=<single cafe>.
 */
import { PrismaClient } from "@prisma/client";
import { AgentRuntime } from "../src/lib/agent/runtime";

type Pred = (receipt: unknown) => boolean;
interface Scenario {
  id: string;
  group: string;
  question: string;
  tool: string;
  input: Record<string, unknown>;
  expect: Pred;
  /** scenario whose CORRECT outcome is a denied/failed run */
  expectError?: string;
  userId?: string;
}

const db = new PrismaClient();
const rt = new AgentRuntime(db);
const OWNER = process.env.EVAL_OWNER ?? "agent-dev-owner";
const CAFE = process.env.AGENT_CAFE_ID!;
const cash = (n: number) => n.toLocaleString("fa-IR");
const j = (v: unknown) => v as Record<string, unknown>;
const arr = (v: unknown, k: string) => (Array.isArray(j(v)[k]) ? (j(v)[k] as Record<string, unknown>[]) : []);
const has = (label: string) => (r: unknown) => arr(r, "results").some(x => String(x.label ?? "").includes(label));

const sales = await db.order.aggregate({ where: { status: "COMPLETED" }, _sum: { total: true }, _count: true });
const KNOWN_TOTAL = sales._sum.total ?? 0;
const KNOWN_COUNT = sales._count;
const firstCompleted = await db.order.findFirst({ where: { status: "COMPLETED" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
console.error(`[eval] live source: ${KNOWN_COUNT} COMPLETED orders, total ${KNOWN_TOTAL} tomans, earliest ${firstCompleted?.createdAt.toISOString()}`);

const TEHRAN_DAY_FROM = "2026-09-09T20:30:00.000Z"; // Tehran 2026-09-10 00:00
const TEHRAN_DAY_TO = "2026-09-10T20:30:00.000Z"; // Tehran 2026-09-10 24:00
const D_BEFORE = ["2026-08-01T00:00:00.000Z", "2026-08-10T00:00:00.000Z"]; // before any data

export const SCENARIOS: Scenario[] = [
  // ── A. Catalog retrieval (search_catalog) ──
  { id: "cat-01", group: "catalog", question: "قهوه‌های منو را نشان بده", tool: "search_catalog", input: { query: "قهوه" }, expect: r => arr(r, "results").some(x => String(x.label).includes("اسپرسو")) && arr(r, "results").some(x => String(x.label).includes("کاپوچینو")) },
  { id: "cat-02", group: "catalog", question: "اسپرسو چیه؟", tool: "search_catalog", input: { query: "اسپرسو" }, expect: has("اسپرسو") },
  { id: "cat-03", group: "catalog", question: "کاپوچینو چیه؟", tool: "search_catalog", input: { query: "کاپوچینو" }, expect: has("کاپوچینو") },
  { id: "cat-04", group: "catalog", question: "زیر دسته‌های نوشیدنی گرم", tool: "search_catalog", input: { query: "نوشیدنی گرم" }, expect: r => arr(r, "results").some(x => String(x.label).includes("نوشیدنی گرم")) && arr(r, "results").some(x => String(x.label).includes("هات چاکلت")) },
  { id: "cat-05", group: "catalog", question: "نوشیدنی‌های سرد چی دارید؟", tool: "search_catalog", input: { query: "نوشیدنی سرد" }, expect: r => arr(r, "results").some(x => String(x.label).includes("آیس لته") || String(x.label).includes("کولد برو")) },
  { id: "cat-06", group: "catalog", question: "دسرها", tool: "search_catalog", input: { query: "دسر" }, expect: r => arr(r, "results").length > 0 },
  { id: "cat-07", group: "catalog", question: "latte دارید؟", tool: "search_catalog", input: { query: "latte" }, expect: has("لته") },
  { id: "cat-08", group: "catalog", question: "لته جو دوسر", tool: "search_catalog", input: { query: "لته جو دوسر" }, expect: has("لته جو دوسر") },
  { id: "cat-09", group: "catalog", question: "iced latte", tool: "search_catalog", input: { query: "iced latte" }, expect: has("آیس لته") },
  { id: "cat-10", group: "catalog", question: "کالبدشکافی xyzغیرموجود", tool: "search_catalog", input: { query: "xyzغیرموجود" }, expect: r => arr(r, "results").length === 0 && j(r).count === 0 },
  { id: "cat-11", group: "catalog", question: "گردو در چه محصولاتی هست؟", tool: "search_catalog", input: { query: "گردو" }, expect: has("گردو") },
  { id: "cat-12", group: "catalog", question: "تخم مرغ", tool: "search_catalog", input: { query: "تخم مرغ" }, expect: has("تخم مرغ") },
  { id: "cat-13", group: "catalog", question: "قیمت موکا چند است؟", tool: "search_catalog", input: { query: "موکا" }, expect: has("موکا") },
  { id: "cat-14", group: "catalog", question: "برای صبحانه چه دارید؟", tool: "search_catalog", input: { query: "صبحانه" }, expect: r => arr(r, "results").some(x => String(x.label).includes("کرواسان") || String(x.label).includes("صبحانه")) },
  // ── B. Orders ──
  { id: "ord-01", group: "orders", question: "سفارش‌های اخیر", tool: "list_orders", input: {}, expect: r => arr(r, "orders").length > 0 && arr(r, "orders").length <= 10 },
  { id: "ord-02", group: "orders", question: "سفارش‌های تکمیل‌شده", tool: "list_orders", input: { status: "COMPLETED" }, expect: r => arr(r, "orders").length > 0 && arr(r, "orders").every(o => o.status === "COMPLETED") },
  { id: "ord-03", group: "orders", question: "۵ سفارش در انتظار", tool: "list_orders", input: { status: "PENDING", take: 5 }, expect: r => arr(r, "orders").length <= 5 && arr(r, "orders").every(o => o.status === "PENDING") },
  { id: "ord-04", group: "orders", question: "سفارش‌های لغوشده", tool: "list_orders", input: { status: "CANCELLED" }, expect: r => arr(r, "orders").length > 0 && arr(r, "orders").every(o => o.status === "CANCELLED") },
  { id: "ord-05", group: "orders", question: "سفارش‌های آماده", tool: "list_orders", input: { status: "READY" }, expect: r => j(r).count === 0 && arr(r, "orders").length === 0 },
  { id: "ord-06", group: "orders", question: "جزئیات سفارش نمونه", tool: "get_order", input: { orderId: "cmtsgf6sv000awrvrr83q38s5" }, expect: r => (j(r).order ? j(r).order.total : j(r).total) === 435000 },
  { id: "ord-07", group: "orders", question: "سفارش وجود ندارد", tool: "get_order", input: { orderId: "eval-nonexistent-order" }, expect: () => true, expectError: "TARGET_NOT_FOUND" },
  // ── C. Finance (live source only) ──
  // All 8 COMPLETED orders live in Tehran days Sep 7–8 2026 (verified live source):
  // earliest 2026-09-07T15:25Z (Tehran Sep 7 18:55), latest 2026-09-08T09:15Z (Tehran Sep 8 12:45).
  { id: "fin-01", group: "finance", question: "فروش روزهای ۷ و ۸ شهریور تهران", tool: "calculate_sales_report", input: { from: "2026-09-06T20:30:00.000Z", to: "2026-09-08T20:30:00.000Z" }, expect: r => j(r).total === KNOWN_TOTAL && j(r).count === KNOWN_COUNT },
  { id: "fin-02", group: "finance", question: "فروش ابتدای مرداد/اوت (قبل از داده)", tool: "calculate_sales_report", input: { from: D_BEFORE[0], to: D_BEFORE[1] }, expect: r => j(r).total === 0 && j(r).count === 0 },
  { id: "fin-03", group: "finance", question: "فروش ماه گذشته", tool: "calculate_sales_report", input: { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" }, expect: r => j(r).total === KNOWN_TOTAL },
  { id: "fin-04", group: "finance", question: "بازه معکوس (باید رد شود)", tool: "calculate_sales_report", input: { from: TEHRAN_DAY_TO, to: TEHRAN_DAY_FROM }, expect: () => true, expectError: "SCHEMA_REJECTED" },
  { id: "fin-05", group: "finance", question: "بازه بیش از ۳۱ روز (باید رد شود)", tool: "calculate_sales_report", input: { from: "2026-08-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" }, expect: () => true, expectError: "SCHEMA_REJECTED" },
  { id: "fin-06", group: "finance", question: "فروش فقط روز ۷ شهریور تهران (۶ سفارش)", tool: "calculate_sales_report", input: { from: "2026-09-06T20:30:00.000Z", to: "2026-09-07T20:30:00.000Z" }, expect: r => j(r).total === 1075000 && j(r).count === 6 },
  // ── D. Inventory ──
  // run-path semantics: count = total matching, ingredients = bounded page (take default 20)
  { id: "inv-01", group: "inventory", question: "موجودی انبار", tool: "list_inventory", input: {}, expect: r => j(r).count === 26 && arr(r, "ingredients").length <= 20 && arr(r, "ingredients").every(i => i.minQuantity != null) },
  { id: "inv-02", group: "inventory", question: "مواد کم‌موجود", tool: "list_inventory", input: { lowOnly: true }, expect: r => j(r).count === 0 },
  { id: "inv-03", group: "inventory", question: "سه قلم اول انبار", tool: "list_inventory", input: { take: 3 }, expect: r => arr(r, "ingredients").length <= 3 },
  { id: "inv-04", group: "inventory", question: "موجودی شیر تازه", tool: "list_inventory", input: {}, expect: r => arr(r, "ingredients").some(i => i.nameFa === "شیر تازه" && i.stockQuantity === 12000 && i.unit === "MILLILITER") },
  // ── E. Staff & reservations ──
  { id: "stf-01", group: "staff", question: "کارکنان کافه", tool: "list_staff", input: {}, expect: r => arr(r, "staff").length === 3 && arr(r, "staff").every(s => !("password" in s) && !("pin" in s)) },
  { id: "stf-02", group: "staff", question: "رزروهای پیش‌رو", tool: "list_reservations", input: {}, expect: r => j(r).count === 0 },
  { id: "stf-03", group: "staff", question: "۵ رزرو بعدی", tool: "list_reservations", input: { take: 5 }, expect: r => arr(r, "reservations").length === 0 },
  // ── E2. Remaining admin sections (full coverage) ──
  { id: "sec-01", group: "sections", question: "همه محصولات را فهرست کن", tool: "list_products", input: {}, expect: r => j(r).count > 0 && arr(r, "products").some(p => p.nameFa === "اسپرسو") && j(r).source === "Product:live" },
  { id: "sec-02", group: "sections", question: "دسته‌های منو", tool: "list_categories", input: {}, expect: r => arr(r, "categories").length >= 8 && arr(r, "categories").some(c => c.nameFa === "قهوه" && c.productCount >= 1) },
  { id: "sec-03", group: "sections", question: "میزهای کافه", tool: "list_tables", input: {}, expect: r => j(r).source === "CafeTable:live" && Array.isArray(r.tables ?? r["tables"]) },
  { id: "sec-04", group: "sections", question: "کدهای QR", tool: "list_qr_codes", input: {}, expect: r => Array.isArray(j(r).qrCodes) },
  { id: "sec-05", group: "sections", question: "کاربران سیستم", tool: "list_users", input: {}, expect: r => j(r).count >= 1 && arr(r, "users").every(u => !("passwordHash" in u) && !("phone" in u)) },
  { id: "sec-06", group: "sections", question: "امتیازهای مشتریان", tool: "list_ratings", input: {}, expect: r => Array.isArray(j(r).ratings) },
  { id: "sec-07", group: "sections", question: "فهرست آلرژن‌ها", tool: "list_allergens", input: {}, expect: r => j(r).count === 9 && arr(r, "allergens").some(a => a.nameFa === "تخم مرغ") },
  // ── F. Status & lessons ──
  { id: "sts-01", group: "status", question: "وضعیت دستیار", tool: "get_ai_status", input: {}, expect: r => j(r).verified === true && j(r).source === "Setting:ai.enabled" && typeof j(r).version === "string" },
  { id: "sts-02", group: "status", question: "درس‌های فعال", tool: "list_lessons", input: {}, expect: r => typeof j(r).count === "number" && Array.isArray(j(r).lessons) },
  { id: "sts-03", group: "status", question: "درس‌های موضوع مالی", tool: "list_lessons", input: { topic: "finance" }, expect: r => Array.isArray(j(r).lessons) },
  { id: "sts-04", group: "status", question: "وضعیت دستیار (تکرار برای قطعیت)", tool: "get_ai_status", input: {}, expect: r => j(r).verified === true },
  // ── G. Governance denials (correct outcome = rejection) ──
  { id: "gov-01", group: "governance", question: "کارمند ساده درخواست می‌دهد", tool: "list_orders", input: {}, expect: () => true, expectError: "FORBIDDEN", userId: "eval-cashier" },
  { id: "gov-02", group: "governance", question: "کاربر ناشناس", tool: "list_orders", input: {}, expect: () => true, expectError: "FORBIDDEN", userId: "eval-unknown-user" },
];

function pctl(xs: number[], p: number) {
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] * 10) / 10;
}

const results: { id: string; group: string; ok: boolean; ms: number; note: string }[] = [];
const cashier = await db.user.upsert({ where: { id: "eval-cashier" }, create: { id: "eval-cashier", email: "eval-cashier@farmans.cafe", passwordHash: "-", role: "CASHIER" }, update: {} });

for (const sc of SCENARIOS) {
  const t0 = performance.now();
  let ok = false, note = "";
  try {
    const run = await rt.create(sc.userId ?? OWNER, {
      key: `eval-${sc.id}-${Math.random().toString(36).slice(2, 8)}`,
      proposal: { tool: sc.tool as never, input: sc.input as never },
    });
    if (sc.expectError) {
      // denial/scenario where creation itself must fail happens here already
      note = `created=${run.state}`;
      ok = false; // executed runs below; error-scenarios must throw
    }
    const done = await rt.execute(sc.userId ?? OWNER, run.id);
    const receipt = done.result ? JSON.parse(done.result) : null;
    if (sc.expectError) {
      ok = false;
      note = `expected ${sc.expectError} but run reached ${done.state}`;
    } else if (done.state === "succeeded") {
      ok = sc.expect(receipt);
      note = ok ? "receipt matched" : `receipt mismatch: ${JSON.stringify(receipt).slice(0, 180)}`;
    } else {
      note = `run state ${done.state}, lastError=${done.lastError ?? "-"}`;
    }
  } catch (e) {
    const zod = e instanceof Error && e.name === "ZodError";
    const code = zod ? "SCHEMA_REJECTED" : ((e as { code?: string }).code ?? (e instanceof Error ? e.message.slice(0, 60) : String(e)));
    if (sc.expectError) {
      const run = await db.agentRun.findFirst({ where: { key: { startsWith: `eval-${sc.id}-` } }, orderBy: { createdAt: "desc" } });
      const lastError = run?.lastError ?? code;
      ok = code === sc.expectError || lastError === sc.expectError;
      note = ok ? `rejected as expected (${sc.expectError})` : `expected ${sc.expectError}, got ${code}/${lastError}`;
    } else {
      note = `unexpected error ${code}`;
    }
  }
  results.push({ id: sc.id, group: sc.group, ok, ms: Math.round((performance.now() - t0) * 10) / 10, note });
}

await db.user.deleteMany({ where: { id: "eval-cashier" } });
const created = await db.agentRun.findMany({ where: { key: { startsWith: "eval-" } }, select: { id: true } });
await db.agentRun.deleteMany({ where: { key: { startsWith: "eval-" } } });
const passed = results.filter(r => r.ok).length;
const lat = results.map(r => r.ms);
const byGroup: Record<string, { pass: number; total: number }> = {};
for (const r of results) { byGroup[r.group] ??= { pass: 0, total: 0 }; byGroup[r.group].total++; if (r.ok) byGroup[r.group].pass++; }
const summary = {
  scenarios: results.length, passed, failed: results.length - passed,
  correctnessPct: Math.round((passed / results.length) * 1000) / 10,
  latencyMs: { p50: pctl(lat, 50), p95: pctl(lat, 95), max: pctl(lat, 100) },
  byGroup, cleanedRuns: created.length,
  note: "model-free governed path (explicit proposals); tokens: 0 (no model calls); planner/provider token baselines remain a separate live pass",
};
console.log(JSON.stringify(summary, null, 1));
console.log(results.map(r => `${r.ok ? "PASS" : "FAIL"} ${r.id.padEnd(7)} ${String(r.ms).padStart(6)}ms  ${r.note.slice(0, 100)}`).join("\n"));
await db.$disconnect();