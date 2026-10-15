export const METEOR_ART = { main: "/vfx/meteor-strike/main.webp", ascended: "/vfx/meteor-strike/ascended-v2.webp", ascendedMain: "/vfx/meteor-strike/ascended-main-v2.webp" };
export const METEOR_TIMING = { charge: 240, flight: 140, impact: 380, dissolve: 680,
  duration: 1040, burstStart: 460, burstImpact: 660, burstDissolve: 860, burstDuration: 1100 };
export type MeteorSegment = { hit: boolean; critical: boolean; damagePercent: number };
export type MeteorVisual = { key: number; hit: boolean; ascended?: boolean; afterburst: MeteorSegment | null };
export function meteorFrame(elapsed: number) {
  if (elapsed < METEOR_TIMING.charge) return Math.min(4, Math.floor(elapsed / 48));
  if (elapsed < METEOR_TIMING.impact) return 5 + Math.min(6, Math.floor((elapsed - 240) / 20));
  if (elapsed < METEOR_TIMING.dissolve) return 12 + Math.min(5, Math.floor((elapsed - 380) / 50));
  return 18 + Math.min(5, Math.floor((elapsed - 680) / 60));
}
export function meteorBurstFrame(elapsed: number) {
  if (elapsed < METEOR_TIMING.burstImpact) return Math.min(3, Math.floor((elapsed - 460) / 50));
  if (elapsed < METEOR_TIMING.burstDissolve) return 4 + Math.min(3, Math.floor((elapsed - 660) / 50));
  return 8 + Math.min(3, Math.floor((elapsed - 860) / 60));
}
export function meteorUv(frame: number, width: number, height: number, ascended = false): [number, number, number, number] {
  const columns = ascended ? 4 : 6, rows = ascended ? 3 : 4;
  const i = Math.max(0, Math.min(columns * rows - 1, Math.floor(frame)));
  const cw = width / columns, ch = height / rows;
  return [(i % columns * cw + 2) / width, (Math.floor(i / columns) * ch + 2) / height,
    (cw - 4) / width, (ch - 4) / height];
}
// The painted projectile points down-left and its rock core is off-center.
export function meteorFlight(from: { x: number; y: number }, to: { x: number; y: number }, elapsed: number) {
  const t = Math.max(0, Math.min(1.35, (elapsed - METEOR_TIMING.charge) / METEOR_TIMING.flight));
  return { x: from.x + (to.x - from.x) * t ** 2,
    y: from.y + (to.y - from.y) * t ** 2, angle: Math.atan2(to.y - from.y, to.x - from.x) - Math.PI * .75 };
}
// Only split already-settled integer damage; never roll or apply damage here.
export function meteorAmounts(total: number, totalPercent: number, afterburst: MeteorSegment | null) {
  const extra = afterburst?.hit && totalPercent > 0
    ? Math.min(total, Math.max(0, Math.round(total * afterburst.damagePercent / totalPercent))) : 0;
  return [total - extra, extra] as const;
}

// Measured painted ignition anchors keep every phase on the same live contact point.
export const HEAVEN_MAIN_ANCHORS = [[0.5, 0.56], [0.5, 0.56], [0.5, 0.56], [0.5, 0.56], [0.5, 0.56], [0.5, 0.56], [0.291, 0.7385], [0.2865, 0.7346], [0.2742, 0.734], [0.2716, 0.7338], [0.2696, 0.7424], [0.2675, 0.7414], [0.5024, 0.8099], [0.5049, 0.8072], [0.5083, 0.813], [0.5042, 0.8193], [0.5045, 0.8065], [0.5019, 0.8041], [0.5017, 0.7901], [0.5049, 0.8014], [0.5093, 0.8019], [0.5037, 0.8062], [0.5088, 0.8117], [0.5135, 0.8161]] as const;
export const HEAVEN_BURST_ANCHORS = [[0.5002, 0.556], [0.5144, 0.5403], [0.4925, 0.5371], [0.502, 0.5558], [0.5052, 0.5019], [0.5044, 0.5103], [0.497, 0.5179], [0.4984, 0.5224], [0.4884, 0.4733], [0.5181, 0.4766], [0.5015, 0.4699], [0.5105, 0.4669]] as const;
export function heavenMeteorFrame(elapsed: number) {
  if (elapsed < METEOR_TIMING.charge) return Math.min(5, Math.floor(elapsed / 40));
  if (elapsed < METEOR_TIMING.impact) return 6 + Math.min(5, Math.floor((elapsed - 240) / (140 / 6)));
  return meteorFrame(elapsed);
}
