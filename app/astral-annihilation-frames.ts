export const ASTRAL_STAR_ART = {
  normal: { core: "/vfx/astral-annihilation/normal-core-v3.webp", halo: "/vfx/astral-annihilation/normal-halo-v3.webp", tail: "/vfx/astral-annihilation/normal-tail-v3.webp" },
  ascended: { core: "/vfx/astral-annihilation/ascended-core-v3.webp", halo: "/vfx/astral-annihilation/ascended-halo-v3.webp", tail: "/vfx/astral-annihilation/ascended-tail-v3.webp" },
};
export const ASTRAL_ART = { normal: "/vfx/astral-annihilation/normal-hd-1.webp", ascended: "/vfx/astral-annihilation/ascended-hd-1.webp" };
export const ASTRAL_PAGES = {
  normal: [ASTRAL_ART.normal, "/vfx/astral-annihilation/normal-hd-2.webp", "/vfx/astral-annihilation/normal-hd-3.webp"],
  ascended: [ASTRAL_ART.ascended, "/vfx/astral-annihilation/ascended-hd-2.webp", "/vfx/astral-annihilation/ascended-hd-3.webp"],
} as const;
// Frames 6–17 are replaced by the existing independently drawn six stars.
export function astralAtlasIndex(frame: number) {
  const i = Math.max(0, Math.min(35, Math.floor(frame)));
  return i < 18 ? Math.min(i, 5) : i - 12;
}
export function astralPage(frame: number) { return Math.floor(astralAtlasIndex(frame) / 8); }
export function astralSky(elapsed: number, width: number, height: number) {
  return { size: Math.min(width * .88, height * 1.45), y: height * .27, angle: elapsed * .0011 };
}
export const ASTRAL_TIMING = { firstStar: 600, starInterval: 120, fire: 1560, beamImpact: 2040, compress: 2280, blast: 3000, extra: 3160, duration: 4000 };
export type AstralSegment = { hit: boolean; critical: boolean; damagePercent: number; label?: string };
export type AstralVisual = { key: number; ascended: boolean; segments: AstralSegment[] };
export function astralStarsAt(elapsed: number) {
  return Math.max(0, Math.min(6, Math.floor((elapsed - ASTRAL_TIMING.firstStar) / ASTRAL_TIMING.starInterval) + 1));
}
export function astralContact(index: number) { return index < 6 ? ASTRAL_TIMING.beamImpact : index === 6 ? ASTRAL_TIMING.blast : ASTRAL_TIMING.extra; }
export function astralUv(frame: number, width: number, height: number): [number, number, number, number] {
  const i = astralAtlasIndex(frame) % 8, cw = width / 4, ch = height / 2;
  return [(i % 4 * cw + 2) / width, (Math.floor(i / 4) * ch + 2) / height, (cw - 4) / width, (ch - 4) / height];
}
export function astralAmounts(segments: readonly AstralSegment[], total: number) {
  const weights = segments.map(part => part.hit ? Math.max(0, part.damagePercent) : 0);
  const sum = weights.reduce((a, b) => a + b, 0);
  let allocated = 0, cumulative = 0;
  return weights.map(weight => {
    cumulative += weight;
    const next = sum > 0 ? Math.min(total, total * cumulative / sum) : 0;
    const value = next - allocated; allocated = next; return value;
  });
}

// Positions are deliberately irregular; both backends use identical coordinates.
export const ASTRAL_STAR_POSITIONS = [
  [.12, .18, .92], [.36, -.03, 1.18], [.70, .09, .85],
  [.98, .32, .70], [.07, .62, .76], [.46, .39, 1.02],
] as const;
export function astralStarPosition(index: number, elapsed: number, hit: boolean,
  origin: { x: number; y: number }, target: { x: number; y: number }, bend: number) {
  const t = Math.max(0, Math.min(1.3, (elapsed - ASTRAL_TIMING.fire) / (ASTRAL_TIMING.beamImpact - ASTRAL_TIMING.fire)));
  const progress = t * t;
  const end = hit ? target : { x: target.x + bend * .35, y: target.y + Math.abs(bend) * .8 };
  return { x: origin.x + (end.x - origin.x) * progress + Math.sin(Math.min(1,t)*Math.PI) * bend,
    y: origin.y + (end.y - origin.y) * progress - Math.sin(Math.min(1,t)*Math.PI) * Math.abs(bend) * .45 };
}

// HD frames are registered to one fixed nucleus/orbit center.
export const ASTRAL_CORE_ANCHORS = {
  normal: Array.from({ length: 18 }, () => [.5, .5] as const),
  ascended: Array.from({ length: 18 }, () => [.5, .5] as const),
};
