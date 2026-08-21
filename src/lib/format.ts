import { APP_CURRENCY } from "@/lib/domain";

// All monetary amounts are stored in the company's currency (the demo company
// operates in Iranian Rial — IRR). Formatting is centralized here so a future
// multi-currency rollout only touches this module.

export function formatMoney(
  value: number,
  opts?: { compact?: boolean }
): string {
  // Rial amounts reach trillions — auto-compact large values so figures stay
  // readable (IRR 2.1B instead of IRR 2,100,000,000) unless explicitly asked.
  const autoCompact = Math.abs(value) >= 100_000_000;
  const compact = opts?.compact || (!opts && autoCompact);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: APP_CURRENCY,
    currencyDisplay: "code",
    maximumFractionDigits: compact ? 1 : 0,
    notation: compact ? "compact" : "standard",
  })
    .format(value)
    .replace(/^(\D*)\s?/, "$1")
    .trim();
}

/** Backwards-compatible alias used across older call sites. */
export const formatUSD = formatMoney;

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatPct(value: number, digits = 0): string {
  return `${value.toFixed(digits)}%`;
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function timeAgo(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(date);
}

export function relativeDays(target: Date | string | null | undefined): number | null {
  if (!target) return null;
  const date = typeof target === "string" ? new Date(target) : target;
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}
