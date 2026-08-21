import type { CandidateOffer } from "./supplier-search";
import { POLICY } from "@/lib/domain";
import { formatMoney } from "@/lib/format";

// Deterministic multi-factor supplier evaluation.
// Score = weighted price (0-40) + delivery fit (0-25) + reliability (0-20)
//         − risk penalty (up to 15). Fully explainable by design.

export type EvaluatedOffer = CandidateOffer & {
  totalPrice: number;
  fitsDeadline: boolean;
  withinBudget: boolean;
  score: number;
  breakdown: { price: number; delivery: number; reliability: number; risk: number };
  reasons: string[];
  flags: string[];
};

export function evaluateOffers(
  offers: CandidateOffer[],
  opts: { quantity: number; budget?: number | null; neededBy: Date | null }
): EvaluatedOffer[] {
  const prices = offers.map((o) => o.unitPrice);
  const avgPrice = prices.reduce((a, b) => a + b, 0) / Math.max(prices.length, 1);
  const minLead = Math.min(...offers.map((o) => o.leadTimeDays));
  const deadlineDays = opts.neededBy
    ? Math.max(Math.ceil((opts.neededBy.getTime() - Date.now()) / 86400000), 1)
    : null;

  return offers
    .map((o) => {
      const totalPrice = round2(o.unitPrice * opts.quantity);
      const fitsDeadline =
        deadlineDays === null ? true : o.leadTimeDays <= deadlineDays;

      // Price: cheapest gets full 40, scaled linearly against the spread.
      const spread = Math.max(avgPrice - Math.min(...prices), 0.0001);
      const priceNorm = 40 * clamp01(1 - (o.unitPrice - Math.min(...prices)) / (spread * 2));

      // Delivery: full 25 if it fits deadline and is fast; decays with slowness/misses.
      let delivery = 25;
      if (!fitsDeadline) delivery -= 18;
      if (deadlineDays !== null && o.leadTimeDays > deadlineDays * 0.7) delivery -= 4;
      if (o.leadTimeDays > minLead) delivery -= Math.min((o.leadTimeDays - minLead) * 0.6, 5);

      // Reliability (0-20).
      const reliability = 20 * clamp01(o.reliabilityScore / 100);

      // Risk penalty (0-15).
      const riskPenalty = o.riskLevel === "low" ? 0 : o.riskLevel === "medium" ? 6 : 14;

      const score = round1(
        priceNorm + Math.max(delivery, 0) + reliability - riskPenalty
      );

      const withinBudget =
        opts.budget == null ? true : totalPrice <= opts.budget;

      const reasons: string[] = [];
      const flags: string[] = [];
      const devPct = ((avgPrice - o.unitPrice) / avgPrice) * 100;
      if (devPct > 0.5) reasons.push(`${devPct.toFixed(1)}% below category average (${formatMoney(avgPrice, { compact: true })})`);
      else if (devPct < -0.5) flags.push(`Priced ${(-devPct).toFixed(1)}% above category average`);
      reasons.push(`${o.onTimeRate.toFixed(0)}% on-time delivery rate`);
      if (fitsDeadline && deadlineDays !== null)
        reasons.push(`${o.leadTimeDays}-day lead time vs ${deadlineDays}-day window`);
      if (o.price30dAgo != null) {
        const drift = ((o.unitPrice - o.price30dAgo) / o.price30dAgo) * 100;
        if (Math.abs(drift) >= 3)
          reasons.push(`Price ${drift > 0 ? "up" : "down"} ${Math.abs(drift).toFixed(1)}% vs previous quarter`);
      }
      if (o.riskLevel === "high") flags.push("High operational risk");
      if (o.riskLevel === "medium") flags.push("Medium operational risk");
      if (POLICY.unusualPriceDeviationPct > 0 && devPct < -POLICY.unusualPriceDeviationPct)
        flags.push(`Unusually low price — verify specifications`);
      if (!withinBudget) flags.push("Exceeds stated budget");

      return {
        ...o,
        totalPrice,
        fitsDeadline,
        withinBudget,
        score,
        breakdown: { price: round1(priceNorm), delivery: round1(Math.max(delivery, 0)), reliability: round1(reliability), risk: -riskPenalty },
        reasons,
        flags,
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function pickRecommendation(evals: EvaluatedOffer[]) {
  // Prefer in-budget, deadline-fitting offers with no hard flags; fall back to
  // best score regardless so FARMAN always surfaces a viable path forward.
  const eligible = evals.filter((e) => e.withinBudget);
  return eligible[0] ?? evals[0] ?? null;
}

export function approvalRequirements(
  rec: EvaluatedOffer,
  all: EvaluatedOffer[]
): { type: string; description: string }[] {
  const reqs: { type: string; description: string }[] = [];
  if (rec.totalPrice >= POLICY.autoApproveLimit)
    reqs.push({
      type: "high_value",
      description: `Order value ${formatMoney(rec.totalPrice, { compact: true })} exceeds the ${formatMoney(POLICY.autoApproveLimit, { compact: true })} autonomous-execution limit`,
    });
  if (rec.totalOrders === 0 && POLICY.newSupplierRequiresApproval)
    reqs.push({ type: "new_supplier", description: `${rec.supplierName} has no completed orders with your company yet` });
  if (rec.reliabilityScore < POLICY.highRiskReliabilityBelow)
    reqs.push({ type: "high_risk", description: `Reliability ${rec.reliabilityScore.toFixed(0)}% is below the ${POLICY.highRiskReliabilityBelow}% threshold` });
  const avg = all.reduce((a, b) => a + b.unitPrice, 0) / Math.max(all.length, 1);
  if (((avg - rec.unitPrice) / avg) * 100 < -POLICY.unusualPriceDeviationPct)
    reqs.push({ type: "unusual_price", description: "Selected offer deviates unusually from market average — human confirmation required" });
  return reqs;
}

function clamp01(v: number) {
  return Math.min(Math.max(v, 0), 1);
}
function round1(n: number) { return Math.round(n * 10) / 10; }
function round2(n: number) { return Math.round(n * 100) / 100; }
