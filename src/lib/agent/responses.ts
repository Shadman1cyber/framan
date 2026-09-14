import type { AgentRun } from "@prisma/client";

type Row = Record<string, unknown>;
const row = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.map(row) : [];
const str = (value: unknown) => value == null ? "" : String(value);
const money = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? `${value} تومان` : "قیمت ثبت نشده";
const status = (value: unknown) => ({
  PENDING: "در انتظار تأیید", CONFIRMED: "تأیید شده", PREPARING: "در حال آماده‌سازی",
  READY: "آماده تحویل", COMPLETED: "تکمیل شده", CANCELLED: "لغو شده",
  RESERVED: "رزرو شده", SEATED: "مستقر شده", NO_SHOW: "عدم حضور",
}[str(value)] ?? str(value));
const id = (r: Row) => r.id ? ` [شناسه: ${str(r.id)}]` : "";
const date = (value: unknown) => {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return "زمان ثبت نشده";
  return new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", dateStyle: "short", timeStyle: "short" }).format(new Date(value)) + " (تهران)";
};

/** Render only persisted tool receipts. No model call or invented data. */
export function responseText(run: Pick<AgentRun, "id" | "state" | "result">): string {
  if (run.state === "waiting_approval") return "این درخواست به تأیید شما نیاز دارد؛ کارت تأیید را بررسی و تأیید یا رد کنید.";
  if (run.state !== "succeeded" || !run.result) return `وضعیت اجرا: ${run.state} — شناسه: ${run.id}`;
  const result = row(JSON.parse(run.result));
  if (Array.isArray(result.steps)) {
    return rows(result.steps).map((step, index) => `گام ${index + 1}:\n${summarizeStepResult(step.result)}`).join("\n\n");
  }
  return summarizeStepResult(result);
}

/** A bounded list never pretends that its displayed count is the database total. */
function list(o: Row, key: string, title: string, format: (r: Row) => string): string {
  const values = rows(o[key]);
  const shown = values.slice(0, 20);
  const total = typeof o.totalCount === "number" ? o.totalCount : typeof o.count === "number" && o.count > values.length ? o.count : null;
  const heading = total === null ? `${title} — نمایش ${shown.length} مورد` : `${title} — نمایش ${shown.length} از ${total} مورد`;
  const body = shown.length ? shown.map(r => `• ${format(r)}`).join("\n") : "در این نتیجه موردی یافت نشد.";
  const remainder = values.length > shown.length ? `\n${values.length - shown.length} مورد دیگر در جزئیات نتیجه موجود است.` : "";
  return `${heading}\n${body}${remainder}`;
}

function product(r: Row): string {
  const base = `${str(r.nameFa || r.label || r.id)}: ${money(r.price)}`;
  const availability = typeof r.isAvailable === "boolean" ? `؛ ${r.isAvailable ? "موجود" : "ناموجود"}` : "";
  const lines = rows(r.coffeeLines).map(line => `${str(line.nameFa || row(line.coffeeLine).nameFa || line.coffeeLineId)}: ${money(line.price)}${line.isActive === false ? " (غیرفعال)" : ""}`).join("، ");
  return `${base}${availability}${r.category ? `؛ دسته: ${str(r.category)}` : ""}${lines ? `؛ خطوط قهوه: ${lines}` : ""}${id(r)}`;
}

function order(r: Row): string {
  const parts = [`سفارش ${str(r.id)}`, status(r.status), money(r.total)];
  if (r.orderType) parts.push(r.orderType === "TABLE" ? "میز" : "بیرون‌بر");
  if (r.table != null) parts.push(`میز ${str(r.table)}`);
  if (r.customerName) parts.push(str(r.customerName));
  if (r.createdAt) parts.push(date(r.createdAt));
  const items = rows(r.items).map(item => {
    const option = typeof item.optionPrice === "number" && item.optionPrice !== 0 ? ` + افزونه ${money(item.optionPrice)}` : "";
    return `  - ${str(item.productName || row(item.product).nameFa || item.productId)}: ${str(item.quantity)} عدد × ${money(item.price)}${option}${item.coffeeLine ? `؛ خط ${str(item.coffeeLine)}` : ""}`;
  });
  return parts.filter(Boolean).join("؛ ") + (items.length ? `\n${items.join("\n")}` : "");
}

