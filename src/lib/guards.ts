import type { Role } from "./constants";

export function isAdmin(role?: string | null): boolean {
  return role === "ADMIN";
}

export function isStaffOrAdmin(role?: string | null): boolean {
  return role === "ADMIN" || role === "STAFF";
}

export function requireRole(role: string | null | undefined, allowed: Role[]): boolean {
  if (!role) return false;
  return allowed.includes(role as Role);
}