export const ELEMENT_SIGIL_ART = "/vfx/element-sigil/frames-v3.webp";
export type SigilElement = "burn" | "freeze" | "paralysis";
export type ElementSigilVisual = {
  target: string; expiresAt: number; ascended: boolean; firstAnomalyUsed: boolean;
  castAt: number; castHit: boolean; attachedAt: number; chaosAt: number;
  pulses: Partial<Record<SigilElement, number>>;
};
export const emptyElementSigilVisual = (): ElementSigilVisual => ({
  target: "", expiresAt: 0, ascended: false, firstAnomalyUsed: false,
  castAt: 0, castHit: false, attachedAt: 0, chaosAt: 0, pulses: {},
});
export type ElementSigilSnapshot = { target: string; expiresAt: number; ascended: boolean; firstAnomalyUsed: boolean };
export type ElementSigilAction = { name: string | null; hit: boolean; statuses: readonly string[] };
export function updateElementSigilVisual(previous: ElementSigilVisual, snapshot: ElementSigilSnapshot,
  now: number, action?: ElementSigilAction): ElementSigilVisual {
  const sameTarget = previous.target === snapshot.target;
  const next = { ...(sameTarget ? previous : emptyElementSigilVisual()), ...snapshot,
    pulses: { ...(sameTarget ? previous.pulses : {}) } };
  if (sameTarget && !snapshot.expiresAt && previous.expiresAt <= now) next.expiresAt = previous.expiresAt;
  if (action?.name === "元素蝕印") {
    next.castAt = now; next.castHit = action.hit;
    if (action.hit && action.statuses.includes("elementSigil")) next.attachedAt = now + 300;
  } else if (snapshot.expiresAt > now && (!sameTarget || previous.expiresAt <= now)) next.attachedAt = now;
  if (action && snapshot.expiresAt > now) {
    // Keep secondary feedback behind the dedicated skill's contact animation.
    const contactDelay = action.name === "霜火新星" ? 1240 : action.name === "閃電鏈" ? 500 : action.name === "隕星術" ? 380 : 0;
    for (const kind of ["burn", "freeze", "paralysis"] as const)
      if (action.statuses.includes(kind)) next.pulses[kind] = now + contactDelay;
    if (snapshot.firstAnomalyUsed && (!sameTarget || !previous.firstAnomalyUsed)) next.chaosAt = now + contactDelay;
  }
  return next;
}
export function elementSigilUv(frame: number): [number, number, number, number] {
  const i = Math.max(0, Math.min(23, Math.floor(frame)));
  return [(i % 6 + 2 / 256) / 6, (Math.floor(i / 6) + 2 / 256) / 4,
    (1 - 4 / 256) / 6, (1 - 4 / 256) / 4];
}
