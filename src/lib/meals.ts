/** Helpers for the weighted meal-points system. */

export interface MealWeights {
  breakfast: number;
  lunch: number;
  dinner: number;
}

export const DEFAULT_WEIGHTS: MealWeights = { breakfast: 1, lunch: 1, dinner: 1 };

export interface MealCounts {
  breakfast: number;
  lunch: number;
  dinner: number;
}

/** Total points for a single day or aggregated counts, given the group's weights. */
export function pointsFor(counts: MealCounts, w: MealWeights = DEFAULT_WEIGHTS): number {
  const b = Math.max(0, Number(counts.breakfast) || 0);
  const l = Math.max(0, Number(counts.lunch) || 0);
  const d = Math.max(0, Number(counts.dinner) || 0);
  const bw = Math.max(0, Number(w.breakfast) || 0);
  const lw = Math.max(0, Number(w.lunch) || 0);
  const dw = Math.max(0, Number(w.dinner) || 0);
  const total = b * bw + l * lw + d * dw;
  return Number.isFinite(total) ? total : 0;
}

/** Format points value: integer when clean, otherwise up to 2 decimals. */
export function formatPoints(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
  return n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * Largest-remainder split of `amount` proportional to `points`, rounded to cents
 * so the parts sum exactly to the original amount. Returns 0s when total is 0.
 */
export function splitByPoints(amount: number, points: number[]): number[] {
  const total = points.reduce((s, n) => s + (n > 0 ? n : 0), 0);
  if (!(amount > 0) || total <= 0) return points.map(() => 0);
  const totalCents = Math.round(amount * 100);
  const raw = points.map((p) => ((p > 0 ? p : 0) / total) * totalCents);
  const floors = raw.map((v) => Math.floor(v));
  let remainder = totalCents - floors.reduce((s, n) => s + n, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainder; k++) floors[order[k].i]++;
  return floors.map((c) => c / 100);
}
