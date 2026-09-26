/**
 * Click-tests the three FARMAN module routes and proves their charts inherit the
 * module accent from `data-theme` (no per-instance color prop).
 *
 *   node scripts/verify-dashboard-modules.mjs [baseUrl]
 *
 * Screenshots land in artifacts/dashboard-modules/.
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.argv[2] ?? "http://localhost:3080";
const OUT = new URL("../artifacts/dashboard-modules/", import.meta.url).pathname;
const CREDENTIALS = { email: "admin@cafe13.ir", password: "admin1234" };

const EXPECTED = {
  accounting: {
    rgb: "rgb(34, 230, 176)",
    name: "teal",
    cards: ["درآمد ۶ ماه گذشته", "فروش امروز", "پرداخت‌های معوق"],
    related: ["/admin/financial?tab=summary", "/admin/sales-flow"],
    relatedLabels: ["گزارش مالی", "جریان فروش"],
    removedLabels: ["خلاصه مالی", "فروش و تقاضا", "دسته‌بندی محصولات", "تعیین هدف", "نیازهای عملیات"],
  },
  erp: {
    rgb: "rgb(79, 134, 255)",
    name: "blue",
    cards: ["سطح موجودی انبار", "وضعیت تأمین", "موجودی در آستانه اتمام"],
    related: ["/admin/inventory", "/admin/categories", "/admin/products", "/admin/allergens", "/admin/staff"],
    relatedLabels: ["انبار مواد اولیه", "دسته‌ها", "محصولات", "آلرژن‌ها", "پرسنل و مرخصی‌ها"],
    removedLabels: ["نیازهای عملیات"],
  },
  crm: {
    rgb: "rgb(155, 92, 246)",
    name: "purple",
    cards: ["مشتریان جدید ۶ ماه گذشته", "قیف فروش", "نرخ بازگشت مشتری"],
    related: ["/admin/customers", "/admin/ratings", "/admin/tables", "/admin/qr"],
    relatedLabels: ["باشگاه مشتریان", "امتیازها", "میزها و رزرو میزها", "کدهای QR"],
    removedLabels: [],
  },
};

/** Feed shared by every module page, so it is not treated as a leak. */
const SHARED_COPY = ["آخرین فعالیت‌ها"];

