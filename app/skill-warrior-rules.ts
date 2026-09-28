// Warrior skill rework: exact Lv1–5 values and isolated action-count buffs.
// Bleed damage per second remains configurable after balance testing.
import { balanceConfig } from "./balance-config";
export const WARRIOR_ACTIVE_RULES = {
  裂地斬: { category: "basic", damage: [165, 176, 187, 204, 220], armorBreak: [15, 18, 21, 25, 30], ascension: "地脈崩裂" },
  血刃斬: { category: "basic", damage: [143, 154, 165, 176, 193], bleedChance: [20, 25, 30, 35, 40], ascension: "猩紅撕裂" },
  不屈戰意: { category: "defense", blockChance: [15, 18, 21, 24, 28], counterChance: [10, 12, 14, 17, 20], enemyAttacksRequired: 4, affectedEnemyAttacks: 3, ascension: "鋼魂壁壘" },
  血戰烙印: { category: "status", durationSeconds: [6, 7, 8, 9, 10], bleedChanceBonus: [10, 13, 16, 19, 22], ascension: "血祭印記" },
  鮮血怒吼: { category: "burst", damageBonus: [25, 32, 39, 47, 55], lifesteal: [10, 15, 20, 25, 30], healthBelow: 40, attacks: 5, ascension: "血怒終焉" },
  狂戰姿態: { category: "mechanic", attackSpeedBonus: [10, 14, 18, 22, 26], damageBonus: [8, 11, 14, 17, 20], defensePenalty: 15, attacks: 8, ascension: "無盡狂怒" },
  碎甲猛擊: { category: "burst", damage: [240, 265, 290, 320, 350], armorBreak: [20, 24, 28, 32, 36],
    ...balanceConfig.skillRework.warrior.active.碎甲猛擊, ascension: "崩鎧重擊" },
  泰坦斷界斬: { category: "ultimate", damage: [400, 450, 500, 560, 630], armorBreak: [20, 24, 28, 32, 36], ascension: "天地斷絕" },
} as const;

export const WARRIOR_PASSIVE_RULES = {
  鐵骨: { maxHealthBonus: [3, 5, 7, 9, 12] },
  裂傷本能: { basicBleedChance: [4, 6, 8, 10, 12] },
  破鎧追擊: { damageVsArmorBreak: [6, 9, 12, 15, 18] },
  堅盾反射: { nextAttackExtraDamage: [20, 28, 36, 44, 55] },
  血氣汲取: { lifestealVsBleed: [2, 3, 4, 5, 6] },
  重刃專精: { basicAndBurstDamage: [5, 7, 9, 12, 16] },
  逆境鋼心: { damageReductionBelow40Hp: [4, 6, 8, 10, 12] },
  血痕累積: { damagePerStack: [2, 3, 4, 5, 6], maxStacks: 3, missesToClear: 3 },
  格擋精通: { blockChancePoints: [3, 5, 7, 9, 11], nextCounterDamage: [10, 15, 20, 25, 30] },
  戰慄重擊: { burstDamageVsArmorBreak: [8, 11, 14, 17, 20] },
  絕境怒火: { directDamageBelow40Hp: [8, 11, 14, 17, 20] },
  泰坦餘震: { nextAttackExtraDamage: [35, 45, 55, 65, 80] },
} as const;

export type WarriorActiveName = keyof typeof WARRIOR_ACTIVE_RULES;
export type WarriorPassiveName = keyof typeof WARRIOR_PASSIVE_RULES;

export function warriorSkillRankValue(values: readonly number[], rank: number): number {
  if (!Number.isInteger(rank) || rank < 1 || rank > 5 || values.length !== 5) {
    throw new RangeError("Warrior skill rank must be 1–5");
  }
  return values[rank - 1];
}

export function warriorRepeatedArmorBreakBonus(rank: number): number {
  const rule = WARRIOR_ACTIVE_RULES.碎甲猛擊;
  return Math.min(rule.repeatedArmorBreakBonusCap,
    warriorSkillRankValue(rule.armorBreak, rank) * rule.repeatedArmorBreakFactor);
}

export type WarriorBuffState = {
  bloodRoarUsed: boolean;
  bloodRoarRemaining: number;
  bloodRoarRank: number;
  bloodRoarAscended: boolean;
  stanceRemaining: number;
  stanceRank: number;
  stanceAscended: boolean;
  stanceExtensions: number;
  groundShockPending: boolean;
  titanSlashesRemaining: number;
};

