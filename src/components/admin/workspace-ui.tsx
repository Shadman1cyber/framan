"use client";

/* Shared presentational pieces of the workspace (R01). Pure display helpers,
 * no data fetching — keeps the main component lean and reviewable. */

export const faTime = (iso: string) =>
  new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

export const RUN_STATE_FA: Record<string, string> = {
  queued: "آماده اجرا", waiting_approval: "منتظر تأیید شما", paused: "متوقف شده", running: "در حال اجرا",
  succeeded: "انجام شد", failed: "ناموفق", cancelled: "لغو شد",
};
export const TOOL_FA: Record<string, string> = {
  get_ai_status: "وضعیت دستیار", set_ai_enabled: "تغییر وضعیت دستیار", calculate_sales_report: "گزارش فروش",
  search_catalog: "جست‌وجوی کاتالوگ", list_lessons: "درس‌های فعال", get_order: "سفارش", list_orders: "فهرست سفارش‌ها",
  get_product: "محصول", list_inventory: "موجودی انبار", list_staff: "کارکنان", list_reservations: "رزروها",
  change_order_status: "تغییر وضعیت سفارش", update_price: "تغییر قیمت", adjust_inventory: "تعدیل موجودی",
};
export const ORDER_STATUS_FA: Record<string, string> = {
  PENDING: "در انتظار تایید", CONFIRMED: "تایید شده", PREPARING: "در حال آماده‌سازی",
  READY: "آماده تحویل", COMPLETED: "تکمیل شد", CANCELLED: "لغو شد",
};
export const ARTIFACT_FA: Record<string, string> = {
  upload_csv: "CSV ورودی", upload_xlsx: "اکسل", upload_txt: "متن", upload_pdf: "PDF",
  report_csv: "گزارش CSV", report_xlsx: "گزارش اکسل", chart_svg: "نمودار",
};

const ERROR_FA: Record<string, string> = {
  LEGACY_SESSION_READ_ONLY: "گفتگوهای قدیمی فقط‌خواندنی هستند",
  SESSION_ARCHIVED: "این گفتگو بایگانی شده است",
  OCR_UNAVAILABLE: "این PDF اسکن‌شده است؛ OCR در این نسخه در دسترس نیست",
  UNSUPPORTED_FILE_TYPE: "فرمت فایل پشتیبانی نمی‌شود (CSV، XLSX، TXT، PDF)",
  FILE_TOO_LARGE: "حجم فایل بیش از حد مجاز است",
  APPROVAL_EXPIRED: "مهلت تأیید گذشته؛ درخواست جدید ثبت کنید",
  APPROVAL_MISMATCH: "تأیید با این عملیات منطبق نیست",
  STALE_SOURCE: "داده هدف تغییر کرده؛ تأیید قبلی باطل شد",
  TARGET_NOT_FOUND: "هدف یافت نشد",
  PLANNER_UNAVAILABLE: "برنامه‌ریز مدل در دسترس نیست (دستیار غیرفعال یا کلید تنظیم نشده)",
  PLAN_UNSUPPORTED: "این درخواست با ابزارهای مجاز قابل اجرا نیست؛ آن را با یکی از ابزارهای پشتیبانی‌شده مطرح کنید",
  PLAN_UNSUPPORTED_OR_UNAVAILABLE: "مدل نتوانست برنامه معتبر بسازد؛ درخواست را دقیق‌تر بنویسید",
  AGENT_DISABLED: "موتور اجرا خاموش است",
  WRITES_DISABLED: "تغییرات کسب‌وکار با فلگ سرور بسته است",
  SHADOW_MODE: "حالت سایه فعال است؛ تغییرات اعمال نمی‌شود",
  SKILL_NOT_ACTIVE: "اسکیل فعال با این نام وجود ندارد",
  NO_ROLLBACK_TARGET: "نسخه قابل بازگشت یافت نشد",
  CRITERIA_UNEVALUABLE: "معیارهای موفقیت این نسخه قابل ارزیابی ساختاریافته نیستند؛ ابتدا معیارها را ساختاریافته کنید",
  EVALUATION_REQUIRED: "ابتدا آزمون با نتیجه قبول لازم است",
  SINGLE_CAFE_SCOPE_REQUIRED: "پیکربندی کافه ناقص است (AGENT_CAFE_ID)",
  EXECUTION_UNAVAILABLE_RETRY_SAME_KEY: "خطای موقت سرور؛ همان درخواست را دوباره ارسال کنید",
};
export const faError = (code: string) => ERROR_FA[code] ?? code;

export const safeJson = (raw: string | null | undefined): Record<string, unknown> => {
  try { return raw ? (JSON.parse(raw) as Record<string, unknown>) : {}; } catch { return {}; }
};

/* Safe Persian markdown subset → React nodes. Never injects HTML: the only
 * rendered strings are plain text segments inside React children. */
import type { ReactNode } from "react";

export function Markdown({ text }: { text: string }) {
  return <>{text.split(/\n{2,}/).map((block, bi) => {
    const lines = block.split("\n");
    if (lines.every(l => /^\s*[-•*]\s+/.test(l))) {
      return (
        <ul key={bi} className="my-1 list-disc space-y-1 pe-4">
          {lines.map((l, i) => <li key={i}>{inlineMd(l.replace(/^\s*[-•*]\s+/, ""))}</li>)}
        </ul>
      );
    }
    if (/^#{1,4}\s/.test(block)) return <h4 key={bi} className="mb-1 mt-2 font-bold">{inlineMd(block.replace(/^#{1,4}\s+/, ""))}</h4>;
    if (/^```/.test(block)) {
      return <pre key={bi} dir="ltr" className="my-1 overflow-auto rounded bg-beige p-2 text-xs dark:bg-dark-surfaceHover">{block.replace(/^```\w*\n?/, "").replace(/\n?```$/, "")}</pre>;
    }
    return <p key={bi} className="my-0.5 whitespace-pre-line">{lines.map((l, i) => <span key={i}>{inlineMd(l)}{i < lines.length - 1 && <br />}</span>)}</p>;
  })}</>;
}

function inlineMd(s: string): ReactNode {
  const tokens: Array<{ t: "code" | "bold" | "text"; v: string }> = [];
  let rest = s;
  while (rest.length) {
    const c = rest.indexOf("`");
    const b = rest.indexOf("**");
    if (c === -1 && b === -1) { tokens.push({ t: "text", v: rest }); break; }
    const useCode = c !== -1 && (b === -1 || c < b);
    if (useCode) {
      const end = rest.indexOf("`", c + 1);
      if (end === -1) { tokens.push({ t: "text", v: rest }); break; }
      if (c > 0) tokens.push({ t: "text", v: rest.slice(0, c) });
      tokens.push({ t: "code", v: rest.slice(c + 1, end) });
      rest = rest.slice(end + 1);
    } else {
      const end = rest.indexOf("**", b + 2);
      if (end === -1) { tokens.push({ t: "text", v: rest }); break; }
      if (b > 0) tokens.push({ t: "text", v: rest.slice(0, b) });
      tokens.push({ t: "bold", v: rest.slice(b + 2, end) });
      rest = rest.slice(end + 2);
    }
  }
  return (
    <>
      {tokens.filter(t => t.v !== "").map((tk, i) =>
        tk.t === "code"
          ? <code key={i} dir="ltr" className="rounded bg-beige px-1 text-xs dark:bg-dark-surfaceHover">{tk.v}</code>
          : tk.t === "bold"
            ? <strong key={i} className="font-semibold">{tk.v}</strong>
            : <span key={i}>{tk.v}</span>,
      )}
    </>
  );
}