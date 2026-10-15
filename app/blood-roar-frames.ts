export const BLOOD_ROAR_DURATION = 1440;
export function bloodRoarFrame(elapsed: number, aura = false, reduced = false) {
  if (reduced) return aura ? 14 : 9;
  return aura ? 12 + Math.floor(Math.max(0, elapsed) / 100) % 6
    : Math.min(23, Math.floor(Math.max(0, elapsed) / 60));
}
export function bloodRoarUv(frame: number): [number, number, number, number] {
  // Half-pixel inset on 256px cells prevents adjacent-frame filtering.
  return [(frame % 6 + 0.5 / 256) / 6, (Math.floor(frame / 6) + 0.5 / 256) / 4,
    (1 - 1 / 256) / 6, (1 - 1 / 256) / 4];
}
