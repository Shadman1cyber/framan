import Link from "next/link";

export type AiLockedReason = "disabled" | "key" | "role";

const COPY: Record<AiLockedReason, { title: string; body: string; action: string }> = {
  disabled: {
    title: "دستیار غیرفعال است.",
    body: "برای پرسیدن از داده‌های فروش، انبار و عملیات، دستیار را از صفحه دستیار فعال کنید.",
    action: "فعال‌سازی دستیار",
  },
  key: {
    title: "کلید API هوش مصنوعی تنظیم نشده است.",
    body: "برای پاسخ‌گویی دستیار باید ZHIPU_API_KEY را در تنظیمات سامانه ثبت کنید.",
    action: "رفتن به صفحه دستیار",
  },
  role: {
    title: "گفتگو با دستیار برای مدیرعامل فعال است.",
    body: "برای پرسش از داده‌های مالی، انبار و عملیات کافه با حساب مدیرعامل وارد شوید.",
    action: "رفتن به صفحه دستیار",
  },
};

/** Shown instead of the ask box when the assistant cannot be used yet. */
export function AiChatLocked({ reason, className = "" }: { reason: AiLockedReason; className?: string }) {
  const copy = COPY[reason];
  return (
    <div className={`flex flex-1 flex-col items-center justify-center gap-2 text-center ${className}`}>
      <p className="text-[12px] leading-relaxed text-dashboard-foreground">{copy.title}</p>
      <p className="max-w-md text-[12px] leading-relaxed text-dashboard-muted">{copy.body}</p>
      <Link
        href="/admin/ai"
        className="mt-1 inline-flex min-h-9 items-center rounded-full border border-dashboard-line bg-dashboard-raised px-4 text-[12px] font-semibold text-dashboard-foreground transition-colors hover:border-signal-bright/60"
      >
        {copy.action}
      </Link>
    </div>
  );
}

export function BotIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="7" width="16" height="12" rx="3" />
      <path d="M12 7V4M9 13h.01M15 13h.01M9.5 16.5h5" />
    </svg>
  );
}
