import { parseCsv, rowsToObjects } from "./csv";
import { prisma } from "./db";
import { slugify } from "./slug";

/**
 * Extensible data import system for migrating from external accounting software.
 * Pipeline: file -> parser -> mapping -> validation -> preview -> confirmation -> import -> report.
 * Currently supports CSV; adapters for other providers can implement ImportAdapter.
 */

export type ImportKind = "PRODUCTS" | "INGREDIENTS" | "ORDERS" | "EXPENSES";

export type ImportError = { row: number; field?: string; message: string };
export type ImportWarning = { row: number; message: string };

export type ImportPreviewRow = {
  row: number;
  data: Record<string, string>;
  errors: ImportError[];
  warnings: ImportWarning[];
};

export type ImportPreview = {
  kind: ImportKind;
  headers: string[];
  totalRows: number;
  validRows: number;
  errorRows: number;
  rows: ImportPreviewRow[];
};

export type ImportReport = {
  kind: ImportKind;
  created: number;
  skipped: number;
  errors: ImportError[];
};

export const IMPORT_KINDS: ImportKind[] = ["PRODUCTS", "INGREDIENTS", "ORDERS", "EXPENSES"];

const KIND_HEADERS: Record<ImportKind, string[]> = {
  PRODUCTS: ["name", "category", "price", "description"],
  INGREDIENTS: ["name", "unit", "quantity", "minQuantity", "costPerUnit", "supplier"],
  ORDERS: ["customerName", "customerPhone", "items", "total", "date"],
  EXPENSES: ["title", "amount", "date", "category"],
};

const FA_HEADER_ALIASES: Record<string, string> = {
  "نام": "name",
  "نام محصول": "name",
  "دسته": "category",
  "دسته‌بندی": "category",
  "قیمت": "price",
  "توضیحات": "description",
  "واحد": "unit",
  "موجودی": "quantity",
  "حداقل موجودی": "minQuantity",
  "قیمت واحد": "costPerUnit",
  "تامین کننده": "supplier",
  "تأمین کننده": "supplier",
  "تاریخ": "date",
  "شماره تماس": "customerPhone",
  "مبلغ": "amount",
  "عنوان": "title",
};

/** Normalize headers (Persian aliases -> canonical English keys). */
export function normalizeHeaders(headers: string[]): string[] {
  return headers.map((h) => {
    const t = h.trim().toLowerCase();
    return FA_HEADER_ALIASES[h.trim()] ?? FA_HEADER_ALIASES[h] ?? t;
  });
}

export function detectKind(headers: string[]): ImportKind | null {
  const h = headers.map((x) => x.trim().toLowerCase()).join("|");
  if (h.includes("minquantity") || h.includes("costperunit") || h.includes("unit") && h.includes("quantity")) return "INGREDIENTS";
  if (h.includes("items") || h.includes("customername") || h.includes("customerphone")) return "ORDERS";
  if (h.includes("title") && h.includes("amount")) return "EXPENSES";
  if (h.includes("category") && h.includes("price")) return "PRODUCTS";
  return null;
}

export function validateImportFile(content: string): { ok: true; rows: string[][] } | { ok: false; error: string } {
  if (!content?.trim()) return { ok: false, error: "فایل خالی است" };
  if (content.length > 2 * 1024 * 1024) return { ok: false, error: "حجم فایل بیش از حد مجاز است (۲ مگابایت)" };
  const rows = parseCsv(content);
  if (rows.length < 2) return { ok: false, error: "فایل باید شامل سطر هدر و حداقل یک ردیف داده باشد" };
  return { ok: true, rows };
}

