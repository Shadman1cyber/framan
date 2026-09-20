import { prisma } from "./db";

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

const SETTING_KEY = "cashier.enabledTabs";
const ALL_TAB_IDS = CASHIER_TABS.map((tab) => tab.id);

export async function getEnabledCashierTabs(): Promise<CashierTabId[]> {
  const setting = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  if (!setting) return [...ALL_TAB_IDS];
  try {
    const value = JSON.parse(setting.value);
    if (!Array.isArray(value)) return [...ALL_TAB_IDS];
    return ALL_TAB_IDS.filter((id) => value.includes(id));
  } catch {
    return [...ALL_TAB_IDS];
  }
}

export async function setEnabledCashierTabs(tabIds: CashierTabId[]) {
  const normalized = ALL_TAB_IDS.filter((id) => tabIds.includes(id));
  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: JSON.stringify(normalized) },
    update: { value: JSON.stringify(normalized) },
  });
  return normalized;
}

export async function cashierTabIsEnabled(tabId: CashierTabId): Promise<boolean> {
  return (await getEnabledCashierTabs()).includes(tabId);
}
