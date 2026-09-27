// Ranger enemy attack and confirmed dodge events on the isolated rework path.
// One enemy attack may contain multiple segments but counts only once.
import type { SkillBuild } from "./skill-rework";
import type { RangerCombat } from "./skill-ranger-combat";
import { recordSuccessfulDodge } from "./skill-combat-queue";
import { recordRangerDodge, rangerPassiveStats } from "./skill-ranger-passives";
import { RANGER_ACTIVE_RULES, rangerSkillRankValue } from "./skill-ranger-rules";

export type RangerDefenseState = {
  receivedAttacks: number;
  healthTriggerArmed: boolean;
  phantomAttacksRemaining: number;
  phantomActiveForAttack: boolean;
  phantomAscended: boolean;
  guaranteedDodgePending: boolean;
  nextHitCriticalChancePoints: number;
  nextSkillCriticalDamagePending: boolean;
};

export function createRangerDefenseState(): RangerDefenseState {
  return {
    receivedAttacks: 0, healthTriggerArmed: true,
    phantomAttacksRemaining: 0, phantomActiveForAttack: false,
    phantomAscended: false, guaranteedDodgePending: false,
    nextHitCriticalChancePoints: 0, nextSkillCriticalDamagePending: false,
  };
}

export function rangerDefenseActivation(build: SkillBuild, ascended: boolean) {
  const rank = build.activeSlots.includes("幻影步") ? build.ranks["幻影步"] ?? 0 : 0;
  if (!rank) return null;
  return {
    dodgeChancePoints: rangerSkillRankValue(RANGER_ACTIVE_RULES.幻影步.dodgeBonus, rank),
    nextHitCriticalChancePoints: rangerSkillRankValue(RANGER_ACTIVE_RULES.幻影步.nextCritChance, rank),
    grantsGuaranteedDodge: ascended,
  };
}

export type RangerEnemyAttack = {
  segments: number;
  countsAsReceivedHit: boolean;
  healthPercent: number;
  // Whether this event can use the HP trigger (for instance, when a new
  // incoming attack begins); a single low-HP interval triggers only once.
  canActivateFromHealth: boolean;
  ascended: boolean;
};

export function recordRangerEnemyAttack(combat: RangerCombat, input: RangerEnemyAttack) {
  if (!Number.isInteger(input.segments) || input.segments < 1) {
    throw new RangeError("Enemy attack must contain at least one segment");
  }
  const rank = combat.build.activeSlots.includes("幻影步")
    ? combat.build.ranks["幻影步"] ?? 0 : 0;
  const total = rank && input.countsAsReceivedHit
    ? combat.defense.receivedAttacks + 1 : combat.defense.receivedAttacks;
  const healthTriggerArmed = input.healthPercent >= RANGER_ACTIVE_RULES.幻影步.healthBelow
    ? true : combat.defense.healthTriggerArmed;
  const continuing = rank > 0 && combat.defense.phantomAttacksRemaining > 0;
  const activation = rank && !continuing
    && ((input.canActivateFromHealth && healthTriggerArmed
      && input.healthPercent < RANGER_ACTIVE_RULES.幻影步.healthBelow)
      || total >= RANGER_ACTIVE_RULES.幻影步.enemyAttacksRequired)
    ? rangerDefenseActivation(combat.build, input.ascended) : null;
  const phantomActiveForAttack = Boolean(activation) || continuing;
  const phantomAttacksRemaining = activation
    ? RANGER_ACTIVE_RULES.幻影步.affectedEnemyAttacks - 1
    : continuing ? combat.defense.phantomAttacksRemaining - 1 : 0;
  const passiveDodgeChancePoints = rangerPassiveStats(combat.build).dodgeChancePoints;
  return {
    combat: {
      ...combat,
      defense: {
        ...combat.defense,
        receivedAttacks: activation ? 0 : total,
        healthTriggerArmed: activation && input.healthPercent < RANGER_ACTIVE_RULES.幻影步.healthBelow
          ? false : healthTriggerArmed,
        phantomAttacksRemaining,
        phantomActiveForAttack,
        phantomAscended: activation ? input.ascended : continuing && combat.defense.phantomAscended,
        guaranteedDodgePending: Boolean(activation?.grantsGuaranteedDodge)
          || (continuing && combat.defense.guaranteedDodgePending),
      },
    },
    activation,
    phantomActiveForAttack,
    guaranteedDodgeForAttack: Boolean(activation?.grantsGuaranteedDodge)
      || (continuing && combat.defense.guaranteedDodgePending),
    passiveDodgeChancePoints,
    dodgeChancePoints: passiveDodgeChancePoints + (phantomActiveForAttack
      ? rangerSkillRankValue(RANGER_ACTIVE_RULES.幻影步.dodgeBonus, rank) : 0),
  };
}

export function recordRangerSuccessfulDodge(
  combat: RangerCombat,
  input: { phantomStepActive: boolean; ascended: boolean },
) {
  const rank = combat.build.activeSlots.includes("幻影步")
    ? combat.build.ranks["幻影步"] ?? 0 : 0;
  const active = rank > 0 && input.phantomStepActive && combat.defense.phantomActiveForAttack;
  return {
    combat: {
      ...combat,
      session: {
        ...combat.session,
        charge: recordSuccessfulDodge(combat.session.charge),
      },
      passives: recordRangerDodge(combat.passives, combat.build),
      defense: {
        ...combat.defense,
        guaranteedDodgePending: false,
        nextHitCriticalChancePoints: active
          ? rangerSkillRankValue(RANGER_ACTIVE_RULES.幻影步.nextCritChance, rank)
          : combat.defense.nextHitCriticalChancePoints,
        nextSkillCriticalDamagePending: combat.defense.nextSkillCriticalDamagePending
          || (active && combat.defense.phantomAscended && input.ascended),
      },
    },
    consumedGuaranteedDodge: combat.defense.guaranteedDodgePending,
  };
}
