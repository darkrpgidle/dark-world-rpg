// Warrior passive effects on the isolated reworked combat path.
// Damage percentages are returned to the caller; this module does not apply HP damage.
import type { ActiveCategory, SkillBuild } from "./skill-rework";
import type { StatusApplication } from "./skill-combat-session";
import { WARRIOR_PASSIVE_RULES, warriorSkillRankValue, type WarriorPassiveName } from "./skill-warrior-rules";

export type WarriorPassiveState = {
  bloodTraceStacks: number;
  bloodTraceMisses: number;
  shieldReflectionPending: boolean;
  titanAftershockPending: boolean;
  counterBonusPending: boolean;
};

export function createWarriorPassiveState(): WarriorPassiveState {
  return { bloodTraceStacks: 0, bloodTraceMisses: 0, shieldReflectionPending: false,
    titanAftershockPending: false, counterBonusPending: false };
}

function value(build: SkillBuild, name: WarriorPassiveName, key: string): number {
  const rank = build.ranks[name] ?? 0;
  if (!rank) return 0;
  const values = (WARRIOR_PASSIVE_RULES[name] as unknown as Record<string, readonly number[]>)[key];
  if (!values) throw new RangeError("Unknown warrior passive value");
  return warriorSkillRankValue(values, rank);
}

// These values are consumed by the eventual incoming-damage and character-stat adapters.
export function warriorPassiveDefenses(build: SkillBuild, healthPercent: number) {
  return {
    maxHealthBonusPercent: value(build, "鐵骨", "maxHealthBonus"),
    blockChancePoints: value(build, "格擋精通", "blockChancePoints"),
    incomingDamageReductionPercent: healthPercent < 40 ? value(build, "逆境鋼心", "damageReductionBelow40Hp") : 0,
  };
}

export function recordWarriorBlock(state: WarriorPassiveState, build: SkillBuild): WarriorPassiveState {
  return {
    ...state,
    shieldReflectionPending: state.shieldReflectionPending || (build.ranks["堅盾反射"] ?? 0) > 0,
    counterBonusPending: state.counterBonusPending || (build.ranks["格擋精通"] ?? 0) > 0,
  };
}

export function consumeWarriorCounter(state: WarriorPassiveState, build: SkillBuild) {
  return {
    state: { ...state, counterBonusPending: false },
    damageBonusPercent: state.counterBonusPending ? value(build, "格擋精通", "nextCounterDamage") : 0,
  };
}

export type WarriorPassiveAttackInput = {
  kind: "normal" | "skill";
  category?: ActiveCategory;
  hit: boolean;
  targetBleeding: boolean;
  targetArmorBroken: boolean;
  healthPercent: number;
  isUltimate: boolean;
  ascendedBleed: boolean;
  roll: () => number;
};

export function resolveWarriorPassiveAttack(
  state: WarriorPassiveState, build: SkillBuild, input: WarriorPassiveAttackInput,
) {
  const statuses: StatusApplication[] = [];
  // A skill with multiple damage segments still makes only one passive roll.
  const passiveBleedChance = value(build, "裂傷本能", "basicBleedChance");
  if (input.kind === "normal" && input.hit && passiveBleedChance > 0 &&
      input.roll() * 100 < passiveBleedChance) {
    statuses.push({ kind: "bleed", ascendedBleed: input.ascendedBleed });
  }

  const damageBonusPercent = (input.hit && input.targetArmorBroken ? value(build, "破鎧追擊", "damageVsArmorBreak") : 0)
    + (input.kind === "skill" && (input.category === "basic" || input.category === "burst")
      ? value(build, "重刃專精", "basicAndBurstDamage") : 0)
    + (input.hit ? state.bloodTraceStacks * value(build, "血痕累積", "damagePerStack") : 0)
    + (input.kind === "skill" && input.category === "burst" && input.targetArmorBroken
      ? value(build, "戰慄重擊", "burstDamageVsArmorBreak") : 0)
    + (input.healthPercent < 40 && input.hit ? value(build, "絕境怒火", "directDamageBelow40Hp") : 0);

  const damageCandidates: { id: "堅盾反射" | "泰坦餘震"; percent: number }[] = [];
  if (input.hit && state.shieldReflectionPending) {
    damageCandidates.push({ id: "堅盾反射", percent: value(build, "堅盾反射", "nextAttackExtraDamage") });
  }
  if (input.hit && state.titanAftershockPending) {
    damageCandidates.push({ id: "泰坦餘震", percent: value(build, "泰坦餘震", "nextAttackExtraDamage") });
  }

  const matchedBleed = input.hit && input.targetBleeding;
  const bloodTraceLearned = (build.ranks["血痕累積"] ?? 0) > 0;
  const misses = matchedBleed ? 0 : state.bloodTraceMisses + 1;
  const nextState: WarriorPassiveState = {
    ...state,
    shieldReflectionPending: false,
    titanAftershockPending: false,
    bloodTraceStacks: !bloodTraceLearned || misses >= 3 ? 0 : matchedBleed
      ? Math.min(3, state.bloodTraceStacks + 1) : state.bloodTraceStacks,
    bloodTraceMisses: !bloodTraceLearned || misses >= 3 ? 0 : misses,
  };
  // The ultimate earns its next-attack buff only after this action consumes earlier buffs.
  if (input.isUltimate && input.hit && (build.ranks["泰坦餘震"] ?? 0) > 0) {
    nextState.titanAftershockPending = true;
  }
  return {
    state: nextState,
    statuses,
    damageBonusPercent,
    lifestealPercent: input.hit && input.targetBleeding ? value(build, "血氣汲取", "lifestealVsBleed") : 0,
    damageCandidates,
  };
}
