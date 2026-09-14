/* Live E2E check: table scan → occupy → order → cross-table protection. Run from project root. */
const BASE = "http://localhost:3080";

async function api(path, opts = {}, jar = null) {
  const headers = { "Content-Type": "application/json", ...(opts.headers ?? {}) };
  if (jar && jar.cookie) headers.Cookie = jar.cookie;
  const res = await fetch(BASE + path, { ...opts, headers });
  const setCookie = res.headers.get("set-cookie");
  if (jar && setCookie) {
    const entry = setCookie.split(";")[0];
    jar.cookie = jar.cookie ? `${jar.cookie}; ${entry}` : entry;
  }
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json, res };
}

(async () => {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const tables = await prisma.cafeTable.findMany({
    orderBy: { number: "asc" },
    take: 2,
    include: { qrCodes: true },
  });
  const [t1, t2] = tables;
  const q1 = t1.qrCodes[0].code;
  const q2 = t2.qrCodes[0].code;
  const product = await prisma.product.findUnique({ where: { slug: "cappuccino" } });

  // Free both tables first.
  await prisma.cafeTable.update({ where: { id: t1.id }, data: { isOccupied: false, occupiedAt: null } });
  await prisma.cafeTable.update({ where: { id: t2.id }, data: { isOccupied: false, occupiedAt: null } });

  // 1. Guest scans table 1 QR.
  const guest = {};
  const visit = await api("/api/table-session", { method: "POST", body: JSON.stringify({ qrCode: q1 }) }, guest);
  console.log("1. scan table1:", visit.status, "| cookie issued:", Boolean(guest.cookie));

  const t1after = await prisma.cafeTable.findUnique({ where: { id: t1.id } });
  console.log("   auto-occupied:", t1after.isOccupied, "@", t1after.occupiedAt?.toISOString() ?? "-");

  // 2. Order table 1 with session → OK.
  const okOrder = await api("/api/orders", {
    method: "POST",
    body: JSON.stringify({ items: [{ productId: product.id, quantity: 1 }], qrCodeId: q1 }),
  }, guest);
  console.log("2. order table1 with session:", okOrder.status, "| type:", okOrder.json?.order?.orderType);

  // 3. Same session orders table 2 → 403.
  const cross = await api("/api/orders", {
    method: "POST",
    body: JSON.stringify({ items: [{ productId: product.id, quantity: 1 }], qrCodeId: q2 }),
  }, guest);
  console.log("3. order table2 with table1 session:", cross.status, cross.json?.error ?? "");

  // 4. Anonymous orders table 1 without cookie → 403.
  const anon = await api("/api/orders", {
    method: "POST",
    body: JSON.stringify({ items: [{ productId: product.id, quantity: 1 }], qrCodeId: q1 }),
  });
  console.log("4. order table1 without cookie:", anon.status, anon.json?.error ?? "");

  // 5. Takeaway without cookie → OK.
  const take = await api("/api/orders", {
    method: "POST",
    body: JSON.stringify({ items: [{ productId: product.id, quantity: 1 }] }),
  });
  console.log("5. takeaway without cookie:", take.status, "| type:", take.json?.order?.orderType);

  // 6. Complete the table order → table freed automatically.
  // (Login as cashier inside the script.)
  const csrf = await api("/api/auth/csrf");
  const loginRes = await fetch(BASE + "/api/auth/callback/credentials", {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: csrf.res.headers.get("set-cookie") ?? "",
    },
    body: `csrfToken=${csrf.json.csrfToken}&email=cashier@farmans.cafe&password=cashier1234&json=true`,
  });
  const setCookies = (loginRes.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .filter((c) => c.includes("session-token") || c.includes("csrf"));
  const jar2 = { cookie: setCookies.join("; ") };
  const whoami = await api("/api/auth/session", {}, jar2);
  console.log("   cashier logged in:", whoami.json?.user?.role ?? "FAILED");
  for (const st of ["CONFIRMED", "PREPARING", "COMPLETED"]) {
    const r = await api(`/api/admin/orders/${okOrder.json.order.id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status: st }),
    }, jar2);
    if (r.status !== 200) console.log(`   transition ${st}:`, r.status, r.json?.error ?? "");
  }
  const t1final = await prisma.cafeTable.findUnique({ where: { id: t1.id } });
  console.log("6. table1 after order completed — occupied:", t1final.isOccupied);

  // 7. Reservations: create + conflict detection.
  const create = await api("/api/admin/reservations", {
    method: "POST",
    body: JSON.stringify({
      tableId: t2.id,
      customerName: "آقای رضایی",
      guests: 4,
      reservedAt: new Date(Date.now() + 3600_000).toISOString(),
      durationMin: 60,
    }),
  }, jar2);
  console.log("7. create reservation:", create.status);

  const conflict = await api("/api/admin/reservations", {
    method: "POST",
    body: JSON.stringify({
      tableId: t2.id,
      customerName: "تلاش تداخل",
      guests: 2,
      reservedAt: new Date(Date.now() + 3900_000).toISOString(),
      durationMin: 60,
    }),
  }, jar2);
  console.log("   overlapping reservation:", conflict.status, conflict.json?.error ?? "");

  await prisma.$disconnect();
})();
