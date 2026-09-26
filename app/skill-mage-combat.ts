// Stage 19: mage primary actions on the isolated reworked combat path.
// The caller rolls each hit/critical, applies HP damage and plays VFX.
import type { SkillBuild } from "./skill-rework";
import { grantUltimateEnergy, type CombatBoundary, type PrimaryAttackEvent } from "./skill-combat-queue";
import {
  advanceCombatSession, createSkillCombatSession, resolveSkillAction,
  takeReadySkill, transitionCombatSession, trySkillProc,
  type SkillCombatSession, type StatusApplication,
} from "./skill-combat-session";
import {
  MAGE_ACTIVE_RULES, activateMageOverload, addMageOverloadStability,
  clearMageExhaustion, consumeMageOverload, createMageOverload,
  mageSkillRankValue, type MageActiveName, type MageOverloadState,
} from "./skill-mage-rules";
import { countMageAbnormalKinds, resolveMagePassiveAttack } from "./skill-mage-passives";
import { consumeMageShieldActiveCast, createMageShieldState, type MageShieldState } from "./skill-mage-shield";
import {
  consumeMageSigilActiveCast, createMageSigilState, recordMageSigilStatuses,
  transitionMageSigilTarget, type MageSigilState,
} from "./skill-mage-sigil";

export type MageCombat = {
  session: SkillCombatSession;
  build: SkillBuild;
  overload: MageOverloadState;
  shield: MageShieldState;
  sigil: MageSigilState;
};

export function createMageCombat(build: SkillBuild, level: number): MageCombat {
  return {
    session: createSkillCombatSession(build, "法師", level),
    build: { ranks: { ...build.ranks }, activeSlots: [...build.activeSlots] },
    overload: createMageOverload(),
    shield: createMageShieldState(),
    sigil: createMageSigilState(),
  };
}

export function transitionMageCombat(combat: MageCombat, boundary: CombatBoundary): MageCombat {
  return {
    ...combat,
    session: transitionCombatSession(combat.session, boundary),
    overload: boundary === "normal-kill" ? combat.overload : createMageOverload(),
    shield: boundary === "normal-kill" ? combat.shield : createMageShieldState(),
    sigil: boundary === "normal-kill"
      ? transitionMageSigilTarget(combat.sigil, false) : createMageSigilState(),
  };
}

// Sources of stability and exhaustion recovery are awaiting specification.
// Expose only explicit event entry points: no hit implicitly grants a stack,
// and no elapsed time or normal attack implicitly clears exhaustion.
export function recordMageStability(combat: MageCombat, stacks: number): MageCombat {
  return { ...combat, overload: addMageOverloadStability(combat.overload, stacks) };
}

export function clearMageCombatExhaustion(combat: MageCombat): MageCombat {
  return { ...combat, overload: clearMageExhaustion(combat.overload) };
}

export type MageTurnInput = {
  skill: MageActiveName | "normal";
  hits: PrimaryAttackEvent["hits"];
  now: number;
  ascended: ReadonlySet<MageActiveName>;
  roll?: () => number;
  finalExplosionConfirmed?: boolean; // final original ultimate segment was the explosion
};

export type MageTurnResult = {
  combat: MageCombat;
  // These values describe potential damage for each original segment. The
  // actual hit/critical outcomes and HP reduction belong to the caller.
  damageSegmentPercents: number[];
  // The caller resolves each ascension segment's own hit/crit, HP damage and
  // VFX after the indicated original segment. These are not primary actions.
  ascensionDamageEvents: {
    id: "極炎霜爆" | "星環共鳴" | "天火墜星";
    percent: number;
    afterOriginalSegment: number;
  }[];
  // Ultimate has a total multiplier, but its individual segments are unknown.
  totalDamagePercent: number;
  conditionalDamageBonusPercent: number;
  voidAscensionDamageBonusPercent: number;
  ultimateCollapseStacks: number;
  // Applied only to the explicitly confirmed final original explosion, not
  // to totalDamagePercent (individual ultimate multipliers are not defined).
  finalExplosionDamageBonusPercent: number;
  burnChancePercent: number;
  statusApplications: StatusApplication[];
  dueTicks: ReturnType<typeof advanceCombatSession>["ticks"];
  skillEfficiencyBonusPercent: number;
  skillDamagePenaltyPercent: number;
  passiveDirectDamageBonusPercent: number;
  passiveStatusChancePoints: number;
  passiveUltimateEnergyGain: number;
  abnormalKindsCounted: number;
  passiveDamageProcs: { id: "餘燼回響" | "星界回爆"; percent: number }[];
  shieldAscensionDamageBonusPercent: number;
  sigilAscensionStatusChancePoints: number;
};

