// Enemy attack events for the isolated warrior rework. The caller decides
// whether a blocked/dodged event counts as a received attack until specified.
import type { SkillBuild } from "./skill-rework";
import type { WarriorCombat } from "./skill-warrior-combat";
import { consumeWarriorCounter, recordWarriorBlock, warriorPassiveDefenses } from "./skill-warrior-passives";
import { WARRIOR_ACTIVE_RULES, warriorSkillRankValue } from "./skill-warrior-rules";

export type WarriorDefenseState = {
  receivedAttacks: number;
  guaranteedBlockPending: boolean;
};

export function createWarriorDefenseState(): WarriorDefenseState {
  return { receivedAttacks: 0, guaranteedBlockPending: false };
}

export function warriorDefenseActivation(build: SkillBuild, ascended: boolean) {
  const rank = build.ranks["不屈戰意"] ?? 0;
  if (!rank) return null;
  return {
    blockChancePercent: warriorSkillRankValue(WARRIOR_ACTIVE_RULES.不屈戰意.blockChance, rank),
    counterChancePercent: warriorSkillRankValue(WARRIOR_ACTIVE_RULES.不屈戰意.counterChance, rank),
    grantsGuaranteedBlock: ascended,
  };
}

export type WarriorEnemyAttack = {
  // Call once for one enemy attack event, even if it has multiple segments.
  segments: number;
  countsAsReceivedHit: boolean;
  healthPercent: number;
  ascended: boolean;
};

export function recordWarriorEnemyAttack(combat: WarriorCombat, input: WarriorEnemyAttack) {
  if (!Number.isInteger(input.segments) || input.segments < 1) {
    throw new RangeError("Enemy attack must contain at least one segment");
  }
  const rank = combat.build.ranks["不屈戰意"] ?? 0;
  const total = rank && input.countsAsReceivedHit ? combat.defense.receivedAttacks + 1 : combat.defense.receivedAttacks;
  const activation = rank && total >= WARRIOR_ACTIVE_RULES.不屈戰意.enemyAttacksRequired
    ? warriorDefenseActivation(combat.build, input.ascended) : null;
  const defense: WarriorDefenseState = {
    receivedAttacks: activation ? 0 : total,
    guaranteedBlockPending: combat.defense.guaranteedBlockPending || Boolean(activation?.grantsGuaranteedBlock),
  };
  return {
    combat: { ...combat, defense },
    activation,
    passive: warriorPassiveDefenses(combat.build, input.healthPercent),
  };
}

// Called only after the surrounding battle engine confirms a successful block.
export function recordWarriorSuccessfulBlock(combat: WarriorCombat) {
  return {
    combat: {
      ...combat,
      defense: { ...combat.defense, guaranteedBlockPending: false },
      passives: recordWarriorBlock(combat.passives, combat.build),
    },
    consumedGuaranteedBlock: combat.defense.guaranteedBlockPending,
  };
}

// Called only after a counterattack occurs; a failed counter roll does not consume it.
export function recordWarriorCounter(combat: WarriorCombat) {
  const counter = consumeWarriorCounter(combat.passives, combat.build);
  return { combat: { ...combat, passives: counter.state }, damageBonusPercent: counter.damageBonusPercent };
}