export function createWarriorBuffState(): WarriorBuffState {
  return {
    bloodRoarUsed: false, bloodRoarRemaining: 0, bloodRoarRank: 0, bloodRoarAscended: false,
    stanceRemaining: 0, stanceRank: 0, stanceAscended: false, stanceExtensions: 0,
    groundShockPending: false, titanSlashesRemaining: 0,
  };
}

export function triggerWarriorBloodRoar(
  state: WarriorBuffState, rank: number, healthPercent: number, ascended: boolean,
): WarriorBuffState | null {
  warriorSkillRankValue(WARRIOR_ACTIVE_RULES.鮮血怒吼.damageBonus, rank);
  if (state.bloodRoarUsed || !Number.isFinite(healthPercent) || healthPercent >= 40) return null;
  return { ...state, bloodRoarUsed: true, bloodRoarRemaining: 5, bloodRoarRank: rank, bloodRoarAscended: ascended };
}

export function triggerWarriorStance(state: WarriorBuffState, rank: number, ascended: boolean): WarriorBuffState {
  warriorSkillRankValue(WARRIOR_ACTIVE_RULES.狂戰姿態.damageBonus, rank);
  return { ...state, stanceRemaining: 8, stanceRank: rank, stanceAscended: ascended, stanceExtensions: 0 };
}

export function recordWarriorSkillHit(
  state: WarriorBuffState, skill: WarriorActiveName, targetAlreadyArmorBroken: boolean, ascended: boolean,
): WarriorBuffState {
  if (!ascended) return state;
  if (skill === "裂地斬" && targetAlreadyArmorBroken) return { ...state, groundShockPending: true };
  if (skill === "泰坦斷界斬") return { ...state, titanSlashesRemaining: 3 };
  return state;
}

export function consumeWarriorPrimaryAttack(
  state: WarriorBuffState, causedBleedOrArmorBreak: boolean,
): { state: WarriorBuffState; damageBonusPercent: number; lifestealPercent: number;
  extraDamagePercents: number[];
  additionalEvents: { id: "地脈崩裂" | "天地斷絕" | "血怒終焉"; percent: number }[];
  attackSpeedBonusPercent: number; defensePenaltyPercent: number } {
  const roar = state.bloodRoarRemaining > 0;
  const stance = state.stanceRemaining > 0;
  const additionalEvents: { id: "地脈崩裂" | "天地斷絕" | "血怒終焉"; percent: number }[] = [
    ...(state.groundShockPending ? [{ id: "地脈崩裂" as const, percent: 60 }] : []),
    ...(state.titanSlashesRemaining > 0 ? [{ id: "天地斷絕" as const, percent: 70 }] : []),
    ...(roar && state.bloodRoarRemaining === 1 && state.bloodRoarAscended
      ? [{ id: "血怒終焉" as const, percent: 180 }] : []),
  ];
  const canExtendStance = stance && state.stanceAscended && causedBleedOrArmorBreak && state.stanceExtensions < 3;
  return {
    state: {
      ...state,
      bloodRoarRemaining: roar ? state.bloodRoarRemaining - 1 : 0,
      stanceRemaining: stance ? state.stanceRemaining - 1 + (canExtendStance ? 1 : 0) : 0,
      stanceExtensions: state.stanceExtensions + (canExtendStance ? 1 : 0),
      groundShockPending: false,
      titanSlashesRemaining: Math.max(0, state.titanSlashesRemaining - 1),
    },
    damageBonusPercent: (roar ? warriorSkillRankValue(WARRIOR_ACTIVE_RULES.鮮血怒吼.damageBonus, state.bloodRoarRank) : 0)
      + (stance ? warriorSkillRankValue(WARRIOR_ACTIVE_RULES.狂戰姿態.damageBonus, state.stanceRank) : 0),
    lifestealPercent: roar ? warriorSkillRankValue(WARRIOR_ACTIVE_RULES.鮮血怒吼.lifesteal, state.bloodRoarRank) : 0,
    extraDamagePercents: additionalEvents.map((event) => event.percent),
    additionalEvents,
    attackSpeedBonusPercent: stance ? warriorSkillRankValue(WARRIOR_ACTIVE_RULES.狂戰姿態.attackSpeedBonus, state.stanceRank) : 0,
    defensePenaltyPercent: stance ? 15 : 0,
  };
}

