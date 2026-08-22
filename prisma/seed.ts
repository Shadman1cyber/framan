// FARMAN seed — realistic demo dataset for "Zarin Industrial Group",
// a Tehran-based manufacturer/exporter of industrial packaging.
// All monetary amounts are in Iranian Rial (IRR). 1 Toman = 10 Rial.
// Demo rate used for realism: 1 USD ≈ 1,000,000 IRR.
// Deterministic values (no randomness) so demos are reproducible.

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const M = 1_000_000; // one million IRR
const D = 86400000;
const now = Date.now();
const daysAgo = (n: number) => new Date(now - n * D);
const daysAhead = (n: number) => new Date(now + n * D);

async function main() {
  await db.$transaction([
    db.priceHistory.deleteMany(),
    db.supplierOffer.deleteMany(),
    db.workflowStage.deleteMany(),
    db.purchaseOrderItem.deleteMany(),
    db.purchaseOrder.deleteMany(),
    db.approval.deleteMany(),
    db.purchaseRequest.deleteMany(),
    db.agentTask.deleteMany(),
    db.activityLog.deleteMany(),
    db.transaction.deleteMany(),
    db.expense.deleteMany(),
    db.customer.deleteMany(),
    db.businessTask.deleteMany(),
    db.business.deleteMany(),
    db.supplierProduct.deleteMany(),
    db.product.deleteMany(),
    db.supplier.deleteMany(),
    db.user.deleteMany(),
    db.company.deleteMany(),
    db.agent.deleteMany(),
  ]);

  // ── Company & users ────────────────────────────────────────────────────────
  const company = await db.company.create({
    data: {
      name: "Zarin Industrial Group",
      industry: "Industrial packaging manufacturing & export",
      country: "Iran",
      currency: "IRR",
    },
  });

  await db.user.createMany({
    data: [
      { companyId: company.id, email: "sara@farman.dev", name: "Sara Mahdavi", role: "owner", password: "farman123" },
      { companyId: company.id, email: "reza@farman.dev", name: "Reza Hosseini", role: "operations", password: "farman123" },
      { companyId: company.id, email: "nazanin@farman.dev", name: "Nazanin Kaviani", role: "finance", password: "farman123" },
    ],
  });

  // ── Agents ─────────────────────────────────────────────────────────────────
  await db.agent.createMany({
    data: [
      { key: "orchestrator", name: "AI Orchestrator", role: "Coordinator", description: "Routes intents to specialized agents and enforces the approval policy.", status: "idle", healthScore: 99, tasksRun: 41 },
      { key: "procurement", name: "Procurement Agent", role: "Sourcing & execution", description: "Parses requirements, sources suppliers, compares offers, prepares purchase orders.", status: "idle", healthScore: 97, tasksRun: 28 },
      { key: "finance_cfo", name: "AI CFO", role: "Financial intelligence", description: "Cash flow analysis, affordability checks, budget and expense surveillance.", status: "working", currentTask: "Analyzing upcoming cash requirements…", healthScore: 98, lastActiveAt: new Date(), tasksRun: 63 },
      { key: "business", name: "Business Agent", role: "Business setup", description: "Turns business ideas into structured, executable workspaces.", status: "idle", healthScore: 96, tasksRun: 7 },
    ],
  });

  // ── Suppliers ──────────────────────────────────────────────────────────────
  type S = { name: string; category: string; location: string; rel: number; onTime: number; avgD: number; risk: number; riskL: string; orders: number; contact: [string, string]; note?: string };
  const suppliersData: S[] = [
    { name: "Isfahan Packaging Industries", category: "Packaging", location: "Isfahan, Iran", rel: 88, onTime: 91, avgD: 4, risk: 22, riskL: "low", orders: 14, contact: ["Hossein Karimi", "h.karimi@ipico.ir"] },
    { name: "Tabriz Corrugated Works", category: "Packaging", location: "Tabriz, Iran", rel: 74, onTime: 68, avgD: 9, risk: 47, riskL: "medium", orders: 6, contact: ["Aygun Mammadli", "sales@tabrizcw.com"], note: "Two late deliveries in Q1; capacity constraints reported." },
    { name: "Shiraz Flexibles Co.", category: "Packaging", location: "Shiraz, Iran", rel: 90, onTime: 89, avgD: 6, risk: 25, riskL: "low", orders: 11, contact: ["Maryam Sadeghi", "m.sadeghi@shirazflex.com"] },
    { name: "Kaveh Paper & Board", category: "Packaging", location: "Saveh, Iran", rel: 85, onTime: 87, avgD: 7, risk: 30, riskL: "low", orders: 9, contact: ["Ali Tehrani", "a.tehrani@kavehpaper.ir"] },
    { name: "Mehr Print & Labels", category: "Packaging", location: "Tehran, Iran", rel: 89, onTime: 92, avgD: 4, risk: 20, riskL: "low", orders: 2, contact: ["Sina Mehrabi", "sina@mehrprint.co"], note: "New supplier — first orders in progress." },
    { name: "Damavand Strapping Systems", category: "Packaging", location: "Semnan, Iran", rel: 77, onTime: 72, avgD: 8, risk: 52, riskL: "high", orders: 5, contact: ["Farhad Amiri", "f.amiri@damavandss.ir"], note: "Quality inconsistency on heavy-gauge strapping; escalated once." },
    { name: "Pars Polymers Co.", category: "Raw Materials", location: "Tehran, Iran", rel: 92, onTime: 94, avgD: 5, risk: 18, riskL: "low", orders: 17, contact: ["Neda Farhadi", "n.farhadi@parspolymers.ir"] },
    { name: "Alborz Chemical Trading", category: "Raw Materials", location: "Karaj, Iran", rel: 79, onTime: 76, avgD: 8, risk: 41, riskL: "medium", orders: 4, contact: ["Kaveh Nazari", "k.nazari@alborzchem.com"] },
    { name: "Caspian Metalworks", category: "Components", location: "Rasht, Iran", rel: 93, onTime: 95, avgD: 5, risk: 15, riskL: "low", orders: 12, contact: ["Sohrab Gilani", "s.gilani@caspianmetal.ir"] },
    { name: "Yazd Ceramics Ltd.", category: "Components", location: "Yazd, Iran", rel: 81, onTime: 78, avgD: 10, risk: 44, riskL: "medium", orders: 3, contact: ["Parisa Yazdani", "p.yazdani@yazdceramic.ir"] },
    { name: "Aria Logistics Partners", category: "Logistics", location: "Tehran, Iran", rel: 95, onTime: 97, avgD: 3, risk: 12, riskL: "low", orders: 22, contact: ["Dariush Nouri", "d.nouri@arialogistics.com"] },
    { name: "Hormozgan Freight Systems", category: "Logistics", location: "Bandar Abbas, Iran", rel: 86, onTime: 84, avgD: 6, risk: 33, riskL: "medium", orders: 8, contact: ["Laleh Bandari", "l.bandari@hormozganfreight.ir"] },
  ];
  const suppliers: Record<string, string> = {};
  for (const s of suppliersData) {
    const row = await db.supplier.create({
      data: {
        companyId: company.id,
        name: s.name,
        category: s.category,
        location: s.location,
        contactName: s.contact[0],
        contactEmail: s.contact[1],
        contactPhone: `+98 21 ${2000 + Math.floor(s.rel * 13)} ${400 + s.orders}`,
        reliabilityScore: s.rel,
        onTimeRate: s.onTime,
        avgDeliveryDays: s.avgD,
        riskScore: s.risk,
        riskLevel: s.riskL,
        totalOrders: s.orders,
        notes: s.note,
      },
    });
    suppliers[s.name] = row.id;
  }

  // ── Products ───────────────────────────────────────────────────────────────
  type P = { sku: string; name: string; category: string; unit: string; desc: string };
  const productsData: P[] = [
    { sku: "PKG-CB-4840", name: "Heavy-duty corrugated box 480×400mm", category: "Packaging", unit: "unit", desc: "Double-wall BC flute export carton, kraft finish" },
    { sku: "PKG-CB-6040", name: "Export carton 600×400×400mm", category: "Packaging", unit: "unit", desc: "Triple-wall reinforced export box" },
    { sku: "PKG-SF-500", name: "Stretch film 500mm 23µ", category: "Packaging", unit: "roll", desc: "Cast LLDPE pallet wrap, 2.5kg net" },
    { sku: "PKG-KR-100", name: "Kraft paper roll 100gsm", category: "Packaging", unit: "roll", desc: "Virgin kraft wrapping paper, 1.2m width" },
    { sku: "PKG-WS-50", name: "PP woven sack 50kg", category: "Packaging", unit: "unit", desc: "Laminated polypropylene woven sack" },
    { sku: "PKG-EP-80", name: "Edge protector 80×80×3mm", category: "Packaging", unit: "unit", desc: "Carton board corner protection, 2.4m" },
    { sku: "PKG-FI-D40", name: "Foam insert sheet D40", category: "Packaging", unit: "sheet", desc: "Polyethylene foam cushioning 1000×2000mm" },
    { sku: "PKG-ST-19", name: "PET strapping band 19mm", category: "Packaging", unit: "coil", desc: "Green polyester strapping, 1500m" },
    { sku: "PKG-TA-48", name: "Adhesive packing tape 48mm", category: "Packaging", unit: "roll", desc: "Hot-melt OPP tape, 100m" },
    { sku: "PKG-LB-A4", name: "Shipping label A4/24-up", category: "Packaging", unit: "pack", desc: "Thermal-transfer shipping labels, 100 sheets" },
    { sku: "PKG-SW-400", name: "Shrink wrap 400mm", category: "Packaging", unit: "roll", desc: "Center-folded PE shrink film" },
    { sku: "PKG-PW-1200", name: "Wooden pallet 1200×800mm", category: "Packaging", unit: "unit", desc: "ISPM-15 heat-treated EUR-style pallet" },
    { sku: "RM-HDPE-B55", name: "HDPE injection granules B55", category: "Raw Materials", unit: "kg", desc: "Blow-molding grade high-density polyethylene" },
    { sku: "RM-PP-T30", name: "PP homopolymer T30", category: "Raw Materials", unit: "kg", desc: "Injection-grade polypropylene" },
    { sku: "RM-LDPE-2420", name: "LDPE film grade 2420", category: "Raw Materials", unit: "kg", desc: "Low-density polyethylene for film extrusion" },
    { sku: "RM-MB-WHT", name: "White masterbatch TiO₂ 50%", category: "Raw Materials", unit: "kg", desc: "Titanium-dioxide color concentrate" },
    { sku: "RM-INK-FX", name: "Flexographic ink CMYK set", category: "Raw Materials", unit: "set", desc: "Water-based flexo printing ink set" },
    { sku: "CMP-ST-BLT", name: "Steel buckles 19mm", category: "Components", unit: "box", desc: "Phosphated wire buckles, 1000/box" },
    { sku: "CMP-VLV-2IN", name: "Industrial valve 2-inch", category: "Components", unit: "unit", desc: "Brass gate valve PN16" },
    { sku: "CMP-CST-60", name: "Machine caster 60mm", category: "Components", unit: "unit", desc: "Swivel caster with brake, 80kg load" },
    { sku: "LOG-AIR-EU", name: "Air freight to EU (per kg)", category: "Logistics", unit: "kg", desc: "IKA airport to EU hub, consolidated" },
    { sku: "LOG-SEA-GCC", name: "Sea freight to GCC (per m³)", category: "Logistics", unit: "m³", desc: "Bandar Abbas → Jebel Ali LCL" },
    { sku: "LOG-TR-TRK", name: "Domestic trucking per ton", category: "Logistics", unit: "ton", desc: "Full-truck-load domestic linehaul" },
    { sku: "LOG-CUS-EXP", name: "Customs clearance export", category: "Logistics", unit: "declaration", desc: "Export declaration & documentation" },
    { sku: "SRV-QC-AUD", name: "Supplier QC audit visit", category: "Components", unit: "visit", desc: "Third-party quality inspection at supplier site" },
    { sku: "PKG-CB-3333", name: "Printed carton 330×330×330mm", category: "Packaging", unit: "unit", desc: "Single-wall printed retail carton" },
  ];
  const products: Record<string, string> = {};
  for (const p of productsData) {
    const row = await db.product.create({
      data: {
        companyId: company.id,
        sku: p.sku,
        name: p.name,
        category: p.category,
        unit: p.unit,
        description: p.desc,
      },
    });
    products[p.sku] = row.id;
  }

  // ── Supplier catalog (offers) + price history ──────────────────────────────
  // [supplier, sku, priceIRR, leadDays, minQty]
  type SP = [string, string, number, number, number];
  const catalog: SP[] = [
    ["Isfahan Packaging Industries", "PKG-CB-4840", 4.2 * M, 4, 250],
    ["Shiraz Flexibles Co.", "PKG-CB-4840", 3.95 * M, 9, 500],
    ["Kaveh Paper & Board", "PKG-CB-4840", 4.45 * M, 6, 200],
    ["Tabriz Corrugated Works", "PKG-CB-4840", 3.8 * M, 10, 300],
    ["Mehr Print & Labels", "PKG-CB-4840", 4.35 * M, 5, 200],
    ["Isfahan Packaging Industries", "PKG-CB-6040", 6.1 * M, 5, 200],
    ["Kaveh Paper & Board", "PKG-CB-6040", 6.4 * M, 7, 150],
    ["Tabriz Corrugated Works", "PKG-CB-6040", 5.75 * M, 11, 250],
    ["Isfahan Packaging Industries", "PKG-CB-3333", 2.35 * M, 4, 500],
    ["Mehr Print & Labels", "PKG-CB-3333", 2.5 * M, 4, 400],
    ["Damavand Strapping Systems", "PKG-CB-3333", 2.6 * M, 8, 500],
    ["Isfahan Packaging Industries", "PKG-SF-500", 5.4 * M, 3, 100],
    ["Shiraz Flexibles Co.", "PKG-SF-500", 5.1 * M, 6, 150],
    ["Alborz Chemical Trading", "PKG-SF-500", 4.85 * M, 9, 200],
    ["Kaveh Paper & Board", "PKG-KR-100", 31 * M, 6, 40],
    ["Shiraz Flexibles Co.", "PKG-KR-100", 29.5 * M, 7, 40],
    ["Isfahan Packaging Industries", "PKG-WS-50", 0.62 * M, 5, 2000],
    ["Shiraz Flexibles Co.", "PKG-WS-50", 0.58 * M, 8, 3000],
    ["Kaveh Paper & Board", "PKG-EP-80", 0.71 * M, 6, 500],
    ["Isfahan Packaging Industries", "PKG-EP-80", 0.68 * M, 4, 500],
    ["Shiraz Flexibles Co.", "PKG-FI-D40", 8.9 * M, 7, 100],
    ["Damavand Strapping Systems", "PKG-ST-19", 21.5 * M, 8, 30],
    ["Mehr Print & Labels", "PKG-ST-19", 20.2 * M, 5, 25],
    ["Isfahan Packaging Industries", "PKG-TA-48", 1.15 * M, 3, 200],
    ["Mehr Print & Labels", "PKG-TA-48", 1.05 * M, 4, 240],
    ["Mehr Print & Labels", "PKG-LB-A4", 12.8 * M, 4, 50],
    ["Shiraz Flexibles Co.", "PKG-SW-400", 6.7 * M, 6, 80],
    ["Alborz Chemical Trading", "PKG-SW-400", 6.2 * M, 9, 120],
    ["Caspian Metalworks", "PKG-PW-1200", 18.5 * M, 5, 50],
    ["Tabriz Corrugated Works", "PKG-PW-1200", 17.2 * M, 9, 50],
    ["Pars Polymers Co.", "RM-HDPE-B55", 1.34 * M, 5, 1000],
    ["Alborz Chemical Trading", "RM-HDPE-B55", 1.27 * M, 8, 2000],
    ["Pars Polymers Co.", "RM-PP-T30", 1.28 * M, 5, 1000],
    ["Alborz Chemical Trading", "RM-PP-T30", 1.22 * M, 9, 1500],
    ["Pars Polymers Co.", "RM-LDPE-2420", 1.41 * M, 6, 1000],
    ["Alborz Chemical Trading", "RM-MB-WHT", 2.9 * M, 8, 200],
    ["Pars Polymers Co.", "RM-MB-WHT", 3.05 * M, 6, 150],
    ["Shiraz Flexibles Co.", "RM-INK-FX", 84 * M, 7, 5],
    ["Caspian Metalworks", "CMP-ST-BLT", 38 * M, 5, 20],
    ["Damavand Strapping Systems", "CMP-ST-BLT", 36.5 * M, 9, 30],
    ["Caspian Metalworks", "CMP-VLV-2IN", 16.8 * M, 5, 25],
    ["Yazd Ceramics Ltd.", "CMP-VLV-2IN", 15.9 * M, 10, 40],
    ["Caspian Metalworks", "CMP-CST-60", 6.4 * M, 5, 50],
    ["Yazd Ceramics Ltd.", "CMP-CST-60", 5.95 * M, 11, 80],
    ["Aria Logistics Partners", "LOG-AIR-EU", 3.9 * M, 3, 100],
    ["Hormozgan Freight Systems", "LOG-AIR-EU", 4.15 * M, 4, 100],
    ["Hormozgan Freight Systems", "LOG-SEA-GCC", 46 * M, 6, 5],
    ["Aria Logistics Partners", "LOG-TR-TRK", 32 * M, 2, 1],
    ["Hormozgan Freight Systems", "LOG-TR-TRK", 29 * M, 4, 1],
    ["Aria Logistics Partners", "LOG-CUS-EXP", 85 * M, 2, 1],
    ["Hormozgan Freight Systems", "LOG-CUS-EXP", 78 * M, 3, 1],
    ["Mehr Print & Labels", "SRV-QC-AUD", 340 * M, 5, 1],
  ];

  for (const [sup, sku, price, lead, minQty] of catalog) {
    const sp = await db.supplierProduct.create({
      data: {
        supplierId: suppliers[sup],
        productId: products[sku],
        price,
        leadTimeDays: lead,
        minOrderQty: minQty,
      },
    });
    // 4 quarterly price points ending at current price (rounded to 1,000 IRR)
    const drift = ((price / 1.06 - price / 1.02) > 0 ? 1 : -1) * 1000;
    let p = price / (1 + 0.055);
    const pts: number[] = [];
    for (let i = 0; i < 4; i++) {
      pts.push(Math.round(p / 1000) * 1000);
      p += (price - p) * 0.42 + drift;
    }
    pts[pts.length - 1] = price;
    for (let i = 0; i < pts.length; i++) {
      await db.priceHistory.create({
        data: { supplierProductId: sp.id, price: pts[i], recordedAt: daysAgo(180 - i * 45) },
      });
    }
  }

  // ── Customers ──────────────────────────────────────────────────────────────
  const customers = [
    ["Middle East Distribution FZE", "Trading & distribution", "UAE", 412],
    ["Anatolia Trading Co.", "Consumer goods import", "Türkiye", 268],
    ["Gulf Pack LLC", "Packaging conversion", "Oman", 196],
    ["EuroLine Import GmbH", "Retail supply", "Germany", 154],
    ["Caspian Retail Group", "Retail chain", "Azerbaijan", 121],
    ["Almaty Industrial Supply", "Industrial supplies", "Kazakhstan", 87],
  ] as const;
  for (const [name, industry, country, revenueM] of customers) {
    await db.customer.create({
      data: { companyId: company.id, name, industry, country, revenueYtd: revenueM * M },
    });
  }

  // ── Transactions (6 months) ────────────────────────────────────────────────
  const incomeByCustomer = [64, 58.5, 71, 66.5, 74, 69]; // billions of IRR
  for (let i = 0; i < 6; i++) {
    const d = new Date(new Date(now).getFullYear(), new Date(now).getMonth() - (5 - i), 8);
    await db.transaction.create({
      data: { companyId: company.id, type: "income", category: "Sales — Export", description: `${customers[i % customers.length][0]} — monthly shipments`, amount: incomeByCustomer[i] * 1000 * M, date: d, status: "cleared" },
    });
    await db.transaction.create({
      data: { companyId: company.id, type: "income", category: "Sales — Domestic", description: "Domestic converter sales — invoice batch", amount: (18 + i * 0.9) * 1000 * M, date: new Date(d.getTime() + 12 * D), status: "cleared" },
    });
  }
  const opexLines: [string, string, number][] = [
    ["Payroll", "Monthly payroll run", 61.5 * 1000 * M],
    ["Rent & Facilities", "Production facility lease — Shams Abad industrial park", 9.2 * 1000 * M],
    ["Utilities", "Electricity, gas & water", 2.38 * 1000 * M],
    ["Software", "ERP licenses, cloud, tooling", 1.84 * 1000 * M],
    ["Marketing", "Trade shows & digital campaigns", 3.6 * 1000 * M],
  ];
  for (let i = 0; i < 6; i++) {
    const d = new Date(new Date(now).getFullYear(), new Date(now).getMonth() - (5 - i), 1);
    for (const [category, description, amount] of opexLines) {
      const jitter = category === "Utilities" ? (i % 3) * 180 * M : 0;
      await db.transaction.create({
        data: { companyId: company.id, type: "expense", category, description, amount: amount + jitter, date: d, status: "cleared" },
      });
    }
  }

  // Upcoming receivable (pending — due net-30)
  await db.transaction.create({
    data: { companyId: company.id, type: "income", category: "Sales — Export", description: "EuroLine Import GmbH — invoice due net-30", amount: 23.4 * 1000 * M, date: daysAgo(4), status: "pending" },
  });

  // ── Expenses ledger (current month, with budgets) ──────────────────────────
  const expenseRows: [string, string, string, number, number | null, boolean, string?][] = [
    ["Payroll", "Zarin Industrial Group — HR", "Operator & staff salaries (month)", 61.5 * 1000 * M, 65 * 1000 * M, false],
    ["Rent & Facilities", "Shams Abad Estate Mgmt", "Warehouse + production hall lease", 9.2 * 1000 * M, 9.5 * 1000 * M, false],
    ["Logistics", "Aria Logistics Partners", "Inbound raw material freight — 6 truckloads", 6.85 * 1000 * M, 8 * 1000 * M, false],
    ["Logistics", "Hormozgan Freight Systems", "Export consolidation to Bandar Abbas", 2.14 * 1000 * M, 8 * 1000 * M, false],
    ["Marketing", "Digikala Business Ads", "Q3 digital campaign flight 2", 3.6 * 1000 * M, 5 * 1000 * M, false],
    ["Utilities", "Tavanir Regional Grid", "Factory power — July cycle", 2.56 * 1000 * M, 3 * 1000 * M, false],
    ["Software", "Cloud Services (ERP/CRM)", "Monthly SaaS stack", 1.84 * 1000 * M, 2 * 1000 * M, false],
    ["Maintenance", "Foolad Technic Services", "Extruder line preventive maintenance", 2.9 * 1000 * M, 3.5 * 1000 * M, false],
    ["Consulting", "Advarna Consulting GmbH", "EU market-entry compliance advisory", 7.8 * 1000 * M, null, true, "No prior spend in this category — verify engagement scope"],
    ["Travel", "Various", "Dubai client visits — 2 trips", 2.43 * 1000 * M, 3 * 1000 * M, false],
  ];
  for (const [category, vendor, description, amount, budget, flagged, reason] of expenseRows) {
    await db.expense.create({
      data: { companyId: company.id, category, vendor, description, amount, monthlyBudget: budget, flagged, flagReason: reason, date: daysAgo(6) },
    });
  }

  // ── Historical purchase orders (delivered) ─────────────────────────────────
  const historyPOs: [string, string, string, number, number, number, number][] = [
    // supplier, sku, description, qty, unitPriceIRR, daysAgo, lead
    ["Pars Polymers Co.", "RM-HDPE-B55", "HDPE injection granules B55", 8000, 1.31 * M, 150, 5],
    ["Isfahan Packaging Industries", "PKG-CB-4840", "Heavy-duty corrugated box 480×400mm", 2000, 4.05 * M, 138, 4],
    ["Pars Polymers Co.", "RM-PP-T30", "PP homopolymer T30", 6000, 1.25 * M, 126, 5],
    ["Shiraz Flexibles Co.", "PKG-SF-500", "Stretch film 500mm 23µ", 600, 5.2 * M, 117, 6],
    ["Aria Logistics Partners", "LOG-AIR-EU", "Air freight to EU (per kg)", 1850, 4.05 * M, 108, 3],
    ["Isfahan Packaging Industries", "PKG-CB-6040", "Export carton 600×400×400mm", 1500, 6.0 * M, 96, 5],
    ["Tabriz Corrugated Works", "PKG-PW-1200", "Wooden pallet 1200×800mm", 300, 17.4 * M, 84, 9],
    ["Pars Polymers Co.", "RM-LDPE-2420", "LDPE film grade 2420", 5000, 1.38 * M, 75, 6],
    ["Kaveh Paper & Board", "PKG-EP-80", "Edge protector 80×80×3mm", 2000, 0.73 * M, 63, 6],
    ["Isfahan Packaging Industries", "PKG-CB-4840", "Heavy-duty corrugated box 480×400mm", 3500, 4.15 * M, 51, 4],
    ["Caspian Metalworks", "CMP-ST-BLT", "Steel buckles 19mm", 60, 37.2 * M, 44, 5],
    ["Shiraz Flexibles Co.", "PKG-WS-50", "PP woven sack 50kg", 5000, 0.59 * M, 33, 8],
    ["Pars Polymers Co.", "RM-MB-WHT", "White masterbatch TiO₂ 50%", 400, 3.02 * M, 24, 6],
    ["Isfahan Packaging Industries", "PKG-TA-48", "Adhesive packing tape 48mm", 800, 1.12 * M, 15, 3],
  ];
  let poSeq = 41;
  for (const [sup, sku, desc, qty, unitPrice, ago, lead] of historyPOs) {
    const subtotal = Math.round(qty * unitPrice);
    await db.purchaseOrder.create({
      data: {
        companyId: company.id,
        poNumber: `PO-${ago > 90 ? "Q1" : ago > 45 ? "Q2" : "Q3"}-${String(poSeq++).padStart(4, "0")}`,
        supplierId: suppliers[sup],
        status: "delivered",
        subtotal,
        tax: Math.round(subtotal * 0.09),
        total: Math.round(subtotal * 1.09),
        expectedDelivery: daysAgo(ago - lead),
        deliveredAt: daysAgo(Math.max(ago - lead - 1, 0)),
        sentAt: daysAgo(ago),
        createdAt: daysAgo(ago),
        items: { create: [{ productId: products[sku], description: `${qty.toLocaleString()} × ${desc}`, quantity: qty, unitPrice, total: subtotal }] },
      },
    });
  }

  // ── Demo request #1 — awaiting approval (so Approvals page has content) ────
  const userSara = await db.user.findUniqueOrThrow({ where: { email: "sara@farman.dev" } });
  const req1 = await db.purchaseRequest.create({
    data: {
      companyId: company.id,
      createdById: userSara.id,
      title: "Export cartons for Anatolia order",
      itemDescription: "heavy-duty corrugated boxes 480×400mm",
      category: "Packaging",
      quantity: 1200,
      unit: "units",
      neededBy: daysAhead(12),
      budget: 6 * 1000 * M,
      priority: "high",
      notes: "For the Anatolia Trading Q3 shipment. Must pass drop-test spec.",
      status: "awaiting_approval",
      parsedSummary:
        "Requirement understood: 1,200 × heavy-duty corrugated boxes 480×400mm (category: Packaging, needed in ~12 days). FARMAN will source qualified suppliers in Packaging, request indicative offers and evaluate price, delivery and reliability.",
      recommendation: {
        supplierId: suppliers["Isfahan Packaging Industries"],
        supplierName: "Isfahan Packaging Industries",
        unitPrice: 4.2 * M,
        totalPrice: 5040 * M,
        leadTimeDays: 4,
        fitsDeadline: true,
        withinBudget: true,
        score: 87,
        reliabilityScore: 88,
        riskLevel: "low",
      } as never,
      createdAt: new Date(now - 3600_000),
    },
  });
  const stages1: [string, string, number, string, string][] = [
    ["created", "Request Created", 0, "done", "Request submitted by Sara Mahdavi: 1,200 × heavy-duty corrugated boxes."],
    ["parsed", "Requirement Parsed", 1, "done", "Requirement understood: 1,200 × heavy-duty corrugated boxes (Packaging, ~12-day window). Export-grade quality expected."],
    ["suppliers_found", "Suppliers Found", 2, "done", "Found 5 qualified suppliers quoting “Heavy-duty corrugated box 480×400mm” from the Packaging network."],
    ["offers_compared", "Offers Compared", 3, "done", "Compared 5 offers for “Heavy-duty corrugated box 480×400mm”. Average order value IRR 5B; spread of IRR 780M between cheapest and most expensive."],
    ["risk_evaluated", "Risk Evaluated", 4, "done", "2 of 5 suppliers carry elevated risk (Tabriz Corrugated Works: medium). Risk-adjusted scoring applied."],
    ["recommendation_ready", "Recommendation Generated", 5, "done", "Isfahan Packaging Industries offers the best balance of price (87/100 evaluation score), delivery and reliability."],
  ];
  for (const [key, label, sortOrder, status, summary] of stages1) {
    const t = new Date(now - 3600_000 + sortOrder * 42000);
    await db.workflowStage.create({
      data: { requestId: req1.id, key, label, sortOrder, status, summary, startedAt: t, completedAt: t },
    });
  }
  const offerRows: [string, number, number, number, boolean, number, number][] = [
    // supplier, unitPriceIRR, totalPriceIRR, lead, fits, score, rank
    ["Isfahan Packaging Industries", 4.2 * M, 5040 * M, 4, true, 87, 1],
    ["Kaveh Paper & Board", 4.45 * M, 5340 * M, 6, true, 79, 2],
    ["Mehr Print & Labels", 4.35 * M, 5220 * M, 5, true, 81, 2],
    ["Shiraz Flexibles Co.", 3.95 * M, 4740 * M, 9, true, 76, 4],
    ["Tabriz Corrugated Works", 3.8 * M, 4560 * M, 10, true, 61, 5],
  ];
  for (const [sup, up, tp, lead, fits, score, rank] of offerRows) {
    await db.supplierOffer.create({
      data: {
        requestId: req1.id,
        supplierId: suppliers[sup],
        unitPrice: up,
        totalPrice: tp,
        leadTimeDays: lead,
        fitsDeadline: fits,
        withinBudget: true,
        score,
        rank,
        selected: rank === 1,
        reasonsJson: { reasons: [], flags: [] } as never,
      },
    });
  }
  await db.approval.create({
    data: {
      companyId: company.id,
      requestId: req1.id,
      type: "high_value",
      title: "Approve supplier selection — Isfahan Packaging Industries",
      description: "Order value IRR 5B exceeds the IRR 500M autonomous-execution limit",
      payloadJson: {
        supplierId: suppliers["Isfahan Packaging Industries"],
        supplierName: "Isfahan Packaging Industries",
        unitPrice: 4.2 * M,
        totalPrice: 5040 * M,
        leadTimeDays: 4,
        fitsDeadline: true,
        withinBudget: true,
        score: 87,
        reliabilityScore: 88,
        riskLevel: "low",
        headline: "Isfahan Packaging Industries offers the best balance of price (87/100), delivery and reliability.",
        why: ["Fastest dependable delivery (4 days) that fits your deadline", "88% supplier reliability score", "14 previous completed orders without disputes", "Chosen over Shiraz Flexibles Co. despite higher unit cost — delivery speed and track record reduce execution risk"],
        risks: [],
        approvalRequirements: [{ type: "high_value", description: "Order value IRR 5B exceeds the IRR 500M autonomous-execution limit" }],
        alternatives: [
          { supplierName: "Shiraz Flexibles Co.", totalPrice: 4740 * M, leadTimeDays: 9, reliabilityScore: 90, riskLevel: "low", score: 76 },
          { supplierName: "Tabriz Corrugated Works", totalPrice: 4560 * M, leadTimeDays: 10, reliabilityScore: 74, riskLevel: "medium", score: 61 },
        ],
      } as never,
      createdAt: new Date(now - 3300_000),
    },
  });

  // ── Completed historical request (workflow demo trail) ─────────────────────
  const req2 = await db.purchaseRequest.create({
    data: {
      companyId: company.id,
      createdById: userSara.id,
      title: "HDPE restock for extrusion line",
      itemDescription: "HDPE injection granules B55",
      category: "Raw Materials",
      quantity: 8000,
      unit: "kg",
      neededBy: daysAgo(100),
      budget: 12 * 1000 * M,
      priority: "normal",
      status: "completed",
      parsedSummary: "Requirement understood: 8,000 kg HDPE B55 (Raw Materials).",
      recommendation: {
        supplierId: suppliers["Pars Polymers Co."],
        supplierName: "Pars Polymers Co.",
        unitPrice: 1.31 * M,
        totalPrice: 10480 * M,
        leadTimeDays: 5,
        score: 91,
        headline: "Pars Polymers Co. selected: strongest reliability (92%) at market price.",
      } as never,
      createdAt: daysAgo(112),
    },
  });
  for (const [key, label, sortOrder] of [["created","Request Created",0],["parsed","Requirement Parsed",1],["suppliers_found","Suppliers Found",2],["offers_compared","Offers Compared",3],["risk_evaluated","Risk Evaluated",4],["recommendation_ready","Recommendation Generated",5],["approval","Waiting for Approval",6],["po_created","Purchase Order Created",7],["finance_updated","Finance Updated",8]] as const) {
    const t = new Date(daysAgo(112).getTime() + sortOrder * 60000);
    await db.workflowStage.create({ data: { requestId: req2.id, key, label, sortOrder, status: sortOrder === 6 ? "waiting" : "done", summary: "Completed in prior cycle.", startedAt: t, completedAt: t } });
  }
  const poHist = await db.purchaseOrder.create({
    data: {
      companyId: company.id,
      poNumber: "PO-Q2-1033",
      requestId: req2.id,
      supplierId: suppliers["Pars Polymers Co."],
      status: "delivered",
      subtotal: 10480 * M,
      tax: Math.round(10480 * M * 0.09),
      total: Math.round(10480 * M * 1.09),
      expectedDelivery: daysAgo(107),
      deliveredAt: daysAgo(106),
      approvedById: userSara.id,
      sentAt: daysAgo(112),
      createdAt: daysAgo(112),
      items: { create: [{ productId: products["RM-HDPE-B55"], description: "8,000 × HDPE injection granules B55", quantity: 8000, unitPrice: 1.31 * M, total: 10480 * M }] },
    },
  });
  await db.transaction.create({
    data: {
      companyId: company.id,
      type: "expense",
      category: "Procurement",
      description: "PO-Q2-1033 — Pars Polymers Co. (HDPE injection granules B55)",
      amount: Math.round(10480 * M * 1.09),
      date: daysAgo(106),
      status: "cleared",
      relatedType: "purchase_order",
      relatedId: poHist.id,
    },
  });

  // ── Agent activity feed ────────────────────────────────────────────────────
  const activity: [number, string, string, string, string, string][] = [
    [0, "finance_cfo", "AI CFO", "cash_analysis", "Analyzing upcoming cash requirements — 2 payables due within 14 days", "info"],
    [0.4, "procurement", "Procurement Agent", "supplier_confirmed", "Aria Logistics Partners confirmed PO-Q3-1052 pickup window", "info"],
    [1.2, "orchestrator", "AI Orchestrator", "policy_check", "Policy check passed: all executed actions within autonomy limits", "success"],
    [2.6, "business", "Business Agent", "market_scan", "Scanning supplier network for potential artisan partners", "info"],
    [3.1, "finance_cfo", "Risk Engine", "flagged", "Expense flagged: Advarna Consulting GmbH IRR 7.8B — no prior spend in Consulting", "warning"],
    [3.6, "procurement", "Procurement Agent", "approval_requested", "Waiting for human approval before issuing purchase order to Isfahan Packaging Industries", "warning"],
    [3.7, "procurement", "FARMAN", "recommendation", "FARMAN recommends Isfahan Packaging Industries — IRR 5B, delivery in 4 days", "success"],
    [3.8, "procurement", "Risk Engine", "risk_flagged", "Risk Engine flagged Tabriz Corrugated Works (medium)", "warning"],
    [3.9, "procurement", "Procurement Agent", "offers_compared", "Procurement Agent compared 5 offers across price, delivery and reliability", "info"],
    [4.0, "procurement", "Procurement Agent", "suppliers_found", "Procurement Agent found 5 suppliers for packaging", "info"],
    [4.1, "procurement", "Procurement Agent", "requirement_parsed", "Parsed requirement: 1,200 × heavy-duty corrugated boxes (Packaging)", "info"],
    [4.2, "user", "Sara Mahdavi", "request_created", "New purchase request: 1,200 × heavy-duty corrugated boxes 480×400mm", "info"],
    [5.0, "finance_cfo", "AI CFO", "forecast", "90-day cash projection updated: IRR 438B (+IRR 26B vs last week)", "success"],
    [6.2, "procurement", "Procurement Agent", "po_delivered", "PO-Q2-1046 marked delivered by Kaveh Paper & Board — quality check pending", "info"],
    [7.5, "orchestrator", "AI Orchestrator", "execution_complete", "Executed 3 autonomous actions today (within policy limits)", "success"],
  ];
  for (const [hours, agentKey, actor, action, message, level] of activity) {
    await db.activityLog.create({
      data: { companyId: company.id, agentKey, actor, action, message, level, createdAt: new Date(now - hours * 3600_000) },
    });
  }

  // ── Agent tasks snapshot ───────────────────────────────────────────────────
  await db.agentTask.createMany({
    data: [
      { agentKey: "finance_cfo", title: "Analyzing upcoming cash requirements", detail: "2 pending payables · 90-day forecast refresh", status: "running", progress: 62 },
      { agentKey: "procurement", title: "Monitoring open orders", detail: "Tracking 3 issued POs against delivery windows", status: "running", progress: 40 },
      { agentKey: "business", title: "Preparing launch task templates", status: "queued" },
      { agentKey: "procurement", title: "Awaiting approval — export cartons", detail: "Isfahan Packaging Industries · IRR 5B", status: "waiting", relatedType: "purchase_request", relatedId: req1.id },
      { agentKey: "orchestrator", title: "Nightly knowledge-graph consistency check", status: "done", finishedAt: new Date(now - 6 * 3600_000) },
    ],
  });

  console.log("Seed complete (currency: IRR):");
  console.log(`  company=Zarin Industrial Group users=3 suppliers=${suppliersData.length} products=${productsData.length}`);
  console.log(`  catalog=${catalog.length} po_history=${historyPOs.length} login: sara@farman.dev / farman123`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
