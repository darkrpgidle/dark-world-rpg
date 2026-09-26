// Ranger passive state on the isolated primary-action event path.
// Damage and attribute percentages are returned to the eventual battle adapter.
import type { ActiveCategory, SkillBuild } from "./skill-rework";
import type { PrimaryAttackEvent } from "./skill-combat-queue";
import { RANGER_PASSIVE_RULES, rangerSkillRankValue, type RangerPassiveName } from "./skill-ranger-rules";

export type RangerPassiveState = {
  nextNormalDamagePending: boolean;
  nextPrimaryCriticalPending: boolean;
  nextSkillDamagePending: boolean;
  dodgeFollowupPending: boolean;
  windMomentumStacks: number;
  windMomentumRemaining: number;
  starTraceStacks: number;
};

export function createRangerPassiveState(): RangerPassiveState {
  return {
    nextNormalDamagePending: false, nextPrimaryCriticalPending: false,
    nextSkillDamagePending: false, dodgeFollowupPending: false,
    windMomentumStacks: 0, windMomentumRemaining: 0, starTraceStacks: 0,
  };
}

function value(build: SkillBuild, name: RangerPassiveName, key: string): number {
  const rank = build.ranks[name] ?? 0;
  if (!rank) return 0;
  const values = (RANGER_PASSIVE_RULES[name] as unknown as Record<string, readonly number[]>)[key];
  if (!values) throw new RangeError("Unknown ranger passive value");
  return rangerSkillRankValue(values, rank);
}

export function rangerPassiveStats(build: SkillBuild) {
  return {
    attackSpeedBonusPercent: value(build, "迅捷手感", "attackSpeedBonus"),
    criticalChancePoints: value(build, "鷹眼", "criticalChancePoints"),
    dodgeChancePoints: value(build, "影步反射", "dodgeChancePoints"),
  };
}

// The future enemy-event adapter calls this only after a confirmed dodge.
export function recordRangerDodge(state: RangerPassiveState, build: SkillBuild): RangerPassiveState {
  return {
    ...state,
    nextPrimaryCriticalPending: state.nextPrimaryCriticalPending || (build.ranks["影步反射"] ?? 0) > 0,
    dodgeFollowupPending: state.dodgeFollowupPending || (build.ranks["乘風閃擊"] ?? 0) > 0,
  };
}

export type RangerPassiveAttack = {
  kind: PrimaryAttackEvent["kind"];
  category?: ActiveCategory;
  hits: PrimaryAttackEvent["hits"];
  targetMarked: boolean;
  isUltimate: boolean;
};

export function resolveRangerPassiveAttack(
  state: RangerPassiveState, build: SkillBuild, input: RangerPassiveAttack,
) {
  const hit = input.hits.some((segment) => segment.hit);
  const critical = input.hits.some((segment) => segment.hit && segment.critical);
  const normal = input.kind === "normal";
  const burst = input.kind === "skill" && input.category === "burst";
  const nextNormal = normal && state.nextNormalDamagePending;
  const nextSkill = !normal && state.nextSkillDamagePending;
  const starTrace = burst ? state.starTraceStacks : 0;
  const windStacks = state.windMomentumRemaining ? state.windMomentumStacks : 0;
  const damageBonusPercent =
    (hit && input.targetMarked ? value(build, "破綻獵手", "directDamageVsMarked") : 0)
    + (hit && !normal && input.hits.length > 1 ? value(build, "精準連射", "multihitSkillSegmentDamageBonus") : 0)
    + (nextNormal ? value(build, "疾風餘勢", "nextNormalDamageBonus") : 0)
    + (nextSkill ? value(build, "狩獵節奏", "nextSkillDamageVsMarkedNormalCrit") : 0)
    + starTrace * value(build, "星痕蓄力", "nextBurstDamagePerStack");

  const damageCandidates: { id: "乘風閃擊" | "蒼穹餘響"; percent: number }[] = [];
  if (hit && state.dodgeFollowupPending) {
    damageCandidates.push({ id: "乘風閃擊", percent: value(build, "乘風閃擊", "nextHitExtraDamage") });
  }
  if (input.isUltimate && input.hits[8]?.hit && (build.ranks["蒼穹餘響"] ?? 0) > 0) {
    damageCandidates.push({ id: "蒼穹餘響", percent: value(build, "蒼穹餘響", "ultimateMainArrowExtraDamage") });
  }

  let windMomentumRemaining = state.windMomentumRemaining ? state.windMomentumRemaining - 1 : 0;
  let windMomentumStacks = windMomentumRemaining ? windStacks : 0;
  if (normal && hit && (build.ranks["風之積蓄"] ?? 0) > 0) {
    windMomentumStacks = Math.min(RANGER_PASSIVE_RULES.風之積蓄.maxStacks, windStacks + 1);
    windMomentumRemaining = RANGER_PASSIVE_RULES.風之積蓄.followingPrimaryActions;
  }
  const starTraceStacks = burst ? 0 : state.starTraceStacks;
  const nextState: RangerPassiveState = {
    ...state,
    nextNormalDamagePending: normal ? false : state.nextNormalDamagePending,
    nextPrimaryCriticalPending: false,
    nextSkillDamagePending: normal ? state.nextSkillDamagePending : false,
    dodgeFollowupPending: hit ? false : state.dodgeFollowupPending,
    windMomentumStacks,
    windMomentumRemaining,
    starTraceStacks: critical && (build.ranks["星痕蓄力"] ?? 0) > 0
      ? Math.min(RANGER_PASSIVE_RULES.星痕蓄力.maxStacks, starTraceStacks + 1)
      : starTraceStacks,
  };
  if (normal && critical && (build.ranks["疾風餘勢"] ?? 0) > 0) nextState.nextNormalDamagePending = true;
  if (normal && critical && input.targetMarked && (build.ranks["狩獵節奏"] ?? 0) > 0) {
    nextState.nextSkillDamagePending = true;
  }
  const staticStats = rangerPassiveStats(build);
  return {
    state: nextState,
    damageBonusPercent,
    criticalDirectDamageBonusPercentBySegment: input.hits.map((segment) =>
      segment.hit && segment.critical ? value(build, "要害穿透", "extraCriticalDirectDamage") : 0),
    attackSpeedBonusPercent: staticStats.attackSpeedBonusPercent
      + windStacks * value(build, "風之積蓄", "speedPerStack"),
    criticalChancePoints: staticStats.criticalChancePoints
      + (state.nextPrimaryCriticalPending
        ? value(build, "影步反射", "nextPrimaryCriticalChancePoints") : 0),
    dodgeChancePoints: staticStats.dodgeChancePoints,
    damageCandidates,
  };
}
