// Backwards-compatible role helpers (thin wrappers over the RBAC matrix).
import { normalizeRole, type Role } from "./constants";

/** @deprecated use roleHas / isOwner instead */
export function isAdmin(role?: string | null): boolean {
  const r = normalizeRole(role);
  return r === "OWNER" || role === "ADMIN";
}

/** @deprecated use isManagement instead */
export function isStaffOrAdmin(role?: string | null): boolean {
  const r = normalizeRole(role);
  return r === "OWNER" || r === "CASHIER" || role === "ADMIN" || role === "STAFF";
}

export function requireRole(
  role: string | null | undefined,
  allowed: Role[],
): boolean {
  const r = normalizeRole(role);
  if (!r) return false;
  return allowed.includes(r);
}
