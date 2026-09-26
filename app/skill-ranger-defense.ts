// Ranger enemy attack and confirmed dodge events on the isolated rework path.
// The surrounding battle engine decides duration and which outcomes count as hits.
import type { SkillBuild } from "./skill-rework";
import type { RangerCombat } from "./skill-ranger-combat";
import { recordSuccessfulDodge } from "./skill-combat-queue";
import { recordRangerDodge, rangerPassiveStats } from "./skill-ranger-passives";
import { RANGER_ACTIVE_RULES, rangerSkillRankValue } from "./skill-ranger-rules";

export type RangerDefenseState = {
  receivedAttacks: number;
  guaranteedDodgePending: boolean;
  nextHitCriticalChancePoints: number;
  nextSkillCriticalDamagePending: boolean;
};

export function createRangerDefenseState(): RangerDefenseState {
  return {
    receivedAttacks: 0, guaranteedDodgePending: false,
    nextHitCriticalChancePoints: 0, nextSkillCriticalDamagePending: false,
  };
}

export function rangerDefenseActivation(build: SkillBuild, ascended: boolean) {
  const rank = build.ranks["幻影步"] ?? 0;
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
  // The caller handles retrigger eligibility; the skill's duration is not specified.
  canActivateFromHealth: boolean;
  ascended: boolean;
};

export function recordRangerEnemyAttack(combat: RangerCombat, input: RangerEnemyAttack) {
  if (!Number.isInteger(input.segments) || input.segments < 1) {
    throw new RangeError("Enemy attack must contain at least one segment");
  }
  const rank = combat.build.ranks["幻影步"] ?? 0;
  const total = rank && input.countsAsReceivedHit
    ? combat.defense.receivedAttacks + 1 : combat.defense.receivedAttacks;
  const activation = rank && ((input.canActivateFromHealth && input.healthPercent < 55)
    || total >= RANGER_ACTIVE_RULES.幻影步.enemyAttacksRequired)
    ? rangerDefenseActivation(combat.build, input.ascended) : null;
  return {
    combat: {
      ...combat,
      defense: {
        ...combat.defense,
        receivedAttacks: activation ? 0 : total,
        guaranteedDodgePending: combat.defense.guaranteedDodgePending
          || Boolean(activation?.grantsGuaranteedDodge),
      },
    },
    activation,
    passiveDodgeChancePoints: rangerPassiveStats(combat.build).dodgeChancePoints,
  };
}

export function recordRangerSuccessfulDodge(
  combat: RangerCombat,
  input: { phantomStepActive: boolean; ascended: boolean },
) {
  const rank = combat.build.ranks["幻影步"] ?? 0;
  const active = rank > 0 && input.phantomStepActive;
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
          || (active && input.ascended),
      },
    },
    consumedGuaranteedDodge: combat.defense.guaranteedDodgePending,
  };
}