const results = [];
const record = (scope, check, pass, detail = "") => {
  results.push({ scope, check, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  [${scope}] ${check}${detail ? ` — ${detail}` : ""}`);
};

const rgbEq = (a, b) => a.replace(/\s+/g, "") === b.replace(/\s+/g, "");

/** The element that actually paints the dark shell background. */
const shellBackground = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-shell="dashboard"]') ?? document.querySelector("[data-module-page]");
    return el ? getComputedStyle(el).backgroundColor : "";
  });

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (error) => record("runtime", "no page errors", false, error.message));

await page.goto(`${BASE}/admin/login`, { waitUntil: "domcontentloaded" });
await page.fill("#email", CREDENTIALS.email);
await page.fill("#password", CREDENTIALS.password);
await Promise.all([page.waitForURL(/\/admin(\?|$)/, { timeout: 45000 }), page.click('button[type="submit"]')]);
await page.waitForSelector('[data-testid="ring-accounting"]');
record("auth", "signed in and home rings rendered", true, page.url());

/* ---------------------------------------------------------------- home screen */
const home = await page.content();
const leaked = ["فروش امروز", "موجودی در آستانه اتمام", "پرداخت‌های معوق", "آخرین فعالیت‌ها"].filter((text) => home.includes(text));
record("home", "no module detail leaks into home", leaked.length === 0, leaked.join(", "));
for (const kind of Object.keys(EXPECTED)) {
  const ring = page.locator(`[data-testid="ring-${kind}"]`);
  const button = page.locator(`[data-testid="ring-button-${kind}"]`);
  const ringTag = await ring.evaluate((el) => el.tagName);
  const buttonTag = await button.evaluate((el) => el.tagName);
  const ringHref = await ring.getAttribute("href");
  const buttonHref = await button.getAttribute("href");
  const bothLinks = ringTag === "A" && buttonTag === "A" && ringHref === buttonHref && ringHref === `/admin/${kind}`;
  record("home", `${kind}: ring + button are anchors to the same route`, bothLinks, `${ringTag} ${ringHref} / ${buttonTag} ${buttonHref}`);
  const themed = await ring.evaluate((el) => el.closest("[data-theme]")?.getAttribute("data-theme"));
  record("home", `${kind}: ring sits in a data-theme="${kind}" scope`, themed === kind, String(themed));
  const arcColor = await page.locator(`[data-testid="ring-arc-${kind}"]`).evaluate((el) => getComputedStyle(el).stroke);
  record("home", `${kind}: ring arc renders ${EXPECTED[kind].name}`, rgbEq(arcColor, EXPECTED[kind].rgb), arcColor);
}
await page.hover('[data-testid="ring-erp"]');
await page.waitForTimeout(500);
const hoverState = await page.locator('[data-testid="ring-erp"]').evaluate((el) => ({
  transform: getComputedStyle(el).transform,
  filter: getComputedStyle(el).filter,
}));
const lifted = hoverState.transform !== "none" && !/matrix\(1, 0, 0, 1, 0, 0\)$/.test(hoverState.transform);
record("home", "ring hover is visible (lift + brightness)", lifted && hoverState.filter.includes("brightness"), `${hoverState.transform} / ${hoverState.filter}`);
await page.screenshot({ path: `${OUT}home.png`, fullPage: true });

/* keyboard reachability: tab into the target, then read its focus ring.
   `focus()` alone would not match :focus-visible, so real Tab presses are used,
   and the read waits for the outline transition to settle. */
const tabTo = async (testId, limit = 40) => {
  await page.keyboard.press("Tab");
  for (let i = 0; i < limit; i += 1) {
    const id = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
    if (id === testId) return true;
    await page.keyboard.press("Tab");
  }
  return false;
};
const outlineOf = async (testId) => {
  await page.waitForTimeout(500);
  return page.locator(`[data-testid="${testId}"]`).evaluate((el) => {
    const style = getComputedStyle(el);
    return { width: style.outlineWidth, color: style.outlineColor };
  });
};
const focusRingIs = (outline, rgb) => parseFloat(outline.width) > 0 && rgbEq(outline.color, rgb);

const reachedRing = await tabTo("ring-accounting");
const ringOutline = reachedRing ? await outlineOf("ring-accounting") : { width: "none", color: "" };
record(
  "home",
  "ring is keyboard reachable with a module-colored focus ring",
  reachedRing && focusRingIs(ringOutline, EXPECTED.accounting.rgb),
  `${ringOutline.width} ${ringOutline.color}`,
);

const reachedButton = reachedRing && (await tabTo("ring-button-accounting", 3));
const buttonOutline = reachedButton ? await outlineOf("ring-button-accounting") : { width: "none", color: "" };
record(
  "home",
  "ring button is keyboard reachable with a module-colored focus ring",
  reachedButton && focusRingIs(buttonOutline, EXPECTED.accounting.rgb),
  `${buttonOutline.width} ${buttonOutline.color}`,
);

/* -------------------------------------------------------------- module routes */
for (const kind of Object.keys(EXPECTED)) {
  const { rgb, name } = EXPECTED[kind];
  const others = Object.keys(EXPECTED).filter((other) => other !== kind);

  for (const target of ["ring", "button"]) {
    await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(`[data-testid="ring-${kind}"]`);
    await page.click(`[data-testid="${target === "ring" ? `ring-${kind}` : `ring-button-${kind}`}"]`);
    await page.waitForURL(`**/admin/${kind}`, { timeout: 30000 });
    await page.waitForSelector(`[data-module-page="${kind}"]`);
    record(kind, `clicking the ${target} lands on /admin/${kind}`, new URL(page.url()).pathname === `/admin/${kind}`, page.url());
  }

  const root = page.locator(`[data-module-page="${kind}"]`);
  record(kind, "page root sets the module theme attribute", (await root.count()) === 1);

  const heading = await page.locator("h1").first().innerText();
  const label = { accounting: "حسابداری", erp: "ERP", crm: "CRM" }[kind];
  record(kind, "page shows its own header", heading.trim() === label, heading.trim());

  const body = await page.locator("[data-module-page]").innerText();
  for (const own of EXPECTED[kind].cards) {
    record(kind, `own card «${own}» is present`, body.includes(own));
  }
  for (const other of others) {
    const foreignRoots = await page.locator(`[data-module-page="${other}"]`).count();
    const foreignCards = EXPECTED[other].cards.filter((title) => body.includes(title));
    record(
      kind,
      `no ${other} content on the page`,
      foreignRoots === 0 && foreignCards.length === 0,
      `foreign roots: ${foreignRoots}${foreignCards.length ? `, foreign cards: ${foreignCards.join(", ")}` : ""}`,
    );
  }
  record(kind, "shared activity feed still available", SHARED_COPY.every((text) => body.includes(text)));
  record(kind, "back/home link present at the top", (await page.locator('[data-testid="back-home"]').getAttribute("href")) === "/admin");

  const relatedHrefs = await page
    .locator('nav[aria-label="بخش‌های مرتبط"] a')
    .evaluateAll((els) => els.map((el) => el.getAttribute("href")));
  record(
    kind,
    "related old sections are linked from the module page",
    EXPECTED[kind].related.every((href) => relatedHrefs.includes(href)) && relatedHrefs.length === EXPECTED[kind].related.length,
    relatedHrefs.join(", "),
  );
  // Persian labels carry ZWNJ (U+200C); normalise both sides before comparing.
  const normalize = (text) => text.replace(/[‌‍]/g, "").replace(/\s+/g, " ").trim();
  const relatedLabels = await page
    .locator('nav[aria-label="بخش‌های مرتبط"] a')
    .evaluateAll((els) => els.map((el) => el.textContent ?? ""));
  record(
    kind,
    "related links carry the expected labels",
    EXPECTED[kind].relatedLabels.every((label) => relatedLabels.some((text) => normalize(text).includes(normalize(label)))),
    relatedLabels.map(normalize).join(" | "),
  );
  const stillPresent = EXPECTED[kind].removedLabels.filter((label) => relatedLabels.some((text) => normalize(text).includes(normalize(label))));
  record(
    kind,
    "removed related links are gone",
    stillPresent.length === 0,
    stillPresent.join(", "),
  );

  const reachedBack = await tabTo("back-home");
  const backOutline = reachedBack ? await outlineOf("back-home") : { width: "none", color: "" };
  record(
    kind,
    `back link is keyboard reachable with a ${name} focus ring`,
    reachedBack && focusRingIs(backOutline, rgb),
    `${backOutline.width} ${backOutline.color}`,
  );

  /* color: every chart resolves from the theme, not from a call-site prop */
  const bars = await page.locator('[data-testid="bar-chart"] div[style*="background-color"]').evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
  record(kind, `bar chart bars are ${name}`, bars.length > 0 && bars.every((c) => rgbEq(c, rgb)), bars.join(" | ") || "none");

  const meters = await page.locator('[data-testid="progress-bar"] div[style*="background-color"]').evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
  if (meters.length) record(kind, `progress bars are ${name}`, meters.every((c) => rgbEq(c, rgb)), meters.join(" | "));

  const rings = await page.locator('[data-testid="mini-ring"] circle[stroke]').evaluateAll((els) => els.map((el) => getComputedStyle(el).stroke));
  record(kind, `secondary rings are ${name}`, rings.length > 0 && rings.every((c) => rgbEq(c, rgb)), rings.join(" | "));

  const spark = await page.locator('[data-testid="sparkline"] path[stroke]').evaluateAll((els) => els.map((el) => getComputedStyle(el).stroke));
  if (spark.length) record(kind, `sparkline is ${name}`, spark.every((c) => rgbEq(c, rgb)), spark.join(" | "));

  const headerArc = await page.locator("header [data-testid='mini-ring'] circle[stroke]").first().evaluate((el) => getComputedStyle(el).stroke);
  record(kind, `header ring is ${name}`, rgbEq(headerArc, rgb), headerArc);

  const accentText = await page.locator('[data-testid="module-badge"]').evaluate((el) => getComputedStyle(el).color);
  record(kind, `header icon is ${name}`, rgbEq(accentText, rgb), accentText);

  const literalProps = await page.evaluate(() =>
    [...document.querySelectorAll("[data-chart-color]")]
      .map((el) => el.getAttribute("data-chart-color"))
      .filter((value) => value !== "var(--module-primary)"),
  );
  record(kind, "no chart receives a per-instance color prop", literalProps.length === 0, [...new Set(literalProps)].join(", "));

  const noLiterals = await page.evaluate(() => {
    const root = document.querySelector("[data-module-page]");
    const offenders = [...root.querySelectorAll("*")].filter((el) => /#(22e6b0|17b894|4f86ff|9b5cf6)/i.test(el.getAttribute("style") ?? ""));
    return offenders.length;
  });
  record(kind, "no hardcoded module hex in inline styles", noLiterals === 0, `${noLiterals} offenders`);

  await page.screenshot({ path: `${OUT}${kind}.png`, fullPage: true });
}

/* ------------------------------------------- old section tabs, regrouped */
await page.goto(`${BASE}/admin/accounting`, { waitUntil: "domcontentloaded" });
await page.click('nav[aria-label="بخش‌های مرتبط"] a[href="/admin/financial?tab=summary"]');
await page.waitForURL("**/admin/financial?tab=summary", { timeout: 30000 });
await page.waitForSelector('[role="tablist"]');
const summarySelected = await page
  .locator('[role="tab"]', { hasText: "خلاصه مالی" })
  .getAttribute("aria-selected");
record("accounting", "«خلاصه مالی» deep link opens that financial tab", summarySelected === "true", String(summarySelected));
const goalsSelected = await page
  .locator('[role="tab"]', { hasText: "تعیین هدف" })
  .getAttribute("aria-selected");
record("accounting", "other financial tabs stay inactive", goalsSelected === "false", String(goalsSelected));
await page.click('[role="tab"] >> text=تعیین هدف');
await page.waitForURL("**/admin/financial?tab=goals", { timeout: 30000 });
record("accounting", "financial tab switch keeps the tab in the URL", true, page.url());

await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('nav[aria-label="ناوبری مدیریت"]', { state: "detached" });
record("nav", "the legacy sidebar no longer renders on any admin page", true, "dashboard has no admin nav");
await page.fill("#dashboard-search", "دستیار");
await page.waitForSelector('a[href="/admin/ai"]');
record("nav", "header search still reaches the assistant", true, "دستیار → /admin/ai");
await page.fill("#dashboard-search", "");

/* ------------------------------------- گزارش مالی on the design system */
const DASHBOARD_NAVY = "rgb(10, 16, 32)";
const PANEL_SURFACE = "rgb(17, 26, 46)";
const LEGACY_SURFACE = "rgb(36, 39, 43)";

await page.goto(`${BASE}/admin/financial?tab=summary`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-module-page="accounting"]');
const financialRelated = await page
  .locator('nav[aria-label="بخش‌های مرتبط"] a')
  .evaluateAll((els) => els.map((el) => el.getAttribute("href")));
record(
  "financial",
  "sales flow and accounting are reachable from the financial report",
  financialRelated.includes("/admin/sales-flow") && financialRelated.includes("/admin/accounting"),
  financialRelated.join(", "),
);
await page.click('nav[aria-label="بخش‌های مرتبط"] a[href="/admin/sales-flow"]');
await page.waitForURL("**/admin/sales-flow", { timeout: 30000 });
const flowHeading = await page.locator("h1").first().innerText();
record("financial", "clicking «جریان فروش» lands on the sales-flow page", flowHeading.trim() === "جریان فروش", `${page.url()} — ${flowHeading.trim()}`);
await page.goto(`${BASE}/admin/financial?tab=summary`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-module-page="accounting"]');

const sidebarCount = await page.locator('nav[aria-label="ناوبری مدیریت"]').count();
const asideCount = await page.locator("aside.admin-desktop-sidebar").count();
record("financial", "sidebar is fully removed", sidebarCount === 0 && asideCount === 0, `nav=${sidebarCount} aside=${asideCount}`);

const pageBg = await page.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor);
const shellBg = await shellBackground(page);
record("financial", "page renders on the dark navy shell", shellBg === DASHBOARD_NAVY, `shell=${shellBg} body=${pageBg}`);

const financialTabs = await page.locator('[role="tab"]').allInnerTexts();
record(
  "financial",
  "all four tabs are present",
  ["خلاصه مالی", "فروش و تقاضا", "دسته‌بندی محصولات", "تعیین هدف"].every((label) => financialTabs.some((text) => text.includes(label))),
  financialTabs.map((text) => text.trim()).join(" | "),
);

const summaryCopy = await page.locator('[data-module-page="accounting"]').innerText();
const kept = ["درآمد امروز", "درآمد هفته", "درآمد ماه", "سفارش‌های امروز", "شاخص‌ها", "روند فروش ۱۴ روز اخیر", "پرفروش‌ترین محصولات", "درآمد بر اساس دسته", "مواد کم‌موجود"].filter((text) => !summaryCopy.includes(text));
record("financial", "summary keeps all of its existing sections", kept.length === 0, kept.join(", "));

const trendBars = await page.locator('[data-testid="bar-chart"] div[style*="background-color"]').evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
record("financial", `sales trend chart is ${EXPECTED.accounting.name}`, trendBars.length > 0 && trendBars.every((c) => rgbEq(c, EXPECTED.accounting.rgb)), `${trendBars.length} bars`);

await page.goto(`${BASE}/admin/financial?tab=goals`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-legacy-surface="dashboard"]');
await page.waitForSelector('[role="img"][aria-label*="پیشرفت"]', { timeout: 30000 });
const donut = await page.locator('[role="img"][aria-label*="پیشرفت"] circle').evaluateAll((els) => els.map((el) => getComputedStyle(el).stroke));
record("financial", "shared goal donuts use the dashboard ring tokens", donut.length > 1 && donut.every((c) => c !== "rgb(239, 227, 203)"), donut.join(" | "));
const panelCard = await page.locator('[data-legacy-surface="dashboard"] .card').first().evaluate((el) => getComputedStyle(el).backgroundColor);
record("financial", "shared panel cards use the dashboard surface", panelCard === PANEL_SURFACE, panelCard);

await page.goto(`${BASE}/admin/financial?tab=sales`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-legacy-surface="dashboard"]');
await page.waitForSelector('[data-legacy-surface="dashboard"] .card', { timeout: 30000 });
await page.waitForTimeout(1500);
const legacyFills = await page.evaluate(() => {
  const root = document.querySelector('[data-legacy-surface="dashboard"]');
  const pale = [];
  for (const el of root.querySelectorAll("*")) {
    const bg = getComputedStyle(el).backgroundColor;
    // The legacy olive (#7c93b5) columns read as a pale block on navy.
    if (bg === "rgb(124, 147, 181)" || bg === "rgba(124, 147, 181, 0.7)") pale.push(bg);
  }
  return pale;
});
record("financial", "shared panel charts use the module accent, not the pale legacy fill", legacyFills.length === 0, legacyFills.join(" | "));

/* ------------------------------------- جریان فروش on the design system */
await page.goto(`${BASE}/admin/sales-flow`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-module-page="accounting"]', { timeout: 60000 });
await page.waitForSelector("table", { timeout: 60000 });
// The wait-time panel fetches on its own; wait for its CSV control before the copy check.
await page
  .waitForFunction(() => document.body.innerText.includes("خروجی CSV اتلاف‌ها"), undefined, { timeout: 60000 })
  .catch(() => {});
const flowSidebar = await page.locator('nav[aria-label="ناوبری مدیریت"]').count();
const flowAside = await page.locator("aside.admin-desktop-sidebar").count();
record("sales-flow", "sidebar is fully removed", flowSidebar === 0 && flowAside === 0, `nav=${flowSidebar} aside=${flowAside}`);
const flowShell = await shellBackground(page);
record("sales-flow", "page renders on the dark navy shell", flowShell === DASHBOARD_NAVY, flowShell);

const flowText = await page.locator('[data-module-page="accounting"]').innerText();
const flowKept = [
  "کل سفارش‌ها", "کل درآمد", "تعداد آیتم‌ها", "سفارش‌های لغو", "میانگین سفارش",
  "نمودار درآمد بر اساس بازه زمانی", "جدول جزئیات", "زمان انتظار و گلوگاه‌ها", "تنظیمات جاری",
  "بروزرسانی خودکار", "خروجی CSV اتلاف‌ها",
].filter((text) => !flowText.includes(text));
record("sales-flow", "all existing sections and controls are kept", flowKept.length === 0, flowKept.join(", "));

const flowBars = await page.evaluate(() => {
  const root = document.querySelector('[data-module-page="accounting"]');
  const bars = [...root.querySelectorAll("div[style*='height']")].map((el) => getComputedStyle(el).backgroundColor);
  const pale = bars.filter((bg) => bg === "rgb(124, 147, 181)" || bg === "rgba(124, 147, 181, 0.7)");
  const accent = bars.filter((bg) => bg.startsWith("rgb(34, 230, 176") || bg.startsWith("rgba(34, 230, 176"));
  return { total: bars.length, pale: pale.length, accent: accent.length };
});
record(
  "sales-flow",
  `revenue bars use the module accent, not the pale legacy fill`,
  flowBars.total > 0 && flowBars.pale === 0 && flowBars.accent > 0,
  `${flowBars.total} bars, ${flowBars.accent} accent, ${flowBars.pale} pale`,
);
const revenueCell = await page.locator("table tbody tr .module-accent-text").first().evaluate((el) => getComputedStyle(el).color);
record("sales-flow", `revenue column is ${EXPECTED.accounting.name}`, rgbEq(revenueCell, EXPECTED.accounting.rgb), revenueCell);

const flowRelated = await page
  .locator('nav[aria-label="بخش‌های مرتبط"] a')
  .evaluateAll((els) => els.map((el) => el.getAttribute("href")));
record(
  "sales-flow",
  "accounting is reachable from the sales-flow page",
  flowRelated.includes("/admin/accounting"),
  flowRelated.join(", "),
);

await page.click('nav[aria-label="بخش‌های مرتبط"] a[href="/admin/accounting"]');
await page.waitForURL("**/admin/accounting", { timeout: 30000 });
await page.waitForSelector('[data-module-page="accounting"]');
const accountingHeading = await page.locator("h1").first().innerText();
record("sales-flow", "clicking «حسابداری» lands on the accounting page", accountingHeading.trim() === "حسابداری", `${page.url()} — ${accountingHeading.trim()}`);

await page.goto(`${BASE}/admin/sales-flow`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-module-page="accounting"]', { timeout: 60000 });

await page.goto(`${BASE}/admin/sales-flow/settings`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-shell="dashboard"]', { timeout: 60000 });
const settingsSidebar = await page.locator('nav[aria-label="ناوبری مدیریت"]').count();
const settingsShell = await shellBackground(page);
record("sales-flow", "the settings sub-page is on the new design too", settingsSidebar === 0 && settingsShell === DASHBOARD_NAVY, `nav=${settingsSidebar} shell=${settingsShell}`);

/* ---------------------------- ERP + CRM admin sections on the design system */
const SECTIONS = [
  { path: "/admin/inventory", kind: "erp", label: "انبار مواد اولیه" },
  { path: "/admin/categories", kind: "erp", label: "دسته‌ها" },
  { path: "/admin/products", kind: "erp", label: "محصولات" },
  { path: "/admin/customers", kind: "crm", label: "باشگاه مشتریان" },
  { path: "/admin/ratings", kind: "crm", label: "امتیازها" },
  { path: "/admin/tables", kind: "crm", label: "میزها و رزرو میزها" },
];

for (const section of SECTIONS) {
  const { path, kind, label } = section;
  const { rgb, name } = EXPECTED[kind];
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(`[data-module-page="${kind}"]`, { timeout: 60000 });
  await page.waitForSelector('[data-legacy-surface="dashboard"]', { timeout: 60000 });

  const nav = await page.locator('nav[aria-label="ناوبری مدیریت"]').count();
  const aside = await page.locator("aside.admin-desktop-sidebar").count();
  record(path, "sidebar is fully removed", nav === 0 && aside === 0, `nav=${nav} aside=${aside}`);

  const shell = await shellBackground(page);
  record(path, "page renders on the dark navy shell", shell === DASHBOARD_NAVY, shell);

  const heading = await page.locator("h1").first().innerText();
  record(path, "page shows its own header", heading.trim() === label, heading.trim());

  const badge = await page.locator('[data-testid="module-badge"]').evaluate((el) => getComputedStyle(el).color);
  record(path, `header icon uses the ${name} module accent`, rgbEq(badge, rgb), badge);

  const panel = await page.locator('[data-legacy-surface="dashboard"] .card').first().evaluate((el) => getComputedStyle(el).backgroundColor);
  record(path, "legacy cards are remapped to the dashboard surface", panel === PANEL_SURFACE, panel);

  const relatedHrefs = await page
    .locator('nav[aria-label="بخش‌های مرتبط"] a')
    .evaluateAll((els) => els.map((el) => el.getAttribute("href")));
  const expectedRelated = [
    `/admin/${kind}`,
    ...(kind === "erp"
      ? ["/admin/inventory", "/admin/categories", "/admin/products", "/admin/allergens", "/admin/staff"]
      : ["/admin/customers", "/admin/ratings", "/admin/tables", "/admin/qr"]),
  ].filter((href) => href !== path);
  record(
    path,
    "links back to its module and sibling sections (never itself)",
    expectedRelated.every((href) => relatedHrefs.includes(href)) && !relatedHrefs.includes(path) && relatedHrefs.length === expectedRelated.length,
    relatedHrefs.join(", "),
  );
}

await page.goto(`${BASE}/admin/customers`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('nav[aria-label="بخش‌های مرتبط"] a[href="/admin/crm"]');
await page.click('nav[aria-label="بخش‌های مرتبط"] a[href="/admin/crm"]');
await page.waitForURL("**/admin/crm", { timeout: 30000 });
record("/admin/customers", "clicking «CRM» returns to the module page", (await page.locator('[data-module-page="crm"]').count()) === 1, page.url());

await page.goto(`${BASE}/admin/erp`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('nav[aria-label="بخش‌های مرتبط"] a[href="/admin/inventory"]');
await page.click('nav[aria-label="بخش‌های مرتبط"] a[href="/admin/inventory"]');
await page.waitForURL("**/admin/inventory", { timeout: 30000 });
record("/admin/erp", "clicking «انبار مواد اولیه» opens the ERP section", (await page.locator('[data-module-page="erp"]').count()) === 1, page.url());

/* ------------------------------- میزها + رزرو میزها combined page */
await page.goto(`${BASE}/admin/tables`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-module-page="crm"]', { timeout: 60000 });
const combinedHeading = await page.locator("h1").first().innerText();
record("/admin/tables", "combined tables + reservations header", combinedHeading.trim() === "میزها و رزرو میزها", combinedHeading.trim());
const combinedText = await page.locator('[data-legacy-surface="dashboard"]').innerText();
const combinedKept = ["افزودن میز", "رزرو جدید", "اشغال دستی میز", "تداخل زمانی"].filter((t) => !combinedText.includes(t));
record("/admin/tables", "both tools render on the one page", combinedKept.length === 0, combinedKept.join(", "));
const tablesHref = await page.locator('nav[aria-label="بخش‌های مرتبط"] a[href="/admin/tables"]').count();
record("/admin/tables", "combined section is not linked to itself", tablesHref === 0, `self links=${tablesHref}`);

await page.goto(`${BASE}/admin/reservations`, { waitUntil: "domcontentloaded" });
await page.waitForURL("**/admin/tables", { timeout: 30000 });
record("/admin/reservations", "old reservations URL redirects into the combined page", new URL(page.url()).pathname === "/admin/tables", page.url());

const searchHrefs = await page.evaluate(() => {
  const input = document.querySelector("#dashboard-search");
  return input ? input.closest("header")?.querySelectorAll("a[href^='/admin/']").length ?? 0 : 0;
});
record("nav", "no duplicate رزرو میزها destination in the header nav", (await page.locator('a[href="/admin/reservations"]').count()) === 0, `header links=${searchHrefs}`);

/* --------------------------------------- AI chat card + legibility tokens */
await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="ai-chat-card"]');
const cardText = await page.locator('[data-testid="ai-chat-card"]').innerText();
const hasInput = await page.locator('[data-testid="ai-chat-card"] input').count();
const lockedCopy = cardText.includes("دستیار غیرفعال است") || cardText.includes("مدیرعامل");
const enableLink = await page.locator('[data-testid="ai-chat-card"] a[href="/admin/ai"]').count();
record("ai-chat", "card is on the home screen", true, hasInput ? "chat input shown" : "locked state");
record(
  "ai-chat",
  "locked when the assistant is off, with a link to enable",
  hasInput === 0 ? lockedCopy && enableLink > 0 : true,
  `input=${hasInput} links=${enableLink}`,
);
record("ai-chat", "card links to the full assistant page", enableLink > 0, `${enableLink} links`);

// Muted text token and the type-size floor
const muted = await page.locator('[data-testid="stat-status"]').first().evaluate((el) => getComputedStyle(el).color);
record("legibility", "muted dashboard text is #9aa8c4 (≈7.3:1 on cards)", muted === "rgb(154, 168, 196)", muted);
const statLabel = await page.locator('[data-testid="stat-label"]').first().evaluate((el) => ({
  size: getComputedStyle(el).fontSize,
  color: getComputedStyle(el).color,
  weight: getComputedStyle(el).fontWeight,
}));
record(
  "legibility",
  "stat labels are foreground, medium weight, ≥12px",
  parseFloat(statLabel.size) >= 12 && statLabel.color === "rgb(242, 245, 251)" && Number(statLabel.weight) >= 500,
  `${statLabel.size} ${statLabel.color} w${statLabel.weight}`,
);
const tiny = await page.evaluate(() => {
  const root = document.querySelector("main");
  return [...root.querySelectorAll("*")]
    .filter((el) => el.children.length === 0 && el.textContent?.trim())
    .map((el) => parseFloat(getComputedStyle(el).fontSize))
    .filter((size) => size > 0 && size < 11);
});
record("legibility", "no text below 11px anywhere on the home screen", tiny.length === 0, `${tiny.length} nodes under 11px`);

/* ------------------------------------------- notification bell (dashboard) */
await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="notifications-toggle"]');
const badge = await page.locator('[data-testid="notifications-count"]').innerText();
const panelBefore = await page.locator('[data-testid="notifications-panel"]').count();
record("notifications", "bell shows a count badge and no panel until clicked", badge.trim().length > 0 && panelBefore === 0, `badge=${badge.trim()} panel=${panelBefore}`);

await page.click('[data-testid="notifications-toggle"]');
await page.waitForSelector('[data-testid="notifications-panel"]');
const items = await page.locator('[data-testid="notifications-panel"] li a').evaluateAll((els) => els.map((el) => ({ text: el.textContent?.trim() ?? "", href: el.getAttribute("href") })));
record("notifications", "panel lists the dashboard's open items", items.length > 0 && items.length === Number(badge.trim()), `${items.length} items`);
const expectedPending = ["پرداخت‌ها", "هزینه‌ها", "تأمین‌کنندگان", "موجودی", "خریدها", "پیگیری‌ها", "فرصت‌های فروش"].filter((label) => items.some((item) => item.text.includes(label)));
const settled = items.filter((item) => item.text.includes("ثبت شده") || item.text.includes("فعال"));
record("notifications", "only unsettled stats are listed", expectedPending.length === 7 && settled.length === 0, `pending=${expectedPending.length} settled=${settled.length}`);
record("notifications", "each item links to its module", items.every((item) => /^\/admin\/(accounting|erp|crm)$/.test(item.href ?? "")), items.map((item) => item.href).join(", "));

await page.keyboard.press("Escape");
await page.waitForSelector('[data-testid="notifications-panel"]', { state: "detached" });
record("notifications", "Escape closes the panel", true);

await page.click('[data-testid="notifications-toggle"]');
await page.waitForSelector('[data-testid="notifications-panel"]');
await page.click('[data-testid="notifications-panel"] li a[href="/admin/erp"]');
await page.waitForURL("**/admin/erp", { timeout: 30000 });
record("notifications", "clicking an item navigates to its module", (await page.locator('[data-module-page="erp"]').count()) === 1, page.url());

const ALL_ADMIN_ROUTES = [
  "/admin", "/admin/accounting", "/admin/ai", "/admin/allergens", "/admin/cashier-access",
  "/admin/categories", "/admin/crm", "/admin/customers", "/admin/erp", "/admin/financial",
  "/admin/no-access", "/admin/operations", "/admin/orders", "/admin/products", "/admin/products/new",
  "/admin/qr", "/admin/ratings", "/admin/tables", "/admin/sales-flow", "/admin/sales-flow/settings",
  "/admin/staff", "/admin/users", "/admin/workspace",
];
const notMigrated = [];
for (const route of ALL_ADMIN_ROUTES) {
  await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
  const shell = await page.locator('[data-shell="dashboard"]').count();
  const sidebar = await page.locator('nav[aria-label="ناوبری مدیریت"]').count();
  if (shell === 0 || sidebar !== 0) notMigrated.push(`${route} (shell=${shell} sidebar=${sidebar})`);
}
record("program", "every admin screen uses the new design", notMigrated.length === 0, notMigrated.join(" | ") || `${ALL_ADMIN_ROUTES.length} routes checked`);

/* ---------------------------------- the assistant page on the design system */
await page.goto(`${BASE}/admin/ai`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-shell="dashboard"]', { timeout: 60000 });
await page.waitForSelector('[data-legacy-surface="dashboard"]', { timeout: 60000 });
const aiSidebar = await page.locator('nav[aria-label="ناوبری مدیریت"]').count();
const aiAside = await page.locator("aside.admin-desktop-sidebar").count();
record("/admin/ai", "sidebar is fully removed", aiSidebar === 0 && aiAside === 0, `nav=${aiSidebar} aside=${aiAside}`);
const aiShell = await page.locator('[data-shell="dashboard"]').evaluate((el) => getComputedStyle(el).backgroundColor);
record("/admin/ai", "page renders on the dark navy shell", aiShell === DASHBOARD_NAVY, aiShell);
const aiHeading = await page.locator("h1").first().innerText();
record("/admin/ai", "page shows its own header", aiHeading.trim() === "دستیار هوشمند و حسابدار", aiHeading.trim());
const aiBack = await page.locator('[data-testid="back-home"]').count();
record("/admin/ai", "back link to the dashboard is present", aiBack === 1, `links=${aiBack}`);
const aiCards = await page.locator('[data-legacy-surface="dashboard"] .card').evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
record("/admin/ai", "legacy cards are remapped to the dashboard surface", aiCards.length > 0 && aiCards.every((bg) => bg === PANEL_SURFACE), `${aiCards.length} cards`);
const aiMuted = await page.locator('[data-legacy-surface="dashboard"]').evaluate((el) => {
  const node = [...el.querySelectorAll("*")].find((n) => n.children.length === 0 && n.textContent?.trim());
  return node ? getComputedStyle(node).color : "";
});
const aiAccent = await page.locator('[data-testid="module-badge"]').evaluate((el) => getComputedStyle(el).color);
record("/admin/ai", "badge and muted text use dashboard tones", aiAccent === "rgb(34, 230, 176)" && aiMuted !== "rgb(125, 138, 164)", `badge=${aiAccent} muted=${aiMuted}`);
const aiLauncher = await page.locator('[data-testid="ai-launcher-toggle"]').count();
record("/admin/ai", "no floating launcher on the page that is the assistant", aiLauncher === 0, `toggles=${aiLauncher}`);

/* --------------------- the six remaining admin screens, now on the design system */
const SCREENED_PAGES = [
  { path: "/admin/qr", kind: "crm", label: "کدهای QR" },
  { path: "/admin/staff", kind: "erp", label: "پرسنل و مرخصی‌ها" },
  { path: "/admin/allergens", kind: "erp", label: "آلرژن‌ها" },
];
for (const item of SCREENED_PAGES) {
  await page.goto(`${BASE}${item.path}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(`[data-module-page="${item.kind}"]`, { timeout: 60000 });
  await page.waitForSelector('[data-legacy-surface="dashboard"]', { timeout: 60000 });
  const nav = await page.locator('nav[aria-label="ناوبری مدیریت"]').count();
  const shell = await shellBackground(page);
  const heading = await page.locator("h1").first().innerText();
  record(item.path, "sidebar removed, dark shell, own header", nav === 0 && shell === DASHBOARD_NAVY && heading.trim() === item.label, `nav=${nav} shell=${shell} h1=${heading.trim()}`);
  const hrefs = await page.locator('nav[aria-label="بخش‌های مرتبط"] a').evaluateAll((els) => els.map((el) => el.getAttribute("href")));
  record(item.path, "links to its module and siblings, never itself", hrefs.includes(`/admin/${item.kind}`) && !hrefs.includes(item.path), hrefs.join(", "));
}

for (const item of [
  { path: "/admin/cashier-access", label: "دسترسی‌های صندوق‌دار" },
  { path: "/admin/orders", label: "سفارش‌ها" },
]) {
  await page.goto(`${BASE}${item.path}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-shell="dashboard"]', { timeout: 60000 });
  const nav = await page.locator('nav[aria-label="ناوبری مدیریت"]').count();
  const shell = await shellBackground(page);
  const heading = await page.locator("h1").first().innerText();
  record(item.path, "standalone screen: sidebar removed, dark shell, own header", nav === 0 && shell === DASHBOARD_NAVY && heading.trim() === item.label, `nav=${nav} shell=${shell} h1=${heading.trim()}`);
}

// Nothing may link to a page that only existed as a sidebar destination.
await page.goto(`${BASE}/admin/erp`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('nav[aria-label="بخش‌های مرتبط"]', { timeout: 60000 });
const deadLinks = await page.evaluate(() =>
  [...document.querySelectorAll('a[href^="/admin/"]')]
    .map((a) => a.getAttribute("href"))
    .filter((href) => ["/admin/leaves", "/admin/reservations", "/admin/ingredients"].includes(href ?? "")),
);
record("nav", "no link points at a page that now redirects", deadLinks.length === 0, deadLinks.join(", ") || "none");

/* ------------------------------- پرسنل + مرخصی‌ها combined page */
await page.goto(`${BASE}/admin/staff`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-module-page="erp"]', { timeout: 60000 });
const staffHeading = await page.locator("h1").first().innerText();
record("/admin/staff", "combined staff + leaves header", staffHeading.trim() === "پرسنل و مرخصی‌ها", staffHeading.trim());
const staffText = await page.locator('[data-legacy-surface="dashboard"]').innerText();
const staffKept = ["افزودن پرسنل", "مرخصی"].filter((t) => !staffText.includes(t));
record("/admin/staff", "both tools render on the one page", staffKept.length === 0, staffKept.join(", "));
const staffSelf = await page.locator('nav[aria-label="بخش‌های مرتبط"] a[href="/admin/staff"]').count();
record("/admin/staff", "combined section is not linked to itself", staffSelf === 0, `self links=${staffSelf}`);
await page.goto(`${BASE}/admin/leaves`, { waitUntil: "domcontentloaded" });
await page.waitForURL("**/admin/staff", { timeout: 30000 });
record("/admin/leaves", "old leaves URL redirects into the combined page", new URL(page.url()).pathname === "/admin/staff", page.url());

/* ------------------------- no admin screen is left on the legacy panel */
const LEGACY_SCREENS = [
  { path: "/admin/operations", label: "نیازهای عملیات", themed: false },
  { path: "/admin/users", label: "کاربران", themed: false },
  { path: "/admin/no-access", label: "دسترسی محدود است", themed: false },
  { path: "/admin/sales-flow/settings", label: "تنظیمات جریان فروش", themed: "accounting" },
  { path: "/admin/products/new", label: "محصول جدید", themed: "erp" },
];
for (const item of LEGACY_SCREENS) {
  await page.goto(`${BASE}${item.path}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-shell="dashboard"]', { timeout: 60000 });
  const nav = await page.locator('nav[aria-label="ناوبری مدیریت"]').count();
  const shell = await shellBackground(page);
  const heading = await page.locator("h1").first().innerText();
  const theme = await page.locator(`[data-module-page="${item.themed}"]`).count();
  record(
    item.path,
    "redesigned: dark shell, sidebar gone, own header",
    nav === 0 && shell === DASHBOARD_NAVY && heading.trim() === item.label && (item.themed ? theme === 1 : true),
    `nav=${nav} shell=${shell} h1=${heading.trim()} theme=${theme}`,
  );
}

// the product editor is a dynamic route: the shell must match by prefix
await page.goto(`${BASE}/admin/products`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-shell="dashboard"]', { timeout: 60000 });
const productId = await page.evaluate(() => {
  const hrefs = [...document.querySelectorAll('a[href^="/admin/products/"]')].map((a) => a.getAttribute("href") ?? "");
  const hit = hrefs.find((href) => /^\/admin\/products\/[a-z0-9]{6,}$/i.test(href));
  return hit ? hit.split("/").pop() : null;
});
if (productId) {
  await page.goto(`${BASE}/admin/products/${productId}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-shell="dashboard"]', { timeout: 60000 });
  const editNav = await page.locator('nav[aria-label="ناوبری مدیریت"]').count();
  const editHeading = await page.locator("h1").first().innerText();
  const editShell = await shellBackground(page);
  record(`/admin/products/${productId}`, "product editor redesigned (dynamic route)", editNav === 0 && editShell === DASHBOARD_NAVY && editHeading.trim() === "ویرایش محصول", `nav=${editNav} h1=${editHeading.trim()}`);
} else {
  record("/admin/products/[id]", "product editor redesigned (dynamic route)", false, "no product id found in the list page");
}

// login screen shares the dashboard language (fresh context: the middleware
// bounces signed-in staff to /admin, so the form is only reachable logged out)
const anonContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const anon = await anonContext.newPage();
await anon.goto(`${BASE}/admin/login`, { waitUntil: "domcontentloaded" });
await anon.waitForSelector('[data-shell="dashboard"]', { timeout: 60000 });
const loginShell = await anon.locator('[data-shell="dashboard"]').evaluate((el) => getComputedStyle(el).backgroundColor);
const loginCard = await anon.locator('[data-legacy-surface="dashboard"]').count();
const loginSubmit = await anon.locator('form button[type="submit"]').count();
record("/admin/login", "login screen uses the dashboard language", loginShell === DASHBOARD_NAVY && loginCard === 1 && loginSubmit === 1, `shell=${loginShell} scoped=${loginCard}`);
await anonContext.close();

/* --------------------------------- floating assistant: present on every admin page */
const ADMIN_PAGES = [
  "/admin/erp",
  "/admin/crm",
  "/admin/accounting",
  "/admin/financial",
  "/admin/sales-flow",
  "/admin/inventory",
  "/admin/tables",
  "/admin/orders",
  "/admin/operations",
  "/admin/qr",
  "/admin/staff",
  "/admin/allergens",
  "/admin/cashier-access",
];
for (const path of ADMIN_PAGES) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="ai-launcher-toggle"]', { timeout: 60000 });
  const locked = await page.locator('[data-testid="ai-launcher-toggle"]').count();
  record(path, "floating assistant is available here", locked === 1, `toggles=${locked}`);
}
await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="ai-chat-card"]');
const homeLaunchers = await page.locator('[data-testid="ai-launcher-toggle"]').count();
record("/admin", "no floating launcher on the home screen (the card is there)", homeLaunchers === 0, `toggles=${homeLaunchers}`);

await page.goto(`${BASE}/admin/orders`, { waitUntil: "domcontentloaded" });
await page.click('[data-testid="ai-launcher-toggle"]');
await page.waitForSelector('[data-testid="ai-launcher-panel"]');
const panelState = await page.locator('[data-testid="ai-launcher-panel"]').evaluate((el) => ({
  dialog: el.getAttribute("role"),
  label: el.getAttribute("aria-label"),
  hasInput: Boolean(el.querySelector('input[aria-label="پرسش از دستیار"]')),
  lockedText: el.textContent?.includes("کلید API هوش مصنوعی تنظیم نشده است") || el.textContent?.includes("دستیار غیرفعال است"),
  expanded: document.querySelector('[data-testid="ai-launcher-toggle"]')?.getAttribute("aria-expanded"),
}));
record("ai-launcher", "opens a dialog with the assistant", panelState.dialog === "dialog" && panelState.label === "دستیار هوشمند", JSON.stringify(panelState));
record("ai-launcher", "locked with an enable link while the assistant is off", panelState.hasInput === false && panelState.lockedText === true, `input=${panelState.hasInput} locked=${panelState.lockedText}`);
record("ai-launcher", "toggle reports its expanded state", panelState.expanded === "true", String(panelState.expanded));
await page.keyboard.press("Escape");
await page.waitForSelector('[data-testid="ai-launcher-panel"]', { state: "detached" });
record("ai-launcher", "Escape closes the panel", true);

/* A cashier must not get the floating assistant. */
const cashierContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const cashier = await cashierContext.newPage();
await cashier.goto(`${BASE}/admin/login`, { waitUntil: "domcontentloaded" });
await cashier.fill("#email", "cashier@cafe13.ir");
await cashier.fill("#password", "cashier1234");
await Promise.all([cashier.waitForURL(/\/admin(\?|$)/, { timeout: 45000 }), cashier.click('button[type="submit"]')]);
await cashier.goto(`${BASE}/admin/orders`, { waitUntil: "domcontentloaded" });
await cashier.waitForSelector('[data-shell="dashboard"]', { timeout: 60000 });
const cashierLaunchers = await cashier.locator('[data-testid="ai-launcher-toggle"]').count();
record("ai-launcher", "cashier gets no floating assistant", cashierLaunchers === 0, `/admin/orders: toggles=${cashierLaunchers}`);
await cashierContext.close();

/* The remap must not leak: a .card outside any data-legacy-surface scope keeps
   the project's own legacy surface, proving the scoping still works. */
await page.goto(`${BASE}/admin/products/new`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-legacy-surface="dashboard"] .card', { timeout: 60000 });
const scopedCard = await page.locator('[data-legacy-surface="dashboard"] .card').first().evaluate((el) => getComputedStyle(el).backgroundColor);
record("financial", "scoped legacy cards are remapped", scopedCard === PANEL_SURFACE, scopedCard);

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILURES:");
  for (const f of failed) console.log(` - [${f.scope}] ${f.check} ${f.detail}`);
}
process.exit(failed.length ? 1 : 0);
