// Enemy attack events for the isolated warrior rework. Each enemy attack
// counts once, including blocked, dodged and missed attacks.
import type { SkillBuild } from "./skill-rework";
import type { WarriorCombat } from "./skill-warrior-combat";
import { consumeWarriorCounter, recordWarriorBlock, warriorPassiveDefenses } from "./skill-warrior-passives";
import { WARRIOR_ACTIVE_RULES, warriorSkillRankValue } from "./skill-warrior-rules";

export type WarriorDefenseState = {
  receivedAttacks: number;
  activeAttacksRemaining: number;
  activeForAttack: boolean;
  guaranteedBlockPending: boolean;
  ascendedCounterStacks: number;
};

export function createWarriorDefenseState(): WarriorDefenseState {
  return { receivedAttacks: 0, activeAttacksRemaining: 0, activeForAttack: false,
    guaranteedBlockPending: false, ascendedCounterStacks: 0 };
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
  // Kept for older callers; enemy attacks always count regardless of outcome.
  countsAsReceivedHit?: boolean;
  healthPercent: number;
  ascended: boolean;
};

export function recordWarriorEnemyAttack(combat: WarriorCombat, input: WarriorEnemyAttack) {
  if (!Number.isInteger(input.segments) || input.segments < 1) {
    throw new RangeError("Enemy attack must contain at least one segment");
  }
  const rank = combat.build.ranks["不屈戰意"] ?? 0;
  const total = rank ? combat.defense.receivedAttacks + 1 : combat.defense.receivedAttacks;
  const continuing = rank > 0 && combat.defense.activeAttacksRemaining > 0;
  const activation = rank && !continuing && total >= WARRIOR_ACTIVE_RULES.不屈戰意.enemyAttacksRequired
    ? warriorDefenseActivation(combat.build, input.ascended) : null;
  const activeForAttack = Boolean(activation) || continuing;
  const activeAttacksRemaining = activation
    ? WARRIOR_ACTIVE_RULES.不屈戰意.affectedEnemyAttacks - 1
    : continuing ? combat.defense.activeAttacksRemaining - 1 : 0;
  const defense: WarriorDefenseState = {
    receivedAttacks: activation ? 0 : total,
    activeAttacksRemaining,
    activeForAttack,
    guaranteedBlockPending: Boolean(activation?.grantsGuaranteedBlock)
      || (continuing && combat.defense.guaranteedBlockPending),
    ascendedCounterStacks: combat.defense.ascendedCounterStacks,
  };
  return {
    combat: { ...combat, defense },
    activation,
    activeForAttack,
    blockChancePercent: activeForAttack
      ? warriorSkillRankValue(WARRIOR_ACTIVE_RULES.不屈戰意.blockChance, rank) : 0,
    counterChancePercent: activeForAttack
      ? warriorSkillRankValue(WARRIOR_ACTIVE_RULES.不屈戰意.counterChance, rank) : 0,
    passive: warriorPassiveDefenses(combat.build, input.healthPercent),
  };
}

// Called only after the surrounding battle engine confirms a successful block.
export function recordWarriorSuccessfulBlock(combat: WarriorCombat, ascended = false) {
  const ascendedCounterStacks = ascended && combat.defense.activeForAttack
    && (combat.build.ranks["不屈戰意"] ?? 0) > 0
    ? Math.min(3, combat.defense.ascendedCounterStacks + 1) : combat.defense.ascendedCounterStacks;
  return {
    combat: {
      ...combat,
      defense: { ...combat.defense, guaranteedBlockPending: false, ascendedCounterStacks },
      passives: recordWarriorBlock(combat.passives, combat.build),
    },
    consumedGuaranteedBlock: combat.defense.guaranteedBlockPending,
  };
}

// Called only after a counterattack occurs; a failed counter roll does not consume it.
export function recordWarriorCounter(combat: WarriorCombat, hit = true) {
  const counter = consumeWarriorCounter(combat.passives, combat.build);
  const bonus = counter.damageBonusPercent + combat.defense.ascendedCounterStacks * 20;
  return {
    combat: { ...combat, passives: counter.state,
      defense: { ...combat.defense, ascendedCounterStacks: 0 } },
    damageBonusPercent: hit ? bonus : 0,
    // The counter's base damage and hit/crit are owned by the caller. No
    // primary attack, charge, energy, status or passive proc is created here.
    counterDamageEvent: hit ? { id: "反擊" as const, damageBonusPercent: bonus } : null,
  };
}

