export const ROLES = {
  CUSTOMER: "CUSTOMER",
  ADMIN: "ADMIN",
  STAFF: "STAFF",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ORDER_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "COMPLETED",
  "CANCELLED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS_FA: Record<OrderStatus, string> = {
  PENDING: "در انتظار تایید",
  CONFIRMED: "تایید شده",
  PREPARING: "در حال آماده‌سوی",
  READY: "آماده تحویل",
  COMPLETED: "تحویل شد",
  CANCELLED: "لغو شد",
};

export const ALLERGEN_STATUSES = ["CONTAINS", "MAY_CONTAIN", "UNKNOWN"] as const;
export type AllergenStatus = (typeof ALLERGEN_STATUSES)[number];

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