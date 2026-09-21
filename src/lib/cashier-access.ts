import { prisma } from "./db";
import { ALL_CASHIER_TAB_IDS, type CashierTabId } from "./cashier-tabs";

export { CASHIER_TABS, type CashierTabId } from "./cashier-tabs";

const SETTING_KEY = "cashier.enabledTabs";
const ALL_TAB_IDS = ALL_CASHIER_TAB_IDS;

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
