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
  advanceMageOverload, mageSkillRankValue, type MageActiveName, type MageOverloadState,
} from "./skill-mage-rules";
import { countEnemyAbnormalKinds, calculateDebuffTickRawDamage } from "./skill-debuff-timer";
import { balanceConfig } from "./balance-config";
import { resolveMagePassiveAttack } from "./skill-mage-passives";
import { equippedSkillMythic } from "./mythic-data";
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
  shieldActivatedThisBattle: boolean;
  sigil: MageSigilState;
};

export function createMageCombat(build: SkillBuild, level: number): MageCombat {
  return {
    session: createSkillCombatSession(build, "法師", level),
    build: { ranks: { ...build.ranks }, activeSlots: [...build.activeSlots] },
    overload: createMageOverload(),
    shield: createMageShieldState(),
    shieldActivatedThisBattle: false,
    sigil: createMageSigilState(),
  };
}

export function transitionMageCombat(combat: MageCombat, boundary: CombatBoundary): MageCombat {
  return {
    ...combat,
    session: transitionCombatSession(combat.session, boundary),
    overload: boundary === "normal-kill" ? combat.overload : createMageOverload(),
    shield: boundary === "normal-kill" ? combat.shield : createMageShieldState(),
    shieldActivatedThisBattle: false,
    sigil: boundary === "normal-kill"
      ? transitionMageSigilTarget(combat.sigil, false) : createMageSigilState(),
  };
}

// Explicit administrative reset helpers; live casts award original-hit stability
// and wall-clock advancement releases five-second exhaustion.
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
  equippedItems?: { mythicId?: string; legendaryId?: string; name?: string }[];
  attackSnapshot?: number;
  burnAttackSnapshot?: number;
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
    id: "極炎霜爆" | "雷環共鳴" | "天火墜星";
    percent: number;
    afterOriginalSegment: number;
  }[];
  // The ultimate keeps its total multiplier alongside six beams and the final explosion.
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
  passiveDirectDamageMultiplier: number;
  equipmentSkillDamageBonusPercent: number;
  equipmentBurnDetonationDamage: number;
  passiveStatusChanceBonus: number;
  passiveUltimateEnergyGain: number;
  abnormalKindsCounted: number;
  passiveDamageProcs: { id: "餘燼回響" | "星界回爆"; percent: number }[];
  // A second meteor is resolved by the caller as its own hit/crit and VFX.
  // Its 70% is based on the original meteor's base multiplier, before crit.
  equipmentDamageEvents: {
    id: "滅世星雨";
    percent: number;
    guaranteedCritical: true;
    afterOriginalSegment: 1;
  }[];
  shieldAscensionDamageBonusPercent: number;
  sigilAscensionStatusChancePoints: number;
};

