export const LIGHTNING_ART = { main: "/vfx/lightning-chain/main.webp", ascended: "/vfx/lightning-chain/ascended.webp" };
export const LIGHTNING_CONTACTS = [200, 350, 500, 800] as const;
export type LightningSegment = { hit: boolean; critical: boolean; damagePercent: number };
export type LightningVisual = { key: number; segments: LightningSegment[]; ascended: boolean };
export function lightningDuration(effect: LightningVisual) { return effect.segments.length > 3 ? 1100 : 650; }
export function lightningUv(frame: number, width: number, height: number): [number, number, number, number] {
  const cw = width / 4, ch = height / 4;
  return [((frame % 4) * cw + 2) / width, (Math.floor(frame / 4) * ch + 2) / height, (cw - 4) / width, (ch - 4) / height];
}
// Split an already settled total; never calculate damage or change combat HP here.
export function lightningAmounts(segments: readonly LightningSegment[], total: number) {
  const weights = segments.map(segment => segment.hit ? Math.max(0, segment.damagePercent) : 0);
  const sum = weights.reduce((value, weight) => value + weight, 0);
  const amounts = weights.map(weight => sum > 0 ? Math.floor(total * weight / sum) : 0);
  let remainder = sum > 0 ? total - amounts.reduce((value, amount) => value + amount, 0) : 0;
  for (let index = 0; remainder > 0; index = (index + 1) % amounts.length)
    if (weights[index] > 0) { amounts[index]++; remainder--; }
  return amounts;
}
