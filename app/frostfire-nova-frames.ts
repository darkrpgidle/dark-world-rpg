export const FROSTFIRE_ART = { main: "/vfx/frostfire-nova-v2/main.webp", states: "/vfx/frostfire-nova-v2/states.webp" };
export const FROSTFIRE_TIMING = { charge: 280, rise: 520, hold: 220, fall: 220, flight: 960, impact: 1240, duration: 1560, burstImpact: 80, burstDuration: 360, shatterImpact: 100, shatterDuration: 400 };
export type FrostfireVisual = { key: number; kind: "main" | "afterburst" | "shatter"; hit: boolean;
  status?: { kind: "burn" | "freeze"; expiresAt: number };
  afterburst?: { key: number; hit: boolean } };
export type FrostfireStatusVisual = { burn?: number; freeze?: number };

export function frostfireFrame(kind: FrostfireVisual["kind"], elapsed: number) {
  if (kind === "afterburst") return 8 + Math.min(3, Math.floor(elapsed / 90));
  if (kind === "shatter") return 12 + Math.min(3, Math.floor(elapsed / 100));
  if (elapsed < FROSTFIRE_TIMING.charge) return Math.min(3, Math.floor(elapsed / (FROSTFIRE_TIMING.charge / 4)));
  if (elapsed < FROSTFIRE_TIMING.impact) return 4 + Math.floor((elapsed - FROSTFIRE_TIMING.charge) / 90) % 4;
  return 8 + Math.min(7, Math.floor((elapsed - FROSTFIRE_TIMING.impact) / 40));
}

// Rise eases to a stop at the arc midpoint, then the descent accelerates.
export function frostfireFlightProgress(elapsed: number) {
  const age = Math.max(0, elapsed - FROSTFIRE_TIMING.charge);
  if (age < FROSTFIRE_TIMING.rise) {
    const t = age / FROSTFIRE_TIMING.rise;
    return .5 * (1 - (1 - t) ** 2);
  }
  if (age < FROSTFIRE_TIMING.rise + FROSTFIRE_TIMING.hold) return .5;
  const t = (age - FROSTFIRE_TIMING.rise - FROSTFIRE_TIMING.hold) / FROSTFIRE_TIMING.fall;
  return .5 + .5 * t ** 2;
}

export function frostfireArc(from: { x: number; y: number }, to: { x: number; y: number }, height: number, progress: number) {
  const t = Math.max(0, Math.min(1.2, progress));
  return { x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t - 4 * height * t * (1 - t),
    angle: Math.atan2(to.y - from.y - 4 * height * (1 - 2 * t), to.x - from.x) };
}

// All atlas cells are square, with a two-pixel gutter to prevent texture bleed.
export function frostfireUv(frame: number, width: number, height: number): [number, number, number, number] {
  const cw = width / 4, ch = height / 4;
  return [((frame % 4) * cw + 2) / width, (Math.floor(frame / 4) * ch + 2) / height, (cw - 4) / width, (ch - 4) / height];
}