export function resolveMageTurn(combat: MageCombat, input: MageTurnInput): MageTurnResult | null {
  if (input.skill === "魔力護盾") return null; // enemy/HP event, handled in stage 21
  const isActive = input.skill !== "normal";
  const rank = isActive ? combat.build.ranks[input.skill] ?? 0 : 0;
  if (isActive && !rank) return null;
  if (input.skill === "奧術飛彈") {
    if (input.hits.length !== MAGE_ACTIVE_RULES.奧術飛彈.missiles) return null;
  } else if (input.skill === "奧術超載") {
    if (input.hits.length !== 0) return null;
  } else if (input.skill === "星界寂滅") {
    if (input.hits.length === 0) return null;
  } else if (input.hits.length !== 1) {
    return null;
  }

  const settled = advanceCombatSession(combat.session, input.now);
  let session = settled.session;
  // The specification does not define recasting overload before its current
  // state is resolved. Preserve its ready position and allow other skills.
  const blocked = combat.overload.phase === "idle" ? new Set<string>() : new Set(["奧術超載"]);
  const selected = takeReadySkill(session, true, blocked);
  if (isActive) {
    if (!selected || selected.skill !== input.skill) return null;
    session = selected.session;
  } else if (selected) {
    return null;
  }

  const successfulHit = input.hits.some((hit) => hit.hit);
  // Check the enemy state before this cast applies any new status. Delayed
  // ticks are already settled and expired statuses are no longer counted.
  const markActiveAtStart = Boolean(session.enemy.elementSigil);
  const targetBurningAtStart = Boolean(session.enemy.burn);
  const targetHadSigil = session.enemy.elementSigil?.strength ?? 0;
  const currentSigil = transitionMageSigilTarget(combat.sigil, markActiveAtStart);
  // Consume a previously granted buff before this cast may grant a new one.
  const sigilCast = consumeMageSigilActiveCast(currentSigil, isActive);
  const distinctAbnormalKinds = countMageAbnormalKinds(session.enemy);
  const targetAbnormal = distinctAbnormalKinds > 0;
  const conditionalDamageBonusPercent = input.skill === "虛空崩解" && targetAbnormal
    ? mageSkillRankValue(MAGE_ACTIVE_RULES.虛空崩解.damageBonusVsStatus, rank) : 0;
  const voidAscensionDamageBonusPercent = input.skill === "虛空崩解"
    && input.ascended.has("虛空崩解") && successfulHit
    ? Math.min(distinctAbnormalKinds, MAGE_ACTIVE_RULES.虛空崩解.maxDistinctStatuses)
      * MAGE_ACTIVE_RULES.虛空崩解.damagePerDistinctStatus : 0;
  // The caller must identify the final original explosion. Without that
  // signal, there is no safe way to distinguish a preceding hit from it.
  const ultimateCollapseStacks = input.skill === "星界寂滅"
    && input.ascended.has("星界寂滅") && input.finalExplosionConfirmed
    ? Math.min(input.hits.slice(0, -1).filter((hit) => hit.hit).length,
      MAGE_ACTIVE_RULES.星界寂滅.maxCollapseStacks) : 0;
  const finalExplosionDamageBonusPercent = input.skill === "星界寂滅"
    && input.finalExplosionConfirmed && input.hits.at(-1)?.hit
    ? ultimateCollapseStacks * MAGE_ACTIVE_RULES.星界寂滅.finalExplosionDamagePerStack : 0;
  // Consume one of the three later active casts even on a miss or a status
  // cast; a normal attack never spends this buff.
  const shieldCast = consumeMageShieldActiveCast(combat.shield, isActive);

  const passive = resolveMagePassiveAttack(combat.build, {
    kind: isActive ? "skill" : "normal", hits: input.hits,
    targetStatuses: session.enemy, shieldValue: combat.shield.value,
    hasDirectDamage: input.skill === "normal" || input.skill === "霜火新星"
      || input.skill === "奧術飛彈" || input.skill === "隕星術"
      || input.skill === "虛空崩解" || input.skill === "星界寂滅",
    isUltimate: input.skill === "星界寂滅",
    finalExplosionConfirmed: input.finalExplosionConfirmed ?? false,
    roll: input.roll ?? Math.random,
  });

  const statusApplications: StatusApplication[] = [...passive.statuses];
  let burnChancePercent = 0;
  if (successfulHit && (input.skill === "霜火新星" || input.skill === "隕星術")) {
    const chances = input.skill === "霜火新星"
      ? MAGE_ACTIVE_RULES.霜火新星.burnChance : MAGE_ACTIVE_RULES.隕星術.burnChance;
    burnChancePercent = Math.min(100, mageSkillRankValue(chances, rank)
      + targetHadSigil + passive.activeStatusChancePoints + sigilCast.statusChancePoints);
    // A multi-segment cast receives one status roll per status category.
    if ((input.roll ?? Math.random)() * 100 < burnChancePercent) {
      statusApplications.push({ kind: "burn" });
    }
  }
  if (input.skill === "元素蝕印" && successfulHit) {
    statusApplications.push({
      kind: "elementSigil", level: rank,
      strength: mageSkillRankValue(MAGE_ACTIVE_RULES.元素蝕印.statusChancePoints, rank),
    });
  }

  const action = resolveSkillAction(session, {
    kind: isActive ? "skill" : "normal", hits: input.hits,
    successfulStatuses: statusApplications,
  }, input.now);
  session = action.session;
  const sigil = recordMageSigilStatuses(sigilCast.state, {
    hadCurrentSigil: markActiveAtStart,
    appliedKinds: statusApplications.map((status) => status.kind),
    newlyAppliedSigilAscended: input.skill === "元素蝕印" && input.ascended.has("元素蝕印"),
  });
  if (passive.ultimateEnergyGain) {
    session = { ...session, charge: grantUltimateEnergy(session.charge, passive.ultimateEnergyGain) };
  }
  const passiveDamageProcs: MageTurnResult["passiveDamageProcs"] = [];
  for (const candidate of passive.damageCandidates) {
    const checked = trySkillProc(session, { id: candidate.id, kind: "damage", source: "primary", family: "passive" });
    session = checked.session;
    if (checked.allowed) passiveDamageProcs.push(candidate);
  }

  // Overload activation itself has no target hit and does not consume one of
  // its six following successful active casts. Other skills consume at most
  // once even when several of their original segments connect.
  const overloadResult = input.skill === "奧術超載" ? null : consumeMageOverload(combat.overload, {
    kind: isActive ? "skill" : "normal", hits: input.hits,
  }, combat.build.ranks["枯竭控制"] ?? 0);
  const overload = input.skill === "奧術超載"
    ? activateMageOverload(rank, input.ascended.has("奧術超載"))
    : overloadResult!.state;

  const damageSegmentPercents = input.skill === "奧術飛彈"
    ? Array.from({ length: MAGE_ACTIVE_RULES.奧術飛彈.missiles },
      () => mageSkillRankValue(MAGE_ACTIVE_RULES.奧術飛彈.damagePerMissile, rank))
    : input.skill === "霜火新星" || input.skill === "隕星術" || input.skill === "虛空崩解"
      ? [mageSkillRankValue(MAGE_ACTIVE_RULES[input.skill].damage, rank)]
      : input.skill === "normal" ? [100] : [];
  const ascensionDamageEvents: MageTurnResult["ascensionDamageEvents"] = [];
  if (input.skill !== "normal" && input.ascended.has(input.skill)) {
    if (input.skill === "霜火新星" && successfulHit && targetBurningAtStart) {
      ascensionDamageEvents.push({
        id: "極炎霜爆", percent: MAGE_ACTIVE_RULES.霜火新星.afterburstDamage, afterOriginalSegment: 1,
      });
    } else if (input.skill === "奧術飛彈" && input.hits.every((hit) => hit.hit)) {
      ascensionDamageEvents.push({
        id: "星環共鳴", percent: MAGE_ACTIVE_RULES.奧術飛彈.resonanceMissileDamage,
        afterOriginalSegment: MAGE_ACTIVE_RULES.奧術飛彈.missiles,
      });
    } else if (input.skill === "隕星術" && successfulHit && targetBurningAtStart) {
      ascensionDamageEvents.push({
        id: "天火墜星", percent: MAGE_ACTIVE_RULES.隕星術.emberExplosionDamage, afterOriginalSegment: 1,
      });
    }
  }

  return {
    combat: { ...combat, session, overload, shield: shieldCast.state, sigil },
    damageSegmentPercents,
    ascensionDamageEvents,
    totalDamagePercent: input.skill === "星界寂滅"
      ? mageSkillRankValue(MAGE_ACTIVE_RULES.星界寂滅.totalDamage, rank) : 0,
    conditionalDamageBonusPercent,
    voidAscensionDamageBonusPercent,
    ultimateCollapseStacks,
    finalExplosionDamageBonusPercent,
    burnChancePercent,
    statusApplications,
    dueTicks: [...settled.ticks, ...action.ticks],
    skillEfficiencyBonusPercent: overloadResult?.skillEfficiencyBonusPercent ?? 0,
    skillDamagePenaltyPercent: overloadResult?.skillDamagePenaltyPercent ?? 0,
    passiveDirectDamageBonusPercent: passive.directDamageBonusPercent,
    passiveStatusChancePoints: passive.activeStatusChancePoints,
    passiveUltimateEnergyGain: passive.ultimateEnergyGain,
    abnormalKindsCounted: passive.abnormalCount,
    passiveDamageProcs,
    shieldAscensionDamageBonusPercent: shieldCast.activeDamageBonusPercent,
    sigilAscensionStatusChancePoints: sigilCast.statusChancePoints,
  };
}
