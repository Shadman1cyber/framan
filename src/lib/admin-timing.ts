/**
 * Shared admin/dashboard timing intervals (milliseconds).
 * Centralized so they stay consistent across components and are testable.
 */

/** Cashier order board refresh (spec: 10 seconds). */
export const ORDERS_REFRESH_MS = 10_000;

/** Cashier "order waiting" reminder cadence (spec: 2 minutes). */
export const CASHIER_REMINDER_MS = 120_000;

/** Sales-flow in-place dashboard auto-refresh. */
export const SALES_FLOW_REFRESH_MS = 30_000;

/** Leave request header status poll. */
export const LEAVE_HEADER_REFRESH_MS = 30_000;
