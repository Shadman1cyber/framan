import { NextResponse } from "next/server";
import { getSessionUser, roleHas } from "@/lib/guards";
import type { Permission } from "@/lib/constants";
import type { SessionUser } from "@/lib/guards";
import { cashierTabIsEnabled, type CashierTabId } from "@/lib/cashier-access";

/**
 * Shared API guard for management endpoints.
 * 401 when not authenticated, 403 when the role lacks the permission.
 */
export async function guard(
  perm: Permission,
  cashierTab?: CashierTabId,
): Promise<{ user: SessionUser } | { res: NextResponse }> {
  const user = await getSessionUser();
  if (!user) {
    return { res: NextResponse.json({ error: "ابتدا وارد شوید" }, { status: 401 }) };
  }
  if (!roleHas(user.role, perm)) {
    return { res: NextResponse.json({ error: "دسترسی مجاز نیست" }, { status: 403 }) };
  }
  if (user.role === "CASHIER" && cashierTab && !(await cashierTabIsEnabled(cashierTab))) {
    return { res: NextResponse.json({ error: "این بخش برای صندوق‌دار غیرفعال است" }, { status: 403 }) };
  }
  return { user };
}
