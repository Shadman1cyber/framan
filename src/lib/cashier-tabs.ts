/** Client-safe cashier tab definitions (no Prisma — importable from "use client" components). */

export const CASHIER_TABS = [
  { id: "dashboard", label: "داشبورد", href: "/admin" },
  { id: "orders", label: "سفارش‌ها", href: "/admin/orders" },
  { id: "customers", label: "باشگاه مشتریان", href: "/admin/customers" },
  { id: "ratings", label: "امتیازها", href: "/admin/ratings" },
  { id: "tables", label: "میزها", href: "/admin/tables" },
  { id: "reservations", label: "رزرو میزها", href: "/admin/reservations" },
  { id: "qr", label: "کدهای QR", href: "/admin/qr" },
  { id: "leaves", label: "مرخصی‌ها", href: "/admin/leaves" },
] as const;

export type CashierTabId = (typeof CASHIER_TABS)[number]["id"];

export const ALL_CASHIER_TAB_IDS: CashierTabId[] = CASHIER_TABS.map((tab) => tab.id);
