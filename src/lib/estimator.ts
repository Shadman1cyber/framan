/**
 * OrderPreparationEstimator — practical v1 estimation engine.
 *
 * Considers: active chefs, staff on shift, active order queue, order complexity
 * (item count, product base prep time, ingredient count), and overall workload
 * to produce a realistic minute range rather than a fake exact number.
 *
 * The interface is intentionally provider-agnostic so a smarter (AI/ML)
 * implementation can replace `estimate` later without touching callers.
 */

export type EstimatorInput = {
  /** Resolved cart lines with product prep base minutes. */
  items: Array<{ quantity: number; prepBaseMin: number; ingredientCount: number }>;
  /** Number of active kitchen orders (PENDING/CONFIRMED/PREPARING). */
  activeOrders: number;
  /** Total quantity across the queue (rough workload proxy). */
  activeItems: number;
  /** Number of active chefs. */
  chefs: number;
  /** Number of other active staff (waiters etc.). */
  staff: number;
};

export type EstimatorFactors = {
  chefs: number;
  staff: number;
  activeOrders: number;
  activeItems: number;
  itemComplexity: number;
  queueComplexity: number;
};

export type PreparationEstimate = {
  minMinutes: number;
  maxMinutes: number;
  factors: EstimatorFactors;
  engine: string;
};

export const MIN_ESTIMATE = 4;
export const MAX_ESTIMATE_CAP = 90;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export class OrderPreparationEstimator {
  /**
   * Core v1 heuristic:
   *  - base = item complexity (sum of prepBaseMin * qty, weighted by ingredients)
   *  - capacity = chefs (waiters add a small throughput bonus)
   *  - queue load = active items / capacity -> waiting minutes before we start
   */
  estimate(input: EstimatorInput): PreparationEstimate {
    const { items, activeOrders, activeItems, chefs, staff } = input;

    const safeChefs = Math.max(1, chefs);
    const effectiveChefs = safeChefs + staff * 0.25;

    // Own order complexity: prep time of each item scaled by ingredient richness.
    const itemComplexity = items.reduce((s, i) => {
      const richness = 1 + Math.min(0.5, i.ingredientCount * 0.06);
      return s + i.prepBaseMin * i.quantity * richness;
    }, 0);

    // Queue complexity: average item prep cost of in-flight orders.
    const avgItemCost = activeItems > 0 ? Math.max(2, itemComplexity / Math.max(1, ownCount(items))) : 2.5;
    const queueComplexity = (activeItems * avgItemCost) / effectiveChefs;

    const ownMinutes = itemComplexity / effectiveChefs;
    const queueMinutes = queueComplexity * 0.55;

    const rawMin = ownMinutes + queueMinutes;
    const minMinutes = clamp(Math.round(rawMin), MIN_ESTIMATE, MAX_ESTIMATE_CAP);
    const maxMinutes = clamp(Math.round(rawMin * 1.4 + 3), minMinutes + 3, MAX_ESTIMATE_CAP);

    return {
      minMinutes,
      maxMinutes,
      factors: {
        chefs: safeChefs,
        staff,
        activeOrders,
        activeItems,
        itemComplexity: Math.round(itemComplexity * 10) / 10,
        queueComplexity: Math.round(queueComplexity * 10) / 10,
      },
      engine: "heuristic-v1",
    };
  }
}

function ownCount(items: Array<{ quantity: number }>): number {
  return items.reduce((s, i) => s + i.quantity, 0);
}

export const orderPreparationEstimator = new OrderPreparationEstimator();
