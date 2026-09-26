// Mage passives on the isolated rework event path; actual damage and shields
// remain the caller's responsibility. One call describes one original cast.
import type { SkillBuild } from "./skill-rework";
import type { PrimaryAttackEvent } from "./skill-combat-queue";
import type { EnemyDebuffs } from "./skill-debuff-timer";
import type { StatusApplication } from "./skill-combat-session";
import { MAGE_PASSIVE_RULES, mageSkillRankValue, type MagePassiveName } from "./skill-mage-rules";

function value(build: SkillBuild, name: MagePassiveName, key: string): number {
  const rank = build.ranks[name] ?? 0;
  if (!rank) return 0;
  const values = (MAGE_PASSIVE_RULES[name] as unknown as Record<string, readonly number[]>)[key];
  if (!values) throw new RangeError("Unknown mage passive value");
  return mageSkillRankValue(values, rank);
}

// The stage-21 HP and shield adapter consumes these values when a fresh
// shield is created. An existing shield is never retroactively refilled.
export function magePassiveStats(build: SkillBuild) {
  return {
    maxHealthBonusPercent: value(build, "星界護體", "maxHealthBonus"),
    initialShieldBonusPercent: value(build, "屏障續航", "initialShieldBonus"),
  };
}

export type MagePassiveAttackInput = {
  kind: PrimaryAttackEvent["kind"];
  hits: PrimaryAttackEvent["hits"];
  targetStatuses: EnemyDebuffs; // snapshot before this cast applies new statuses
  shieldValue: number; // current shield at event start, supplied by shield adapter
  hasDirectDamage: boolean;
  isUltimate: boolean;
  finalExplosionConfirmed: boolean; // last original segment is the final explosion
  roll: () => number;
};

export function resolveMagePassiveAttack(build: SkillBuild, input: MagePassiveAttackInput) {
  const hit = input.hits.some((segment) => segment.hit);
  const activeHit = input.kind === "skill" && hit;
  const directHit = activeHit && input.hasDirectDamage;
  const targetBurning = Boolean(input.targetStatuses.burn);
  // Different abnormal categories count once each. Brands/marks are not
  // themselves abnormalities; stage 27 will unify this classification.
  const abnormalKinds = ["bleed", "burn", "armorBreak", "elementSigil"] as const;
  const abnormalCount = Math.min(MAGE_PASSIVE_RULES.元素共振.maxDistinctStatuses,
    abnormalKinds.filter((kind) => Boolean(input.targetStatuses[kind])).length);

  const statuses: StatusApplication[] = [];
  const normalBurnChance = value(build, "焰脈", "normalBurnChance");
  const markedBurnChance = normalBurnChance > 0
    ? Math.min(100, normalBurnChance + (input.targetStatuses.elementSigil?.strength ?? 0)) : 0;
  if (input.kind === "normal" && hit && markedBurnChance > 0 && input.roll() * 100 < markedBurnChance) {
    statuses.push({ kind: "burn" });
  }

  const damageCandidates: { id: "餘燼回響" | "星界回爆"; percent: number }[] = [];
  const echoDamage = value(build, "餘燼回響", "extraDamage");
  if (directHit && targetBurning && echoDamage > 0
    && input.roll() * 100 < MAGE_PASSIVE_RULES.餘燼回響.procChance) {
    damageCandidates.push({ id: "餘燼回響", percent: echoDamage });
  }
  // No assumed ultimate segment count: the adapter must explicitly confirm
  // that the last original hit was the final explosion, not an earlier beam.
  const ultimateEcho = value(build, "星界回爆", "ultimateFinalExplosionExtraDamage");
  if (input.isUltimate && directHit && input.finalExplosionConfirmed
    && input.hits.at(-1)?.hit && ultimateEcho > 0) {
    damageCandidates.push({ id: "星界回爆", percent: ultimateEcho });
  }

  return {
    statuses,
    directDamageBonusPercent: directHit
      ? value(build, "奧術感知", "activeDirectDamageBonus")
        + (targetBurning ? value(build, "燃燼導引", "activeDirectDamageVsBurn") : 0)
        + (input.shieldValue > 0 ? value(build, "護盾轉流", "activeDirectDamageWithShield") : 0)
        + abnormalCount * value(build, "元素共振", "activeDirectDamagePerStatus")
      : 0,
    activeStatusChancePoints: input.kind === "skill"
      ? value(build, "精密咒式", "activeStatusChancePoints") : 0,
    ultimateEnergyGain: activeHit ? value(build, "奧術循環", "ultimateEnergyPerSuccessfulCast") : 0,
    damageCandidates,
    abnormalCount,
  };
}
