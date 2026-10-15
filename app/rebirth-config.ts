export const MAX_REBIRTHS = 5;

export const REBIRTH_REWARD_PER_TURN = {
  talentPoints: 3,
  coreStats: 5,
  experience: 10,
  gold: 15,
  resourceDrop: 10,
  equipmentDrop: 5,
  highQualityDrop: 3,
} as const;

export function clampRebirthCount(value: unknown): number {
  const count = Math.floor(Number(value));
  return Number.isFinite(count) ? Math.max(0, Math.min(MAX_REBIRTHS, count)) : 0;
}