export function resolveMageTurn(combat: MageCombat, input: MageTurnInput): MageTurnResult | null {
  if (input.skill === "魔力護盾") return null; // enemy/HP event, handled in stage 21
  const isActive = input.skill !== "normal";
  const rank = isActive ? combat.build.ranks[input.skill] ?? 0 : 0;
  if (isActive && !rank) return null;
  if (input.skill === "閃電鏈") {
    if (input.hits.length !== MAGE_ACTIVE_RULES.閃電鏈.missiles) return null;
  } else if (input.skill === "奧術超載") {
    if (input.hits.length !== 0) return null;
  } else if (input.skill === "星界寂滅") {
    if (input.hits.length !== MAGE_ACTIVE_RULES.星界寂滅.beamCount + 1) return null;
  } else if (input.hits.length !== 1) {
    return null;
  }

  combat = { ...combat, overload: advanceMageOverload(combat.overload, input.now) };
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
  const priorBurn = session.enemy.burn;
  let equipmentBurnDetonationDamage = 0;
  if (input.skill === "霜火新星" && successfulHit && priorBurn?.nextTickAt !== undefined
      && equippedSkillMythic(input.equippedItems ?? [], "霜火新星")?.id === "skill-mage-polar-staff") {
    const remainingTicks = Math.max(0, Math.floor((priorBurn.expiresAt - priorBurn.nextTickAt) / 1000) + 1);
    equipmentBurnDetonationDamage = remainingTicks * calculateDebuffTickRawDamage({
      kind: "burn", at: priorBurn.nextTickAt, stacks: priorBurn.stacks, effectMultiplier: priorBurn.effectMultiplier,
    }, input.burnAttackSnapshot ?? input.attackSnapshot ?? 0) * balanceConfig.equipment.skillMythics.polarStaff.remainingBurnMultiplier;
    // Due ticks were settled above; consume only the old future ticks. This
    // cast may subsequently apply a fresh burn with its own snapshot.
  }
  const targetHadSigil = session.enemy.elementSigil?.strength ?? 0;
  const currentSigil = transitionMageSigilTarget(combat.sigil, markActiveAtStart);
  // Consume a previously granted buff before this cast may grant a new one.
  const sigilCast = consumeMageSigilActiveCast(currentSigil, isActive);
  const distinctAbnormalKinds = countEnemyAbnormalKinds(session.enemy);
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

  const hasDirectDamage = input.skill === "normal" || input.skill === "霜火新星"
    || input.skill === "閃電鏈" || input.skill === "隕星術"
    || input.skill === "虛空崩解" || input.skill === "星界寂滅";
  const equipmentSkillDamageBonusPercent = isActive && hasDirectDamage && combat.shield.value > 0
    && equippedSkillMythic(input.equippedItems ?? [], "魔力護盾")?.id === "skill-mage-eternal-core"
    ? 25 : 0;
  const passive = resolveMagePassiveAttack(combat.build, {
    kind: isActive ? "skill" : "normal", hits: input.hits,
    targetStatuses: session.enemy, shieldValue: combat.shield.value,
    hasDirectDamage,
    isUltimate: input.skill === "星界寂滅",
    finalExplosionConfirmed: input.finalExplosionConfirmed ?? false,
    roll: input.roll ?? Math.random,
  });

  const statusApplications: StatusApplication[] = [...passive.statuses];
  let burnChancePercent = 0;
  const roll = input.roll ?? Math.random;
  const precisionMultiplier = 1 + passive.activeStatusChanceBonus / 100;
  const overloadBonus = combat.overload.phase === "overloaded" && isActive && input.skill !== "奧術超載"
    ? mageSkillRankValue(MAGE_ACTIVE_RULES.奧術超載.skillEfficiencyBonus, combat.overload.rank) : 0;
  const sigilEffectBonus = session.enemy.elementSigil?.effectBonusPercent ?? 0;
  const effectMultiplier = (1 + sigilEffectBonus / 100)
    * (1 + overloadBonus / 100);
  const statusChance = (base: number) => Math.min(100, (base + targetHadSigil + sigilCast.statusChancePoints) * precisionMultiplier);
  if (successfulHit && input.skill === "霜火新星") {
    burnChancePercent = statusChance(mageSkillRankValue(MAGE_ACTIVE_RULES.霜火新星.burnChance, rank));
    if (roll() * 100 < burnChancePercent) {
      const kind = roll() < 0.5 ? "burn" : "freeze";
      statusApplications.push({ kind, ...(effectMultiplier !== 1 ? { effectMultiplier } : {}),
        ...(kind === "freeze" && input.ascended.has("霜火新星") ? { freezeBurstPercent: MAGE_ACTIVE_RULES.霜火新星.afterburstDamage, attackSnapshot: input.attackSnapshot } : {}) });
    }
  }
  if (successfulHit && input.skill === "隕星術") {
    burnChancePercent = 100;
    statusApplications.push({ kind: "burn", ...(effectMultiplier !== 1 ? { effectMultiplier } : {}) });
  }
  if (input.skill === "閃電鏈") {
    for (const hit of input.hits) if (hit.hit && roll() * 100 < statusChance(MAGE_ACTIVE_RULES.閃電鏈.paralysisChance))
      statusApplications.push({ kind: "paralysis", ...(effectMultiplier !== 1 ? { effectMultiplier } : {}) });
  }
  for (const status of statusApplications) if (status.kind === "burn" && status.effectMultiplier === undefined && effectMultiplier !== 1) status.effectMultiplier = effectMultiplier;
  if (input.skill === "元素蝕印" && successfulHit) {
    statusApplications.push({
      kind: "elementSigil", level: rank,
      strength: mageSkillRankValue(MAGE_ACTIVE_RULES.元素蝕印.statusChancePoints, rank),
      effectBonusPercent: mageSkillRankValue(MAGE_ACTIVE_RULES.元素蝕印.statusEffectBonus, rank),
    });
  }

  if (equipmentBurnDetonationDamage > 0) {
    const { burn: consumed, ...enemy } = session.enemy;
    void consumed;
    session = { ...session, enemy };
  }
  const action = resolveSkillAction(session, {
    kind: isActive ? "skill" : "normal", hits: input.hits,
    successfulStatuses: statusApplications,
  }, input.now);
  session = action.session;
  if (equipmentBurnDetonationDamage > 0) {
    const proc = trySkillProc(session, { id: "skill-mage-polar-staff", kind: "damage", source: "primary", family: "equipment" });
    session = proc.session;
    if (!proc.allowed) equipmentBurnDetonationDamage = 0;
  }
  if (combat.overload.phase !== "idle" || input.skill === "奧術超載") {
    session = { ...session, charge: { ...session.charge,
      charges: { ...session.charge.charges, ...(session.charge.charges["奧術超載"] !== undefined ? { 奧術超載: 0 } : {}) },
      ready: session.charge.ready.filter((name) => name !== "奧術超載") } };
  }
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
  const overloadResult = input.skill === "奧術超載" ? null : consumeMageOverload(addMageOverloadStability(combat.overload, input.hits.filter((hit) => hit.hit).length), {
    kind: isActive ? "skill" : "normal", hits: input.hits,
  }, combat.build.ranks["枯竭控制"] ?? 0, input.now);
  const overload = input.skill === "奧術超載"
    ? activateMageOverload(rank, input.ascended.has("奧術超載"))
    : overloadResult!.state;

  const damageSegmentPercents = input.skill === "閃電鏈"
    ? Array.from({ length: MAGE_ACTIVE_RULES.閃電鏈.missiles },
      () => mageSkillRankValue(MAGE_ACTIVE_RULES.閃電鏈.damagePerMissile, rank))
    : input.skill === "星界寂滅"
      ? [
          ...Array.from({ length: MAGE_ACTIVE_RULES.星界寂滅.beamCount },
            () => mageSkillRankValue(MAGE_ACTIVE_RULES.星界寂滅.totalDamage, rank)
              * MAGE_ACTIVE_RULES.星界寂滅.beamDamageSharePercent / 100
              / MAGE_ACTIVE_RULES.星界寂滅.beamCount),
          mageSkillRankValue(MAGE_ACTIVE_RULES.星界寂滅.totalDamage, rank)
            * MAGE_ACTIVE_RULES.星界寂滅.finalExplosionDamageSharePercent / 100,
        ]
    : input.skill === "霜火新星" || input.skill === "隕星術" || input.skill === "虛空崩解"
      ? [mageSkillRankValue(MAGE_ACTIVE_RULES[input.skill].damage, rank)]
      : input.skill === "normal" ? [100] : [];
  const equipmentDamageEvents: MageTurnResult["equipmentDamageEvents"] = [];
  if (input.skill === "隕星術" && successfulHit
      && equippedSkillMythic(input.equippedItems ?? [], "隕星術")?.id === "skill-mage-cataclysm-crown"
      && (input.roll ?? Math.random)() < 0.35) {
    const checked = trySkillProc(session, {
      id: "skill-mage-cataclysm-crown", kind: "damage", source: "primary", family: "equipment",
    });
    session = checked.session;
    if (checked.allowed) equipmentDamageEvents.push({
      id: "滅世星雨", percent: damageSegmentPercents[0] * 0.7,
      guaranteedCritical: true, afterOriginalSegment: 1,
    });
  }
  const ascensionDamageEvents: MageTurnResult["ascensionDamageEvents"] = [];
  if (input.skill !== "normal" && input.ascended.has(input.skill)) {
    if (input.skill === "霜火新星" && successfulHit && targetBurningAtStart && !statusApplications.some((status) => status.kind === "freeze")) {
      ascensionDamageEvents.push({
        id: "極炎霜爆", percent: MAGE_ACTIVE_RULES.霜火新星.afterburstDamage, afterOriginalSegment: 1,
      });
    } else if (input.skill === "閃電鏈" && input.hits.every((hit) => hit.hit)) {
      ascensionDamageEvents.push({
        id: "雷環共鳴", percent: MAGE_ACTIVE_RULES.閃電鏈.resonanceMissileDamage,
        afterOriginalSegment: MAGE_ACTIVE_RULES.閃電鏈.missiles,
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
    equipmentDamageEvents,
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
    passiveDirectDamageMultiplier: passive.directDamageMultiplier,
    equipmentSkillDamageBonusPercent,
    equipmentBurnDetonationDamage,
    passiveStatusChanceBonus: passive.activeStatusChanceBonus,
    passiveUltimateEnergyGain: passive.ultimateEnergyGain,
    abnormalKindsCounted: passive.abnormalCount,
    passiveDamageProcs,
    shieldAscensionDamageBonusPercent: shieldCast.activeDamageBonusPercent,
    sigilAscensionStatusChancePoints: sigilCast.statusChancePoints,
  };
}
