import { redirect } from "next/navigation";
import { getSessionUser } from "./guards";
import { cashierTabIsEnabled, type CashierTabId } from "./cashier-access";
import { isOwner } from "./constants";

export async function requireAdminPage(tabId: CashierTabId) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (user.role === "CASHIER" && !(await cashierTabIsEnabled(tabId))) {
    redirect("/admin/no-access");
  }
  return user;
}

/** Owner-only admin page (also accepts the legacy ADMIN role). */
export async function requireOwnerPage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (!isOwner(user.role)) redirect("/admin");
  return user;
}
