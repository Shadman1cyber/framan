import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import {
  normalizeRole,
  roleHas,
  isManagement,
  isOwner,
  type Permission,
  type Role,
} from "./constants";

export { isAdmin, isStaffOrAdmin, requireRole } from "./constants-compat";

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: Role;
};

/** Read the current session user with a normalized role. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const role = normalizeRole((session.user as { role?: string }).role);
  const id = (session.user as { id?: string }).id;
  if (!role || !id) return null;
  return {
    id,
    name: session.user.name ?? null,
    email: session.user.email ?? null,
    role,
  };
}

/** API guard: session user must hold the permission. Returns null when unauthorized. */
export async function requirePermission(perm: Permission): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user) return null;
  if (!roleHas(user.role, perm)) return null;
  return user;
}

export { roleHas, isManagement, isOwner, normalizeRole };
export type { Permission, Role };
