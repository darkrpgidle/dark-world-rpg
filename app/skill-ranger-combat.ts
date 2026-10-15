// Ranger primary actions on the isolated skill-rework combat path.
// The caller applies direct HP damage and rolls each arrow's hit/critical.
import type { SkillBuild } from "./skill-rework";
import { balanceConfig } from "./balance-config";
import { hasCatalogItem } from "./mythic-data";
import {
  advanceCombatSession, createSkillCombatSession, resolveSkillAction, takeReadySkill,
  transitionCombatSession,
  trySkillProc,
  type SkillCombatSession, type StatusApplication,
} from "./skill-combat-session";
import { recoverOwnPrimaryCharge, recoverPrimaryAttackCharges, type CombatBoundary, type PrimaryAttackEvent } from "./skill-combat-queue";
import {
  RANGER_ACTIVE_RULES, activateRangerWindDomain, consumeRangerWindDomain,
  createRangerWindDomain, rangerSkillRankValue,
  type RangerActiveName, type RangerWindDomain,
} from "./skill-ranger-rules";
import {
  createRangerPassiveState, resolveRangerPassiveAttack, type RangerPassiveState,
} from "./skill-ranger-passives";
import { createRangerDefenseState, type RangerDefenseState } from "./skill-ranger-defense";

export type RangerCombat = {
  session: SkillCombatSession;
  build: SkillBuild;
  windDomain: RangerWindDomain;
  passives: RangerPassiveState;
  defense: RangerDefenseState;
  nextSkillIgnoreDefensePending: boolean;
  hunterMarkCriticalHits: number;
  hunterExplosionPending: boolean;
};

export function createRangerCombat(build: SkillBuild, level: number): RangerCombat {
  return {
    session: createSkillCombatSession(build, "遊俠", level),
    build: { ranks: { ...build.ranks }, activeSlots: [...build.activeSlots] },
    windDomain: createRangerWindDomain(),
    passives: createRangerPassiveState(),
    defense: createRangerDefenseState(),
    nextSkillIgnoreDefensePending: false,
    hunterMarkCriticalHits: 0,
    hunterExplosionPending: false,
  };
}

export function transitionRangerCombat(combat: RangerCombat, boundary: CombatBoundary): RangerCombat {
  const normalKill = boundary === "normal-kill";
  return {
    ...combat, session: transitionCombatSession(combat.session, boundary),
    windDomain: normalKill ? combat.windDomain : createRangerWindDomain(),
    passives: normalKill ? combat.passives : createRangerPassiveState(),
    defense: normalKill ? combat.defense : createRangerDefenseState(),
    nextSkillIgnoreDefensePending: normalKill && combat.nextSkillIgnoreDefensePending,
    hunterMarkCriticalHits: 0, hunterExplosionPending: false,
  };
}

export function transitionRangerNormalKill(combat: RangerCombat): RangerCombat {
  return transitionRangerCombat(combat, "normal-kill");
}

export type RangerTurnInput = {
  skill: RangerActiveName | "normal";
  hits: PrimaryAttackEvent["hits"];
  now: number;
  ascended: ReadonlySet<RangerActiveName>;
  roll?: () => number;
  equippedItems?: { mythicId?: string; legendaryId?: string; name?: string }[];
};

