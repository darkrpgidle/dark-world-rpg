export const SKY_RAIN_IMPACTS_MS = [1320, 1420, 1520, 1620, 1720, 1820, 1920, 2020, 2440] as const;
export const SKY_RAIN_DURATION_MS = 2920;
export type SkyArrow = { hit: boolean; critical: boolean; damagePercent?: number };
export function skyMarksAt(arrows: readonly SkyArrow[], elapsed: number, ascended: boolean) {
  return ascended ? arrows.slice(0, 8).filter((arrow, index) =>
    arrow.hit && arrow.critical && elapsed >= SKY_RAIN_IMPACTS_MS[index]).length : 0;
}
// Allocate an already settled, potentially overkill-clamped HP amount. Never settle HP here.
export function skyRainDisplayAmounts(total: number, arrows: readonly SkyArrow[], additionalWeight = 0) {
  const weights = [...arrows.map((arrow) => arrow.hit ? Math.max(0, arrow.damagePercent ?? 0) : 0), Math.max(0, additionalWeight)];
  const sum = weights.reduce((a, b) => a + b, 0);
  const amounts = weights.map((weight) => sum ? Math.floor(Math.max(0, total) * weight / sum) : 0);
  let remainder = sum ? Math.max(0, total) - amounts.reduce((a, b) => a + b, 0) : 0;
  for (let index = 0; remainder > 0; index = (index + 1) % weights.length) {
    if (weights[index] > 0) { amounts[index]++; remainder--; }
  }
  return amounts;
}
