export const OVERLOAD_ART = "/vfx/arcane-overload/frames.webp";
export type OverloadSnapshot = { owner: string; enabled: boolean; phase: "idle" | "overloaded" | "exhausted";
  charge: number; remaining: number; stability: number; ascended: boolean; expiresAt: number };
export type OverloadVisual = OverloadSnapshot & { activatedAt: number; consumedAt: number; consumedSlot: number; exhaustedAt: number; clearedAt: number };
export const emptyOverloadVisual = (): OverloadVisual => ({ owner: "", enabled: false, phase: "idle", charge: 0,
  remaining: 0, stability: 0, ascended: false, expiresAt: 0, activatedAt: 0, consumedAt: 0, consumedSlot: 0, exhaustedAt: 0, clearedAt: 0 });
// Read actual combat state only. Target changes do not restart this player buff.
export function updateOverloadVisual(previous: OverloadVisual, snapshot: OverloadSnapshot, now: number): OverloadVisual {
  if (!snapshot.enabled) return previous.enabled ? emptyOverloadVisual() : previous;
  const sameOwner = previous.owner === snapshot.owner;
  const old = sameOwner ? previous : emptyOverloadVisual();
  const phase = snapshot.phase === "exhausted" && snapshot.expiresAt > 0 && now >= snapshot.expiresAt ? "idle" : snapshot.phase;
  const next = { ...old, ...snapshot, phase, charge: phase === "idle" ? Math.max(0, Math.min(3, snapshot.charge)) : 0,
    remaining: phase === "overloaded" ? Math.max(0, Math.min(3, snapshot.remaining)) : 0,
    stability: phase === "exhausted" ? old.stability : Math.max(0, Math.min(6, snapshot.stability)) };
  if (phase === "overloaded" && old.phase !== "overloaded") { next.activatedAt = now; next.clearedAt = 0; }
  if (old.phase === "overloaded" && next.remaining < old.remaining) { next.consumedAt = now; next.consumedSlot = Math.max(0, old.remaining - 1); }
  if (phase === "exhausted" && old.phase !== "exhausted") next.exhaustedAt = now;
  if (phase === "idle" && old.phase !== "idle") next.clearedAt = now;
  return Object.keys(next).every(key => next[key as keyof OverloadVisual] === previous[key as keyof OverloadVisual]) ? previous : next;
}
// Generated sheet: four six-cell flame rows, then three exhaustion cells and four narrower glyph cells.
export function overloadUv(frame: number): [number, number, number, number] {
  const i = Math.max(0, Math.min(30, Math.floor(frame))), px = 2 / 1536, py = 2 / 1024;
  if (i >= 27) return [.5 + (i - 27) / 8 + px, .8 + py, 1 / 8 - 2 * px, .2 - 2 * py];
  return [i % 6 / 6 + px, Math.floor(i / 6) * .2 + py, 1 / 6 - 2 * px, .2 - 2 * py];
}
export function overloadGeometry(player: { left: number; top: number; width: number; height: number },
  canvas: { left: number; top: number; width: number; height: number }, width: number, height: number) {
  const sx = width / Math.max(1, canvas.width), sy = height / Math.max(1, canvas.height);
  const pw = player.width * sx, ph = player.height * sy;
  return { x: (player.left - canvas.left + player.width / 2) * sx,
    y: (player.top - canvas.top + player.height / 2) * sy, pw, ph, w: pw * 2.4, h: ph * 1.1 };
}