export type RangerTurnResult = {
  combat: RangerCombat;
  damageSegmentPercents: number[];
  // Each landed segment uses its own multiplier; the ninth is the main arrow.
  totalDamagePercent: number;
  additionalArrowPercent: number;
  additionalArrowEvents: { id: "風痕追獵" | "六重風葬"; percent: number }[];
  hunterExplosionEvents: { id: "死亡鎖定"; percent: number }[];
  attackChargeRecovered: number;
  tailwindChargeReductionChancePercent: number;
  tailwindChargeReductionTriggered: boolean;
  tailwindChargeRecovered: number;
  skyMarks: number;
  mainArrowDamageBonusPercent: number;
  damageBonusPercent: number;
  criticalDirectDamageBonusPercentBySegment: number[];
  criticalChancePoints: number;
  phantomNextSkillCriticalDamagePercent: number;
  dodgeChancePoints: number;
  passiveDamageProcs: { id: "乘風閃擊" | "蒼穹餘響"; percent: number }[];
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
  const feathers = hasCatalogItem(input.equippedItems ?? [], "skill-ranger-thousand-feathers");
  const volleyCount = feathers ? balanceConfig.equipment.skillMythics.thousandFeathers.arrows : RANGER_ACTIVE_RULES.疾風連射.arrows;
  if (input.skill === "疾風連射" && input.hits.length !== volleyCount) return null;
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
  const phantomNextHitCriticalChancePoints = combat.defense.nextHitCriticalChancePoints;
  const phantomNextSkillCriticalDamagePercent = rule && combat.defense.nextSkillCriticalDamagePending
    ? RANGER_ACTIVE_RULES.幻影步.nextSkillCritDamage : 0;
  const wind = consumeRangerWindDomain(combat.windDomain, {
    kind: rule ? "skill" : "normal", hits: input.hits,
  });
  const successfulHit = input.hits.some((hit) => hit.hit);
  // A pending explosion belongs to the next active cast. A miss consumes that
  // cast without dealing damage; a proc cannot count as another primary attack.
  const hunterExplosionEvents: RangerTurnResult["hunterExplosionEvents"] =
    rule && combat.hunterExplosionPending && successfulHit
      ? [{ id: "死亡鎖定", percent: RANGER_ACTIVE_RULES.獵殺標記.huntExplosionDamage }] : [];
  const markedCriticalHits = session.enemy.hunterMark && input.ascended.has("獵殺標記")
    && (combat.build.ranks["獵殺標記"] ?? 0) > 0
    ? input.hits.filter((hit) => hit.hit && hit.critical).length : 0;
  const priorCriticalHits = session.enemy.hunterMark ? combat.hunterMarkCriticalHits : 0;
  // Each arrow can crit, but all of them still form just one skill cast.
  const totalCriticalHits = priorCriticalHits + markedCriticalHits;
  const hunterExplosionPending = totalCriticalHits >= RANGER_ACTIVE_RULES.獵殺標記.criticalsRequired;
  const hunterMarkCriticalHits = input.skill === "獵殺標記" && successfulHit
    ? 0 : hunterExplosionPending ? 0 : totalCriticalHits;
  const passive = resolveRangerPassiveAttack(combat.passives, combat.build, {
    kind: rule ? "skill" : "normal",
    category: rule?.category,
    hits: input.hits,
    targetMarked: Boolean(session.enemy.hunterMark),
    isUltimate: input.skill === "蒼穹箭雨",
  });
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
  const snipeCrit = input.skill === "破星狙擊"
    && input.ascended.has("破星狙擊")
    && input.hits.some((hit) => hit.hit && hit.critical);
  const attackChargeRecovered = snipeCrit ? RANGER_ACTIVE_RULES.破星狙擊.ascendedChargeRecovery : 0;
  if (attackChargeRecovered) {
    session = { ...session, charge: recoverPrimaryAttackCharges(session.charge, attackChargeRecovered) };
  }
  const tailwindChargeReductionChancePercent = input.skill === "追風箭"
    && input.hits.some((hit) => hit.hit && hit.critical)
    ? rangerSkillRankValue(RANGER_ACTIVE_RULES.追風箭.chargeReductionChance, rank) : 0;
  const tailwindChargeReductionTriggered = tailwindChargeReductionChancePercent > 0
    && (input.roll ?? Math.random)() * 100 < tailwindChargeReductionChancePercent;
  const tailwindChargeRecovered = tailwindChargeReductionTriggered
    ? RANGER_ACTIVE_RULES.追風箭.recoveredOwnCharge : 0;
  if (tailwindChargeRecovered) {
    session = { ...session, charge: recoverOwnPrimaryCharge(session.charge, "追風箭", tailwindChargeRecovered) };
  }
  const passiveDamageProcs: RangerTurnResult["passiveDamageProcs"] = [];
  for (const candidate of passive.damageCandidates) {
    const checked = trySkillProc(session, { id: candidate.id, kind: "damage", source: "primary", family: "passive" });
    session = checked.session;
    if (checked.allowed) passiveDamageProcs.push(candidate);
  }

  const damageSegmentPercents = input.skill === "疾風連射"
    ? Array.from({ length: volleyCount }, () => rangerSkillRankValue(RANGER_ACTIVE_RULES.疾風連射.damagePerArrow, rank)
      * (feathers ? RANGER_ACTIVE_RULES.疾風連射.arrows / volleyCount
        * (1 + balanceConfig.equipment.skillMythics.thousandFeathers.totalDamageBonusPercent / 100) : 1))
    : input.skill === "蒼穹箭雨"
      ? [
        ...Array.from({ length: RANGER_ACTIVE_RULES.蒼穹箭雨.rainArrows },
          () => rangerSkillRankValue(RANGER_ACTIVE_RULES.蒼穹箭雨.rainArrowDamage, rank)),
        rangerSkillRankValue(RANGER_ACTIVE_RULES.蒼穹箭雨.totalDamage, rank)
          - RANGER_ACTIVE_RULES.蒼穹箭雨.rainArrows
          * rangerSkillRankValue(RANGER_ACTIVE_RULES.蒼穹箭雨.rainArrowDamage, rank),
      ]
    : rule && "damage" in rule ? [rangerSkillRankValue(rule.damage, rank)]
      : input.skill === "normal" ? [100] : [];
  const totalDamagePercent = input.skill === "蒼穹箭雨"
    ? rangerSkillRankValue(RANGER_ACTIVE_RULES.蒼穹箭雨.totalDamage, rank) : 0;
  const rapidSixthArrow = input.skill === "疾風連射"
    && input.ascended.has("疾風連射") && input.hits.slice(0, RANGER_ACTIVE_RULES.疾風連射.arrows).every((hit) => hit.hit)
    ? RANGER_ACTIVE_RULES.疾風連射.sixthArrowDamage : 0;
  const tailwindArrow = input.skill === "追風箭" && input.ascended.has("追風箭")
    && input.hits.some((hit) => hit.hit && hit.critical)
    ? RANGER_ACTIVE_RULES.追風箭.ascendedArrowDamage : 0;
  const additionalArrowEvents: RangerTurnResult["additionalArrowEvents"] = [
    ...(rapidSixthArrow ? [{ id: "六重風葬" as const, percent: rapidSixthArrow }] : []),
    ...(tailwindArrow ? [{ id: "風痕追獵" as const, percent: tailwindArrow }] : []),
  ];
  const skyMarks = input.skill === "蒼穹箭雨" && input.ascended.has("蒼穹箭雨")
    ? input.hits.slice(0, 8).filter((hit) => hit.hit && hit.critical).length : 0;
  const ignoreDefensePercent = (input.skill === "穿雲箭"
    ? hasCatalogItem(input.equippedItems ?? [], "skill-ranger-sky-piercer")
      ? balanceConfig.equipment.skillMythics.skyPiercer.ignoreDefensePercent
      : rangerSkillRankValue(RANGER_ACTIVE_RULES.穿雲箭.ignoreDefense, rank) : 0)
    + (rule && combat.nextSkillIgnoreDefensePending ? RANGER_ACTIVE_RULES.穿雲箭.nextSkillIgnoreDefense : 0);
  const nextSkillIgnoreDefensePending = input.skill === "穿雲箭" && input.ascended.has("穿雲箭")
    ? true : rule ? false : combat.nextSkillIgnoreDefensePending;
  const windDomain = input.skill === "風行領域"
    ? activateRangerWindDomain(rank, input.ascended.has("風行領域")) : wind.state;
  const defense: RangerDefenseState = {
    ...combat.defense,
    nextHitCriticalChancePoints: successfulHit ? 0 : phantomNextHitCriticalChancePoints,
    nextSkillCriticalDamagePending: rule ? false : combat.defense.nextSkillCriticalDamagePending,
  };

  return {
    combat: {
      ...combat, session, windDomain, nextSkillIgnoreDefensePending, passives: passive.state, defense,
      hunterMarkCriticalHits,
      hunterExplosionPending: hunterExplosionPending || (!rule && combat.hunterExplosionPending),
    },
    damageSegmentPercents,
    totalDamagePercent,
    additionalArrowPercent: rapidSixthArrow || tailwindArrow,
    additionalArrowEvents,
    hunterExplosionEvents,
    attackChargeRecovered,
    tailwindChargeReductionChancePercent,
    tailwindChargeReductionTriggered,
    tailwindChargeRecovered,
    skyMarks,
    mainArrowDamageBonusPercent: input.skill === "蒼穹箭雨" && input.hits[8]?.hit
      ? skyMarks * RANGER_ACTIVE_RULES.蒼穹箭雨.mainArrowDamagePerMark : 0,
    damageBonusPercent: passive.damageBonusPercent,
    criticalDirectDamageBonusPercentBySegment: passive.criticalDirectDamageBonusPercentBySegment,
    criticalChancePoints: passive.criticalChancePoints + markedTargetCriticalChancePoints
      + phantomNextHitCriticalChancePoints,
    phantomNextSkillCriticalDamagePercent,
    dodgeChancePoints: passive.dodgeChancePoints,
    passiveDamageProcs,
    ignoreDefensePercent,
    skillCriticalDamageBonusPercent: input.skill === "破星狙擊"
      ? rangerSkillRankValue(RANGER_ACTIVE_RULES.破星狙擊.criticalDamageBonus, rank) : 0,
    markedTargetCriticalChancePoints,
    attackSpeedBonusPercent: wind.attackSpeedBonusPercent + passive.attackSpeedBonusPercent,
    normalDamagePenaltyPercent: wind.normalDamagePenaltyPercent,
    statusApplications,
    dueTicks: [...settled.ticks, ...action.ticks],
  };
}