export function buildPreview(kind: ImportKind, content: string): ImportPreview {
  const parsed = validateImportFile(content);
  if (!parsed.ok) throw new Error(parsed.error);
  const objects = rowsToObjects(parsed.rows);
  const headers = normalizeHeaders(parsed.rows[0]);

  const rows: ImportPreviewRow[] = objects.map((obj, idx) => {
    // Remap object keys through header normalization.
    const data: Record<string, string> = {};
    parsed.rows[0].forEach((h, i) => {
      data[normalizeHeaders([h])[0]] = obj[h] ?? "";
    });
    const errors = validateRow(kind, data, idx + 2);
    const warnings: ImportWarning[] = [];
    return { row: idx + 2, data, errors, warnings };
  });

  return {
    kind,
    headers,
    totalRows: rows.length,
    validRows: rows.filter((r) => r.errors.length === 0).length,
    errorRows: rows.filter((r) => r.errors.length > 0).length,
    rows: rows.slice(0, 100),
  };
}

function num(v: string): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[,\s]/g, "").replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))));
  return Number.isFinite(n) ? n : null;
}

export function validateRow(kind: ImportKind, data: Record<string, string>, row: number): ImportError[] {
  const errors: ImportError[] = [];
  const name = data.name?.trim();
  if (!name) errors.push({ row, field: "name", message: "نام الزامی است" });

  if (kind === "PRODUCTS") {
    const price = num(data.price ?? "");
    if (price == null || price < 0) errors.push({ row, field: "price", message: "قیمت نامعتبر است" });
    if (name && name.length > 120) errors.push({ row, field: "name", message: "نام طولانی است" });
  }
  if (kind === "INGREDIENTS") {
    const qty = num(data.quantity ?? "");
    if (qty == null || qty < 0) errors.push({ row, field: "quantity", message: "موجودی نامعتبر است" });
    if (data.unit && !["GRAM", "KILOGRAM", "MILLILITER", "LITER", "UNIT", "گرم", "کیلوگرم", "میلی‌لیتر", "لیتر", "عدد"].includes(data.unit.trim())) {
      errors.push({ row, field: "unit", message: "واحد نامعتبر است" });
    }
  }
  if (kind === "ORDERS") {
    if (!data.items?.trim()) errors.push({ row, field: "items", message: "اقلام الزامی است" });
    const total = num(data.total ?? "");
    if (total == null || total < 0) errors.push({ row, field: "total", message: "مبلغ نامعتبر است" });
  }
  if (kind === "EXPENSES") {
    const amount = num(data.amount ?? "");
    if (amount == null || amount <= 0) errors.push({ row, field: "amount", message: "مبلغ نامعتبر است" });
  }
  return errors;
}

/** Conflict detection: which rows would collide with existing records. */
export async function detectConflicts(
  kind: ImportKind,
  preview: ImportPreview,
): Promise<ImportPreview> {
  const withConflicts = { ...preview, rows: [...preview.rows] };
  if (kind === "PRODUCTS") {
    const names = withConflicts.rows.map((r) => r.data.name?.trim()).filter(Boolean) as string[];
    const existing = names.length
      ? await prisma.product.findMany({
          where: { OR: names.map((n) => ({ slug: slugify(n) })) },
          select: { slug: true },
        })
      : [];
    const slugs = new Set(existing.map((e) => e.slug));
    for (const row of withConflicts.rows) {
      if (row.data.name && slugs.has(slugify(row.data.name))) {
        row.warnings.push({ row: row.row, message: "محصولی با این نام وجود دارد؛ به‌روزرسانی خواهد شد" });
      }
    }
  }
  if (kind === "INGREDIENTS") {
    const names = withConflicts.rows.map((r) => r.data.name?.trim()).filter(Boolean) as string[];
    const existing = names.length
      ? await prisma.ingredient.findMany({ where: { nameFa: { in: names } }, select: { nameFa: true } })
      : [];
    const set = new Set(existing.map((e) => e.nameFa));
    for (const row of withConflicts.rows) {
      if (row.data.name && set.has(row.data.name.trim())) {
        row.warnings.push({ row: row.row, message: "ماده اولیه‌ای با این نام وجود دارد؛ به‌روزرسانی خواهد شد" });
      }
    }
  }
  return withConflicts;
}

