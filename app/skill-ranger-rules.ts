// Ranger skill rework: Lv1–5 values and isolated wind-domain action buffs.
// Damage segments and other active/passive effects join the event adapter later.
export const RANGER_ACTIVE_RULES = {
  穿雲箭: { category: "basic", damage: [150, 160, 170, 185, 200], ignoreDefense: [20, 24, 28, 32, 35], ascension: "破界穿心", nextSkillIgnoreDefense: 15 },
  追風箭: { category: "basic", damage: [120, 130, 140, 150, 165], chargeReductionChance: [10, 13, 16, 19, 22], ascension: "風痕追獵", ascendedArrowDamage: 60 },
  幻影步: { category: "defense", healthBelow: 55, enemyAttacksRequired: 5, dodgeBonus: [10, 13, 16, 19, 22], nextCritChance: [10, 15, 20, 25, 30], ascension: "無痕幻身", nextSkillCritDamage: 35 },
  獵殺標記: { category: "status", durationSeconds: [7, 8, 9, 10, 12], criticalChanceBonus: [5, 7, 9, 11, 14], ascension: "死亡鎖定", criticalsRequired: 3, huntExplosionDamage: 120 },
  疾風連射: { category: "burst", arrows: 5, damagePerArrow: [55, 60, 65, 70, 78], ascension: "六重風葬", sixthArrowDamage: 90 },
  風行領域: { category: "mechanic", successfulPrimaryHitsRequired: 8, actions: 8, attackSpeedBonus: [12, 16, 20, 24, 30], normalDamagePenalty: 10, ascension: "疾風界域", speedPerGaleStack: 3, maxGaleStacks: 5 },
  破星狙擊: { category: "burst", damage: [280, 310, 340, 380, 420], criticalDamageBonus: [10, 20, 30, 40, 50], ascension: "星隕貫殺", ascendedChargeRecovery: 2 },
  蒼穹箭雨: { category: "ultimate", rainArrows: 8, mainArrows: 1, totalDamage: [400, 450, 505, 565, 630], ascension: "萬矢天罰", skyMarksMax: 8, mainArrowDamagePerMark: 6 },
} as const;

export const RANGER_PASSIVE_RULES = {
  迅捷手感: { attackSpeedBonus: [3, 5, 7, 9, 12] },
  鷹眼: { criticalChancePoints: [2, 3, 4, 5, 7] },
  疾風餘勢: { nextNormalDamageBonus: [4, 6, 8, 10, 12] },
  影步反射: { dodgeChancePoints: [2, 3, 4, 5, 7], nextPrimaryCriticalChancePoints: [5, 8, 11, 14, 18] },
  破綻獵手: { directDamageVsMarked: [5, 7, 9, 11, 14] },
  精準連射: { multihitSkillSegmentDamageBonus: [2, 3, 4, 5, 6] },
  風之積蓄: { speedPerStack: [1, 1.5, 2, 2.5, 3], maxStacks: 4, followingPrimaryActions: 4 },
  狩獵節奏: { nextSkillDamageVsMarkedNormalCrit: [5, 7, 9, 11, 14] },
  乘風閃擊: { nextHitExtraDamage: [25, 35, 45, 55, 65] },
  要害穿透: { extraCriticalDirectDamage: [3, 5, 7, 9, 12] },
  星痕蓄力: { nextBurstDamagePerStack: [3, 4, 5, 6, 8], maxStacks: 3 },
  蒼穹餘響: { ultimateMainArrowExtraDamage: [45, 55, 65, 75, 90] },
} as const;

export type RangerActiveName = keyof typeof RANGER_ACTIVE_RULES;
export type RangerPassiveName = keyof typeof RANGER_PASSIVE_RULES;

export function rangerSkillRankValue(values: readonly number[], rank: number): number {
  if (!Number.isInteger(rank) || rank < 1 || rank > 5 || values.length !== 5) {
    throw new RangeError("Ranger skill rank must be 1–5");
  }
  return values[rank - 1];
}

export type RangerWindDomain = {
  remainingActions: number;
  rank: number;
  ascended: boolean;
  galeStacks: number;
};

export function createRangerWindDomain(): RangerWindDomain {
  return { remainingActions: 0, rank: 0, ascended: false, galeStacks: 0 };
}

// Activation itself is a player action; the eight affected attacks come later.
export function activateRangerWindDomain(rank: number, ascended: boolean): RangerWindDomain {
  rangerSkillRankValue(RANGER_ACTIVE_RULES.風行領域.attackSpeedBonus, rank);
  return { remainingActions: 8, rank, ascended, galeStacks: 0 };
}

export function consumeRangerWindDomain(
  state: RangerWindDomain,
  event: { kind: "normal" | "skill"; hits: readonly { hit: boolean; critical?: boolean }[] },
): {
  state: RangerWindDomain;
  attackSpeedBonusPercent: number;
  normalDamagePenaltyPercent: number;
} {
  if (!state.remainingActions) {
    return { state, attackSpeedBonusPercent: 0, normalDamagePenaltyPercent: 0 };
  }
  const critical = event.hits.some((hit) => hit.hit && hit.critical);
  const remainingActions = state.remainingActions - 1;
  const nextStacks = state.ascended && critical
    ? Math.min(RANGER_ACTIVE_RULES.風行領域.maxGaleStacks, state.galeStacks + 1) : state.galeStacks;
  return {
    state: remainingActions
      ? { ...state, remainingActions, galeStacks: nextStacks }
      : createRangerWindDomain(),
    attackSpeedBonusPercent: rangerSkillRankValue(RANGER_ACTIVE_RULES.風行領域.attackSpeedBonus, state.rank)
      + state.galeStacks * RANGER_ACTIVE_RULES.風行領域.speedPerGaleStack,
    normalDamagePenaltyPercent: event.kind === "normal" ? RANGER_ACTIVE_RULES.風行領域.normalDamagePenalty : 0,
  };
}