function summarizeStepResult(result: unknown): string {
  const o = row(result);
  if ("artifactId" in o && "filename" in o && "total" in o) {
    const kindLabel = str(o.kind) === "chart_svg" ? "نمودار (SVG)" : str(o.kind) === "report_xlsx" ? "گزارش اکسل" : "گزارش CSV";
    return `فایل «${str(o.filename)}» (${kindLabel}) ساخته شد — بازه: ${date(str(o.from))} تا ${date(str(o.to))}\n` +
      `جمع سفارش‌های تکمیل‌شده: ${money(o.total)}؛ تعداد: ${str(o.count)}؛ این عدد سود یا پرداخت وصول‌شده نیست.\n` +
      `${typeof o.text === "string" ? o.text.split("\n").slice(0, 5).join("\n") + "\n" : ""}دانلود در پنل «خروجی و پیش‌نمایش»؛ شناسه فایل: ${str(o.artifactId)}`;
  }
  if (typeof o.text === "string" && o.text.includes("گزارش فروش")) return o.text;
  if ("available" in o && ("profit" in o || "missing" in o)) {
    // Material-cost profit: rendered from persisted receipt fields only.
    if (o.available === true) {
      const productRows = rows(o.byProduct).slice(0, 5).map(r => `• ${str(r.product)}: درآمد ${money(r.revenue)}؛ هزینهٔ مواد ${money(r.cost)}؛ سود ${money(r.profit)} (${str(r.quantity)} عدد)`).join("\n");
      return `سود و هزینه (هزینهٔ مواد اولیه):\nدرآمد: ${money(o.revenue)}؛ هزینهٔ مواد: ${money(o.cost)}؛ سود: ${money(o.profit)}\nمبنا: ${str(o.basis)}${productRows ? `\n${productRows}` : ""}`;
    }
    const missing = rows(o.missing).map(m => `• ${str(m.product)}: ${str(m.issue)}`).join("\n");
    return `محاسبهٔ هزینه/سود با دادهٔ موجود ممکن نیست؛ هزینه یا سود فرضی ارائه نمی‌شود.\n${missing ? missing + "\n" : ""}درآمد همان بازه (بدون سود): ${money(o.revenue)}؛ مبنا: ${str(o.basis)}`;
  }
  if ("orderId" in o && "from" in o && "to" in o) return `وضعیت سفارش ${str(o.orderId)} از ${status(o.from)} به ${status(o.to)} تغییر کرد و رسید ماندگار ثبت شد.`;
  if ("before" in o && "after" in o && "ingredientName" in o && "delta" in o) return `موجودی «${str(o.ingredientName)}»: ${str(o.before)} → ${str(o.after)} ${str(o.unit)}؛ تغییر: ${str(o.delta)}؛ دلیل: ${str(o.reason)}`;
  if ("before" in o && "after" in o && "targetLabel" in o) return `قیمت «${str(o.targetLabel)}»: ${money(o.before)} → ${money(o.after)}؛ رسید ثبت شد.`;
  if ("total" in o && "currency" in o) return `جمع سفارش‌های تکمیل‌شده: ${money(o.total)}، تعداد: ${str(o.count)}؛ این عدد سود یا پرداخت وصول‌شده نیست. منبع: ${str(o.source)}`;
  if ("results" in o) {
    const rendered = list(o, "results", "نتایج کاتالوگ", r => {
      if (r.kind === "Product") return product({ ...r, nameFa: r.label, id: r.refId });
      const detail = typeof r.price === "number" ? `؛ ${money(r.price)}` : "";
      return `${str(r.label)} (${str(r.kind)})${detail}${r.refId ? ` [شناسه: ${str(r.refId)}]` : ""}`;
    });
    return rendered + (o.stale === true ? "\nداده کاتالوگ به‌روز نیست؛ قیمت و موجودی باید از منبع زنده خوانده شود." : rows(o.results).some(r => r.kind === "Product" && typeof r.price !== "number") ? "\nقیمت در نتیجه کاتالوگ موجود نیست؛ برای قیمت باید جزئیات محصول خوانده شود." : "");
  }
  if ("lessons" in o) return list(o, "lessons", "درس‌های فعال", r => `${str(r.topic)}: ${str(r.statement)}`);
  if ("artifacts" in o && Array.isArray(o.artifacts) && o.artifacts.every(a => a && typeof a === "object" && "rowCount" in (a as object))) {
    // Deterministic attachment analysis: every number comes from the stored file.
    const parts = rows(o.artifacts).map(a => {
      const head = `فایل «${str(a.filename)}»: ${str(a.rowCount)} ردیف${Array.isArray(a.columns) && a.columns.length ? `؛ ستون‌ها: ${a.columns.map(String).join("، ")}` : ""}`;
      const nums = rows(a.numeric).map(n => `  - ${str(n.column)}: جمع ${str(n.sum)}؛ میانگین ${str(n.mean)}؛ بیشینه ${str(n.max)}${n.maxLabel ? ` (${str(n.maxLabel)})` : ""}؛ کمینه ${str(n.min)}`).join("\n");
      const note = a.note ? `\n${str(a.note)}` : "";
      return `${head}\n${nums}${note}`;
    });
    return `تحلیل فایل‌های پیوست (محاسبه از خود فایل، بدون داده فرضی):\n${parts.join("\n")}`;
  }
  if ("enabled" in o) return `وضعیت دستیار: ${o.enabled ? "فعال" : "غیرفعال"}؛ منبع: ${str(o.source)}`;
  if ("product" in o) return product(row(o.product));
  if ("order" in o) return order(row(o.order));
  if ("orders" in o) return list(o, "orders", "فهرست سفارش‌ها", order);
  if ("products" in o) return list(o, "products", "لیست محصولات", product);
  if ("categories" in o) return list(o, "categories", "دسته‌های منو", r => `${str(r.nameFa)}: ${str(r.productCount)} محصول${r.isActive === false ? "؛ غیرفعال" : ""}${id(r)}`);
  if ("ingredients" in o) return list(o, "ingredients", "موجودی انبار", r => `${str(r.nameFa)}: ${str(r.stockQuantity)} ${str(r.unit)}${r.minQuantity != null ? `؛ حداقل: ${str(r.minQuantity)} ${str(r.unit)}` : ""}${id(r)}`);
  if ("staff" in o) return list(o, "staff", "پرسنل", r => `${str(r.name)}؛ نقش: ${str(r.role)}؛ ${r.isActive ? "فعال" : "غیرفعال"}${id(r)}`);
  if ("reservations" in o) return list(o, "reservations", "رزروهای پیش‌رو", r => `${str(r.customerName)}؛ ${str(r.guests)} نفر؛ میز ${str(row(r.table).number)}؛ ${date(r.reservedAt)}؛ ${status(r.status)}${id(r)}`);
  if ("tables" in o) return list(o, "tables", "میزها", r => `میز ${str(r.number)}${r.label ? ` (${str(r.label)})` : ""}؛ ${r.isOccupied ? "اشغال" : "آزاد"}؛ ${r.isActive ? "فعال" : "غیرفعال"}${id(r)}`);
  if ("qrCodes" in o) return list(o, "qrCodes", "کدهای QR", r => `${str(r.label || r.code || r.id)}؛ ${r.isActive ? "فعال" : "غیرفعال"}${r.expiresAt ? `؛ انقضا: ${date(r.expiresAt)}` : ""}${id(r)}`);
  if ("users" in o) return list(o, "users", "کاربران", r => `${str(r.name || r.id)}؛ نقش: ${str(r.role)}${id(r)}`);
  if ("ratings" in o) return list(o, "ratings", "امتیازها", r => `${str(r.productName)}: ${str(r.rating)} از ۵${r.review ? `؛ ${str(r.review)}` : ""}${id(r)}`);
  if ("allergens" in o) return list(o, "allergens", "آلرژن‌ها", r => `${str(r.nameFa)}${r.nameEn ? ` (${str(r.nameEn)})` : ""}${id(r)}`);
  return "نتیجه اجرا ثبت شد؛ جزئیات در رسید اجرا موجود است.";
}
