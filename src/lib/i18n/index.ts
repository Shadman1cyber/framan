// Lightweight i18n scaffold. The prototype ships English-first, but all shell
// strings flow through t() so a full Persian locale can be enabled by
// completing fa.ts and switching the locale cookie (RTL handled via <html dir>).

export type Locale = "en" | "fa";

const en = {
  "brand.name": "FARMAN",
  "brand.native": "فرمان",
  "brand.tagline": "Command → Authority → Execution",
  "nav.overview": "Command Center",
  "nav.business": "Business",
  "nav.tasks": "Tasks",
  "nav.businessSetup": "Business Setup",
  "nav.procurement": "Procurement",
  "nav.requests": "Requests",
  "nav.suppliers": "Suppliers",
  "nav.orders": "Purchase Orders",
  "nav.intelligence": "Intelligence",
  "nav.finance": "Finance",
  "nav.financeOverview": "Overview",
  "nav.cashflow": "Cash Flow",
  "nav.expenses": "Expenses",
  "nav.cfo": "AI CFO",
  "nav.ai": "AI",
  "nav.agents": "Agents",
  "nav.activity": "Activity",
  "nav.approvals": "Approvals",
  "nav.settings": "Settings",
  "command.placeholder": "Give FARMAN a command…",
  "command.run": "Run",
  "action.approve": "Approve",
  "action.reject": "Reject",
  "action.requestChanges": "Request Changes",
  "action.createRequest": "New Request",
} as const;

export type DictKey = keyof typeof en;

const fa: Partial<Record<DictKey, string>> = {
  "brand.tagline": "فرمان → اختیار → اجرا",
  "nav.overview": "مرکز فرماندهی",
  "nav.business": "کسب‌وکار",
  "nav.tasks": "کارها",
  "nav.businessSetup": "راه‌اندازی کسب‌وکار",
  "nav.procurement": "تأمین",
  "nav.requests": "درخواست‌ها",
  "nav.suppliers": "تأمین‌کنندگان",
  "nav.orders": "سفارش‌های خرید",
  "nav.intelligence": "هوش تأمین",
  "nav.finance": "مالی",
  "nav.financeOverview": "نمای کلی",
  "nav.cashflow": "جریان نقدی",
  "nav.expenses": "هزینه‌ها",
  "nav.cfo": "مدیر مالی هوشمند",
  "nav.ai": "هوش مصنوعی",
  "nav.agents": "ایجنت‌ها",
  "nav.activity": "فعالیت",
  "nav.approvals": "تأییدها",
  "nav.settings": "تنظیمات",
};

export function getDict(locale: Locale) {
  return (key: DictKey): string => {
    if (locale === "fa" && fa[key]) return fa[key] as string;
    return en[key];
  };
}

export function isRtl(locale: Locale) {
  return locale === "fa";
}
