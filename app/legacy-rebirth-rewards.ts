export const LEGACY_REBIRTH_RESET_VERSION = "2026-09-account-reset-v1";

export const LEGACY_REBIRTH_TIERS = [
  { tier: 1, minimum: 1, titleId: "beta-reincarnator", title: "封測轉生者", experience: 10, gold: 10, attack: 5, defense: 5, attackSpeed: 0, resourceDrop: 0 },
  { tier: 2, minimum: 3, titleId: "seasoned-reincarnator", title: "資深輪迴者", experience: 15, gold: 15, attack: 5, defense: 5, attackSpeed: 0, resourceDrop: 5 },
  { tier: 3, minimum: 5, titleId: "elite-reincarnator", title: "菁英輪迴者", experience: 20, gold: 20, attack: 10, defense: 10, attackSpeed: 0, resourceDrop: 10 },
  { tier: 4, minimum: 10, titleId: "abyss-reincarnator", title: "深淵輪迴者", experience: 30, gold: 30, attack: 10, defense: 10, attackSpeed: 12, resourceDrop: 10 },
] as const;

export function legacyRebirthTier(count: number) {
  if (!Number.isInteger(count) || count < 1) return 0;
  return [...LEGACY_REBIRTH_TIERS].reverse().find((tier) => count >= tier.minimum)?.tier ?? 0;
}

export function legacyRebirthReward(count: number) {
  const normalizedCount = Number.isSafeInteger(count) && count >= 0 ? count : 0;
  const tier = legacyRebirthTier(normalizedCount);
  const selected = LEGACY_REBIRTH_TIERS.find((entry) => entry.tier === tier);
  return {
    count: normalizedCount,
    tier,
    titleId: selected?.titleId ?? null,
    title: selected?.title ?? null,
    // Each account owns only its highest qualified legacy title.
    unlockedTitleIds: selected ? [selected.titleId] : [],
    experience: selected?.experience ?? 0,
    gold: selected?.gold ?? 0,
    attack: selected?.attack ?? 0,
    defense: selected?.defense ?? 0,
    attackSpeed: selected?.attackSpeed ?? 0,
    resourceDrop: selected?.resourceDrop ?? 0,
  };
}

export function equippedLegacyRebirthReward(count: number, equippedTitleId: string) {
  const reward = legacyRebirthReward(count);
  if (reward.titleId === equippedTitleId) return reward;
  return {
    ...reward,
    experience: 0,
    gold: 0,
    attack: 0,
    defense: 0,
    attackSpeed: 0,
    resourceDrop: 0,
  };
}
