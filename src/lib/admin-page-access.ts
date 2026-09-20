import { redirect } from "next/navigation";
import { getSessionUser } from "./guards";
import { cashierTabIsEnabled, type CashierTabId } from "./cashier-access";

export async function requireAdminPage(tabId: CashierTabId) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (user.role === "CASHIER" && !(await cashierTabIsEnabled(tabId))) {
    redirect("/admin/no-access");
  }
  return user;
}
