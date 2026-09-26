// Ranger primary actions on the isolated skill-rework combat path.
// The caller applies direct HP damage and rolls each arrow's hit/critical.
import type { SkillBuild } from "./skill-rework";
import {
  advanceCombatSession, createSkillCombatSession, resolveSkillAction, takeReadySkill,
  type SkillCombatSession, type StatusApplication,
} from "./skill-combat-session";
import type { PrimaryAttackEvent } from "./skill-combat-queue";
import {
  RANGER_ACTIVE_RULES, activateRangerWindDomain, consumeRangerWindDomain,
  createRangerWindDomain, rangerSkillRankValue,
  type RangerActiveName, type RangerWindDomain,
} from "./skill-ranger-rules";

export type RangerCombat = {
  session: SkillCombatSession;
  build: SkillBuild;
  windDomain: RangerWindDomain;
  nextSkillIgnoreDefensePending: boolean;
};

export function createRangerCombat(build: SkillBuild, level: number): RangerCombat {
  return {
    session: createSkillCombatSession(build, "遊俠", level),
    build: { ranks: { ...build.ranks }, activeSlots: [...build.activeSlots] },
    windDomain: createRangerWindDomain(),
    nextSkillIgnoreDefensePending: false,
  };
}

export type RangerTurnInput = {
  skill: RangerActiveName | "normal";
  hits: PrimaryAttackEvent["hits"];
  now: number;
  ascended: ReadonlySet<RangerActiveName>;
};

export type RangerTurnResult = {
  combat: RangerCombat;
  damageSegmentPercents: number[];
  // Rain's total is defined, but its nine individual multipliers are not.
  totalDamagePercent: number;
  additionalArrowPercent: number;
  skyMarks: number;
  mainArrowDamageBonusPercent: number;
  ignoreDefensePercent: number;
  skillCriticalDamageBonusPercent: number;
  markedTargetCriticalChancePoints: number;
  attackSpeedBonusPercent: number;
  normalDamagePenaltyPercent: number;
  statusApplications: StatusApplication[];
  dueTicks: ReturnType<typeof advanceCombatSession>["ticks"];
};

export function resolveRangerTurn(combat: RangerCombat, input: RangerTurnInput): RangerTurnResult | null {
  if (input.skill === "幻影步") return null; // triggered by enemy events, not the player's turn
  const settled = advanceCombatSession(combat.session, input.now);
  let session = settled.session;
  const rule = input.skill === "normal" ? null : RANGER_ACTIVE_RULES[input.skill];
  const rank = input.skill === "normal" ? 0 : combat.build.ranks[input.skill] ?? 0;
  if (input.skill === "疾風連射" && input.hits.length !== RANGER_ACTIVE_RULES.疾風連射.arrows) return null;
  if (input.skill === "蒼穹箭雨" &&
      input.hits.length !== RANGER_ACTIVE_RULES.蒼穹箭雨.rainArrows + RANGER_ACTIVE_RULES.蒼穹箭雨.mainArrows) return null;

  if (rule) {
    if (!rank) return null;
    const selected = takeReadySkill(session, true);
    if (!selected || selected.skill !== input.skill) return null;
    session = selected.session;
  } else if (takeReadySkill(session, true)) {
    return null;
  }

  const markedTargetCriticalChancePoints = session.enemy.hunterMark?.strength ?? 0;
  const wind = consumeRangerWindDomain(combat.windDomain, {
    kind: rule ? "skill" : "normal", hits: input.hits,
  });
  const successfulHit = input.hits.some((hit) => hit.hit);
  const statusApplications: StatusApplication[] = [];
  if (input.skill === "獵殺標記" && successfulHit) {
    statusApplications.push({
      kind: "hunterMark", level: rank,
      strength: rangerSkillRankValue(RANGER_ACTIVE_RULES.獵殺標記.criticalChanceBonus, rank),
    });
  }
  const action = resolveSkillAction(session, {
    kind: rule ? "skill" : "normal", hits: input.hits, successfulStatuses: statusApplications,
  }, input.now);
  session = action.session;

  const damageSegmentPercents = input.skill === "疾風連射"
    ? Array.from({ length: 5 }, () => rangerSkillRankValue(RANGER_ACTIVE_RULES.疾風連射.damagePerArrow, rank))
    : rule && "damage" in rule ? [rangerSkillRankValue(rule.damage, rank)]
      : input.skill === "normal" ? [100] : [];
  const totalDamagePercent = input.skill === "蒼穹箭雨"
    ? rangerSkillRankValue(RANGER_ACTIVE_RULES.蒼穹箭雨.totalDamage, rank) : 0;
  const additionalArrowPercent = input.skill === "疾風連射"
    && input.ascended.has("疾風連射") && input.hits.every((hit) => hit.hit)
    ? RANGER_ACTIVE_RULES.疾風連射.sixthArrowDamage : 0;
  const skyMarks = input.skill === "蒼穹箭雨" && input.ascended.has("蒼穹箭雨")
    ? input.hits.slice(0, 8).filter((hit) => hit.hit && hit.critical).length : 0;
  const ignoreDefensePercent = (input.skill === "穿雲箭"
    ? rangerSkillRankValue(RANGER_ACTIVE_RULES.穿雲箭.ignoreDefense, rank) : 0)
    + (rule && combat.nextSkillIgnoreDefensePending ? RANGER_ACTIVE_RULES.穿雲箭.nextSkillIgnoreDefense : 0);
  const nextSkillIgnoreDefensePending = input.skill === "穿雲箭" && input.ascended.has("穿雲箭")
    ? true : rule ? false : combat.nextSkillIgnoreDefensePending;
  const windDomain = input.skill === "風行領域"
    ? activateRangerWindDomain(rank, input.ascended.has("風行領域")) : wind.state;

  return {
    combat: { ...combat, session, windDomain, nextSkillIgnoreDefensePending },
    damageSegmentPercents,
    totalDamagePercent,
    additionalArrowPercent,
    skyMarks,
    mainArrowDamageBonusPercent: skyMarks * RANGER_ACTIVE_RULES.蒼穹箭雨.mainArrowDamagePerMark,
    ignoreDefensePercent,
    skillCriticalDamageBonusPercent: input.skill === "破星狙擊"
      ? rangerSkillRankValue(RANGER_ACTIVE_RULES.破星狙擊.criticalDamageBonus, rank) : 0,
    markedTargetCriticalChancePoints,
    attackSpeedBonusPercent: wind.attackSpeedBonusPercent,
    normalDamagePenaltyPercent: wind.normalDamagePenaltyPercent,
    statusApplications,
    dueTicks: [...settled.ticks, ...action.ticks],
  };
}
