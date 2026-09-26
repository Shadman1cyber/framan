export type ModuleKind = "accounting" | "erp" | "crm";

export type ModuleStatTone = "green" | "yellow" | "red" | "blue";

export type ModuleStat = {
  label: string;
  value: string;
  status: string;
  tone: ModuleStatTone;
};

export type ModuleConfig = {
  kind: ModuleKind;
  label: string;
  subtitle: string;
  percent: number;
  stats: ModuleStat[];
  href: string;
  buttonLabel: string;
};

export const DASHBOARD_HOME_HREF = "/admin";

export const moduleKinds: ModuleKind[] = ["accounting", "erp", "crm"];

/**
 * Admin sections that belong to a module and are rendered inside that module's
 * dark shell, so the sidebar never interrupts a module's own workflow.
 */
export const MODULE_SECTIONS: Record<ModuleKind, { href: string; label: string; icon: string }[]> = {
  accounting: [
    { href: "/admin/financial", label: "گزارش مالی", icon: "💰" },
    { href: "/admin/sales-flow", label: "جریان فروش", icon: "📈" },
  ],
  erp: [
    { href: "/admin/inventory", label: "انبار مواد اولیه", icon: "🌿" },
    { href: "/admin/categories", label: "دسته‌ها", icon: "🗂️" },
    { href: "/admin/products", label: "محصولات", icon: "🍽️" },
    { href: "/admin/allergens", label: "آلرژن‌ها", icon: "⚠️" },
    { href: "/admin/staff", label: "پرسنل و مرخصی‌ها", icon: "👨‍🍳" },
  ],
  crm: [
    { href: "/admin/customers", label: "باشگاه مشتریان", icon: "🎁" },
    { href: "/admin/ratings", label: "امتیازها", icon: "⭐" },
    { href: "/admin/tables", label: "میزها و رزرو میزها", icon: "🪑" },
    { href: "/admin/qr", label: "کدهای QR", icon: "🔳" },
  ],
};

/**
 * Routes rendered in the full-bleed dark dashboard shell: the home screen, the
 * three module pages, the financial report, the sales flow and every admin
 * section owned by a module. Everything else keeps the panel chrome + sidebar.
 */
export const DARK_SHELL_ROUTES = [
  DASHBOARD_HOME_HREF,
  "/admin/ai",
  // Screens that belong to no single module but still live in the dark shell.
  "/admin/orders",
  "/admin/cashier-access",
  "/admin/operations",
  "/admin/sales-flow/settings",
  "/admin/users",
  "/admin/no-access",
  "/admin/workspace",
  ...moduleKinds.flatMap((kind) => [`/admin/${kind}`, ...MODULE_SECTIONS[kind].map((section) => section.href)]),
];

/** Dynamic sub-routes of a dark-shell section, matched by prefix. */
export const DARK_SHELL_PREFIXES = ["/admin/products/"];

/** Tones that mean "done / nothing to chase". */
const RESOLVED_TONES: ModuleStatTone[] = ["green"];

export type AttentionItem = {
  kind: ModuleKind;
  moduleLabel: string;
  href: string;
  stat: ModuleStat;
};

/**
 * Everything the dashboard currently flags as "not settled" — pending
 * payments, low stock, follow-ups, new opportunities. Green stats (ثبت شده,
 * فعال) are settled, so they stay out of the notifications.
 */
export function attentionItems(): AttentionItem[] {
  return moduleKinds.flatMap((kind) => {
    const mod = dashboardModules[kind];
    return mod.stats
      .filter((stat) => !RESOLVED_TONES.includes(stat.tone))
      .map((stat) => ({ kind, moduleLabel: mod.label, href: mod.href, stat }));
  });
}

export const dashboardModules: Record<ModuleKind, ModuleConfig> = {
  accounting: {
    kind: "accounting",
    label: "حسابداری",
    subtitle: "مالی، هزینه‌ها و درآمدها",
    percent: 86,
    stats: [
      { label: "درآمدها", value: "۱۲", status: "ثبت شده", tone: "green" },
      { label: "هزینه‌ها", value: "۵", status: "در حال بررسی", tone: "yellow" },
      { label: "پرداخت‌ها", value: "۲", status: "در انتظار", tone: "red" },
    ],
    href: "/admin/accounting",
    buttonLabel: "ورود به بخش حسابداری",
  },
  erp: {
    kind: "erp",
    label: "ERP",
    subtitle: "تأمین، موجودی و عملیات",
    percent: 72,
    stats: [
      { label: "تأمین‌کنندگان", value: "۱", status: "نیاز به پیگیری", tone: "red" },
      { label: "موجودی", value: "۲", status: "هشدار", tone: "yellow" },
      { label: "خریدها", value: "۴", status: "در حال انجام", tone: "blue" },
    ],
    href: "/admin/erp",
    buttonLabel: "ورود به بخش ERP",
  },
  crm: {
    kind: "crm",
    label: "CRM",
    subtitle: "مشتریان و ارتباطات",
    percent: 68,
    stats: [
      { label: "مشتریان", value: "۲۴", status: "فعال", tone: "green" },
      { label: "پیگیری‌ها", value: "۷", status: "در حال انجام", tone: "yellow" },
      { label: "فرصت‌های فروش", value: "۳", status: "جدید", tone: "blue" },
    ],
    href: "/admin/crm",
    buttonLabel: "ورود به بخش CRM",
  },
};
