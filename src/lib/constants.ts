export const ROLES = {
  CUSTOMER: "CUSTOMER",
  CASHIER: "CASHIER",
  OWNER: "OWNER",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/** Legacy roles mapped to the new architecture. */
export const LEGACY_ROLE_MAP: Record<string, Role> = {
  ADMIN: "OWNER",
  STAFF: "CASHIER",
};

export function normalizeRole(role?: string | null): Role | null {
  if (!role) return null;
  if (role in ROLES) return role as Role;
  return LEGACY_ROLE_MAP[role] ?? null;
}

export const ROLE_LABELS_FA: Record<Role, string> = {
  CUSTOMER: "مشتری",
  CASHIER: "صندوق‌دار",
  OWNER: "صاحب کافه",
};

/** Fine-grained permissions enforced server-side on every management API. */
export const PERMISSIONS = [
  "orders.view",
  "orders.status",
  "tables.manage",
  "products.manage",
  "categories.manage",
  "ingredients.manage",
  "allergens.manage",
  "users.manage",
  "ratings.moderate",
  "customers.loyalty",
  "qr.manage",
  "finance.view",
  "ai.use",
  "ai.configure",
  "import.run",
  "staff.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const CUSTOMER_PERMS: Permission[] = [];
const CASHIER_PERMS: Permission[] = [
  "orders.view",
  "orders.status",
  "tables.manage",
  "qr.manage",
  "ratings.moderate",
  "customers.loyalty",
];
const OWNER_PERMS: Permission[] = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  CUSTOMER: CUSTOMER_PERMS,
  CASHIER: CASHIER_PERMS,
  OWNER: OWNER_PERMS,
};

export function roleHas(role: string | null | undefined, perm: Permission): boolean {
  const r = normalizeRole(role);
  if (!r) return false;
  return ROLE_PERMISSIONS[r].includes(perm);
}

export function isManagement(role?: string | null): boolean {
  const r = normalizeRole(role);
  return r === "CASHIER" || r === "OWNER";
}

export function isOwner(role?: string | null): boolean {
  return normalizeRole(role) === "OWNER";
}

export const ORDER_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "COMPLETED",
  "CANCELLED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_TYPES = ["TABLE", "TAKEAWAY"] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const ORDER_TYPE_LABELS_FA: Record<OrderType, string> = {
  TABLE: "سفارش میز",
  TAKEAWAY: "بیرون‌بر",
};

/**
 * READY ("آماده تحویل") exists for takeaway orders only.
 * Table orders go straight from PREPARING to COMPLETED — no pickup/serve step.
 */
export function orderStatusLabel(status: OrderStatus, orderType: OrderType): string {
  if (status === "READY") return "آماده تحویل";
  if (status === "PENDING") return "در انتظار تایید";
  if (status === "CONFIRMED") return "تایید شده";
  if (status === "PREPARING") return "در حال آماده‌سازی";
  if (status === "COMPLETED") return "تکمیل شد";
  return "لغو شد";
}

export const ORDER_STATUS_LABELS_FA: Record<OrderStatus, string> = {
  PENDING: "در انتظار تایید",
  CONFIRMED: "تایید شده",
  PREPARING: "در حال آماده‌سازی",
  READY: "آماده تحویل",
  COMPLETED: "تکمیل شد",
  CANCELLED: "لغو شد",
};

/**
 * Action labels for the button-based order workflow (management side).
 * The action moves the order INTO the keyed status.
 */
export const ORDER_ACTION_LABELS_FA: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: "تایید سفارش",
  PREPARING: "شروع آماده‌سازی",
  READY: "آماده تحویل",
  COMPLETED: "تکمیل سفارش",
  CANCELLED: "لغو سفارش",
};

// Allergen status has exactly two states (Rule 1).
export const ALLERGEN_STATUSES = ["CONTAINS", "FREE"] as const;
export type AllergenStatus = (typeof ALLERGEN_STATUSES)[number];

export const ALLERGEN_STATUS_LABELS_FA: Record<AllergenStatus, string> = {
  CONTAINS: "حاوی است",
  FREE: "حاوی نیست",
};

export const UNITS = ["GRAM", "KILOGRAM", "MILLILITER", "LITER", "UNIT"] as const;
export type Unit = (typeof UNITS)[number];

export const UNIT_LABELS_FA: Record<Unit, string> = {
  GRAM: "گرم",
  KILOGRAM: "کیلوگرم",
  MILLILITER: "میلی‌لیتر",
  LITER: "لیتر",
  UNIT: "عدد",
};

export const STAFF_ROLES = ["CHEF", "WAITER", "OTHER"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_ROLE_LABELS_FA: Record<StaffRole, string> = {
  CHEF: "شف",
  WAITER: "گارسون",
  OTHER: "سایر",
};

export const DIETARY_PREFERENCES = [
  "VEGETARIAN",
  "VEGAN",
  "GLUTEN_FREE",
  "DAIRY_FREE",
  "SPICY",
  "SWEET",
  "SAVORY",
] as const;
export type DietaryPreference = (typeof DIETARY_PREFERENCES)[number];

export const DIETARY_LABELS_FA: Record<DietaryPreference, string> = {
  VEGETARIAN: "گیاهخواری",
  VEGAN: "وگان",
  GLUTEN_FREE: "بدون گلوتن",
  DAIRY_FREE: "بدون لبنیات",
  SPICY: "تند",
  SWEET: "شیرین",
  SAVORY: "ملس",
};
