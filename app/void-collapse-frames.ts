export const VOID_ART = "/vfx/void-collapse/frames.webp";
export const VOID_ASCENDED_ART = "/vfx/void-collapse/ascended-hd-1.webp";
export const VOID_ASCENDED_PAGES = [VOID_ASCENDED_ART,
  "/vfx/void-collapse/ascended-hd-2.webp", "/vfx/void-collapse/ascended-hd-3.webp"] as const;
export const VOID_TIMING = { impact: 720, duration: 1560 };
export type VoidVisual = { key: number; hit: boolean; ascended: boolean };
export function voidFrame(elapsed: number) {
  if (elapsed < 360) return Math.max(0, Math.min(5, Math.floor(elapsed / 60)));
  if (elapsed < 720) return 6 + Math.min(5, Math.floor((elapsed - 360) / 60));
  if (elapsed < 960) return 12 + Math.min(5, Math.floor((elapsed - 720) / 40));
  return 18 + Math.min(5, Math.floor((elapsed - 960) / 100));
}
export function voidUv(frame: number, width: number, height: number, ascended = false): [number, number, number, number] {
  const bounded = Math.max(0, Math.min(ascended ? 35 : 23, Math.floor(frame)));
  const i = ascended ? bounded % 12 : bounded, columns = ascended ? 4 : 6;
  const cw = width / columns, ch = height / (ascended ? 3 : 4);
  return [(i % columns * cw + 2) / width, (Math.floor(i / columns) * ch + 2) / height, (cw - 4) / width, (ch - 4) / height];
}
export function voidGeometry(enemy: DOMRect, canvas: DOMRect, width: number, height: number) {
  const sx = width / Math.max(1, canvas.width), sy = height / Math.max(1, canvas.height);
  return { x: (enemy.left - canvas.left + enemy.width * .5) * sx,
    y: (enemy.top - canvas.top + enemy.height * .52) * sy,
    size: enemy.width * sx * 3.2 };
}

export function voidAscendedFrame(elapsed: number) {
  if (elapsed < 720) return Math.max(0, Math.min(17, Math.floor(elapsed / 40)));
  if (elapsed < 960) return 18 + Math.min(5, Math.floor((elapsed - 720) / 40));
  if (elapsed < 1260) return 24 + Math.min(5, Math.floor((elapsed - 960) / 50));
  return 30 + Math.min(5, Math.floor((elapsed - 1260) / 50));
}
// The production atlas uses one centered anchor throughout all 36 cells.
export const VOID_ASCENDED_ANCHORS: readonly (readonly [number, number])[] =
  Array.from({ length: 36 }, () => [.5, .5] as const);