const UNIT_MAP: Record<string, string> = {
  "گرم": "GRAM", g: "GRAM", gram: "GRAM", grams: "GRAM",
  "کیلوگرم": "KILOGRAM", kg: "KILOGRAM",
  "میلی‌لیتر": "MILLILITER", "میلی لیتر": "MILLILITER", ml: "MILLILITER",
  "لیتر": "LITER", l: "LITER",
  "عدد": "UNIT", unit: "UNIT", pcs: "UNIT",
};

/** Execute the confirmed import inside a transaction; invalid rows are skipped. */
export async function commitImport(kind: ImportKind, content: string): Promise<ImportReport> {
  const preview = await detectConflicts(kind, buildPreview(kind, content));
  const validRows = preview.rows.filter((r) => r.errors.length === 0);
  const errors: ImportError[] = [];
  let created = 0;
  let skipped = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of validRows) {
      try {
        if (kind === "PRODUCTS") {
          const slug = slugify(row.data.name);
          const catName = row.data.category?.trim() || "سایر";
          const catSlug = slugify(catName);
          const category = await tx.category.upsert({
            where: { slug: catSlug },
            create: { slug: catSlug, nameFa: catName },
            update: {},
          });
          const price = num(row.data.price ?? "") ?? 0;
          await tx.product.upsert({
            where: { slug },
            create: {
              slug,
              nameFa: row.data.name.trim(),
              description: row.data.description?.trim() || "—",
              price,
              categoryId: category.id,
              allergenStatus: "FREE",
            },
            update: { price, nameFa: row.data.name.trim() },
          });
          created++;
        } else if (kind === "INGREDIENTS") {
          const unitRaw = (row.data.unit ?? "GRAM").trim();
          const unit = UNIT_MAP[unitRaw] ?? (["GRAM","KILOGRAM","MILLILITER","LITER","UNIT"].includes(unitRaw) ? unitRaw : "GRAM");
          const data = {
            nameFa: row.data.name.trim(),
            unit,
            stockQuantity: num(row.data.quantity ?? "") ?? 0,
            minQuantity: num(row.data.minQuantity ?? ""),
            costPerUnit: num(row.data.costPerUnit ?? ""),
            supplier: row.data.supplier?.trim() || null,
          };
          const existingIng = await tx.ingredient.findFirst({ where: { nameFa: data.nameFa } });
          if (existingIng) {
            await tx.ingredient.update({ where: { id: existingIng.id }, data });
          } else {
            await tx.ingredient.create({ data });
          }
          created++;
        } else if (kind === "EXPENSES") {
          // Stored as a structured report entry (financial records v1).
          const amount = num(row.data.amount ?? "") ?? 0;
          await tx.setting.upsert({
            where: { key: `import.expense.${Date.now()}-${created}` },
            create: {
              key: `import.expense.${Date.now()}-${created}`,
              value: JSON.stringify({
                title: row.data.title?.trim() || "هزینه",
                amount,
                date: row.data.date ?? null,
                category: row.data.category ?? null,
              }),
            },
            update: {},
          });
          created++;
        } else if (kind === "ORDERS") {
          // Historical orders are imported as completed reference records.
          const total = num(row.data.total ?? "") ?? 0;
          await tx.order.create({
            data: {
              orderType: "TAKEAWAY",
              status: "COMPLETED",
              total,
              customerName: row.data.customerName?.trim() || null,
              customerPhone: row.data.customerPhone?.trim() || null,
              notes: "درون‌ریزی شده از سیستم قبلی",
              items: { create: [] },
            },
          });
          created++;
        }
      } catch (e) {
        errors.push({ row: row.row, message: (e as Error).message });
        skipped++;
      }
    }
    skipped += preview.rows.length - validRows.length;
    await tx.importJob.create({
      data: {
        kind,
        filename: `${kind.toLowerCase()}.csv`,
        status: errors.length ? "PARTIAL" : "COMPLETED",
        report: JSON.stringify({ created, skipped, errors: errors.slice(0, 20) }),
      },
    });
  });

  return { kind, created, skipped, errors };
}
