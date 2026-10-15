export const MANA_SHIELD_ART = "/vfx/mana-shield/frames.webp";
export type ManaShieldVisual = {
  target: string; value: number; ascended: boolean;
  formedAt: number; hitAt: number; stackedAt: number; brokenAt: number; resetAt: number;
};
export const emptyManaShieldVisual = (): ManaShieldVisual => ({
  target: "", value: 0, ascended: false, formedAt: 0, hitAt: 0, stackedAt: 0, brokenAt: 0, resetAt: 0,
});
export type ManaShieldEvent = { activated: boolean; absorbed: boolean; broke: boolean; stacked: boolean };
// Presentation only. A target change fades the old shell instead of simulating a break.
export function updateManaShieldVisual(previous: ManaShieldVisual, target: string, value: number,
  ascended: boolean, now: number, event?: ManaShieldEvent): ManaShieldVisual {
  const changedTarget = previous.target !== target;
  const next = changedTarget ? { ...emptyManaShieldVisual(), target,
    resetAt: previous.value > 0 && value <= 0 ? now : 0 } : { ...previous };
  if (changedTarget && previous.value > 0 && value > 0) next.formedAt = previous.formedAt;
  next.value = Math.max(0, value); next.ascended = ascended;
  if (event?.activated || (value > 0 && previous.value <= 0)) next.formedAt = now;
  if (event?.absorbed) next.hitAt = now;
  if (event?.stacked || (!changedTarget && previous.value > 0 && value > previous.value)) next.stackedAt = now;
  if (event?.broke) next.brokenAt = now;
  if (!event && !changedTarget && previous.value > 0 && value <= 0) next.resetAt = now;
  return next;
}
export function manaShieldUv(frame: number): [number, number, number, number] {
  const index = Math.max(0, Math.min(23, Math.floor(frame)));
  return [(index % 6 + 2 / 256) / 6, (Math.floor(index / 6) + 2 / 256) / 4,
    (1 - 4 / 256) / 6, (1 - 4 / 256) / 4];
}
