// Skill rework, stage 3: target-local, wall-clock debuff timing.
// Damage multipliers for bleed and burn remain subject to balance testing.
import { balanceConfig } from "./balance-config";
export type EnemyDebuffKind = "bleed" | "burn" | "freeze" | "paralysis" | "armorBreak" | "bloodBrand" | "hunterMark" | "elementSigil";

// Shared classification for skills that depend on different enemy
// abnormalities. The sigil itself counts as an existing category for damage
// bonuses, but placing the sigil does not trigger its own first-affliction
// effect. Brands and marks are targeting aids, not abnormalities.
export const ABNORMAL_DEBUFF_KINDS = ["bleed", "burn", "freeze", "paralysis", "armorBreak", "elementSigil"] as const;
export type AbnormalDebuffKind = typeof ABNORMAL_DEBUFF_KINDS[number];

export function countEnemyAbnormalKinds(statuses: EnemyDebuffs): number {
  return ABNORMAL_DEBUFF_KINDS.filter((kind) => Boolean(statuses[kind])).length;
}

export function isAppliedAffliction(kind: EnemyDebuffKind): boolean {
  return kind === "bleed" || kind === "burn" || kind === "freeze" || kind === "paralysis" || kind === "armorBreak";
}

export type EnemyDebuff = {
  kind: EnemyDebuffKind;
  expiresAt: number;
  stacks: number;
  strength: number;
  nextTickAt?: number;
  effectBonusPercent?: number;
  effectMultiplier?: number;
  freezeBurstPercent?: number;
  attackSnapshot?: number;
  bleedDamageBonusPercent?: number;
};

export type EnemyDebuffs = Partial<Record<EnemyDebuffKind, EnemyDebuff>>;
export type DebuffTick = {
  kind: "bleed" | "burn" | "freeze"; at: number; stacks: number;
  effectMultiplier?: number; freezeBurstPercent?: number; attackSnapshot?: number;
  // Multiply eventual base bleed damage by (1 + bonus / 100); no base damage is defined here.
  bleedDamageBonusPercent?: number;
  targetDamageTakenBonusPercent?: number;
};

// Raw damage before the battle engine's target mitigation and HP rounding.
// The caller supplies the attack snapshot taken when the status was applied;
// a later equipment swap must not change damage already scheduled.
export function calculateDebuffTickRawDamage(tick: DebuffTick, attackAtApplication: number): number {
  if (!Number.isFinite(attackAtApplication) || attackAtApplication < 0) {
    throw new RangeError("Status attack snapshot must be finite and nonnegative");
  }
  if (!Number.isInteger(tick.stacks) || tick.stacks < 1 || tick.stacks > (tick.kind === "bleed" ? balanceConfig.skillRework.abnormalities.ascendedBleedMaxStacks : 1)) {
    throw new RangeError("Invalid damage-over-time stack count");
  }
  const bonus = tick.kind === "bleed" ? tick.bleedDamageBonusPercent ?? 0 : 0;
  if (!Number.isFinite(bonus) || bonus < 0) throw new RangeError("Invalid bleed damage bonus");
  const targetBonus = tick.targetDamageTakenBonusPercent ?? 0;
  if (!Number.isFinite(targetBonus) || targetBonus < 0) throw new RangeError("Invalid target damage bonus");
  const percent = (tick.kind === "bleed"
    ? balanceConfig.skillRework.dot.bleedPerStackAttackPercent * tick.stacks * (1 + bonus / 100)
    : tick.kind === "freeze" ? tick.freezeBurstPercent ?? 0 : balanceConfig.skillRework.dot.burnAttackPercent) * (tick.effectMultiplier ?? 1) * (1 + targetBonus / 100);
  return attackAtApplication * percent / 100;
}
export type DebuffUpdate = { state: EnemyDebuffs; ticks: DebuffTick[] };

const durationByLevel = {
  bloodBrand: [6, 7.5, 9, 10.5, 12],
  hunterMark: [7, 8, 9, 10, 12],
  elementSigil: [7, 8, 9, 10, 12],
} as const;

function durationMs(kind: EnemyDebuffKind, level: number): number {
  const rules = balanceConfig.skillRework.abnormalities;
  if (kind === "burn") return rules.burnSeconds * 1000;
  if (kind === "bleed") return rules.bleedSeconds * 1000;
  if (kind === "freeze") return rules.freezeSeconds * 1000;
  if (kind === "paralysis") return rules.paralysisSeconds * 1000;
  const durations = durationByLevel[kind as keyof typeof durationByLevel] as readonly number[] | undefined;
  return (durations ? durations[level - 1] : kind === "armorBreak" ? 4 : 3) * 1000;
}

function checkTime(now: number) {
  if (!Number.isFinite(now) || now < 0) throw new RangeError("Debuff time must be a finite millisecond timestamp");
}

export function advanceEnemyDebuffs(state: EnemyDebuffs, now: number): DebuffUpdate {
  checkTime(now);
  const remaining: EnemyDebuffs = {};
  const ticks: DebuffTick[] = [];
  for (const debuff of Object.values(state)) {
    if (!debuff) continue;
    let nextTickAt = debuff.nextTickAt;
    if ((debuff.kind === "bleed" || debuff.kind === "burn") && nextTickAt !== undefined) {
      // Include a tick exactly at expiry (a three-second debuff ticks at 1, 2 and 3 seconds).
      while (nextTickAt <= Math.min(now, debuff.expiresAt)) {
        ticks.push({
          kind: debuff.kind, at: nextTickAt, stacks: debuff.stacks,
          ...(debuff.effectMultiplier ? { effectMultiplier: debuff.effectMultiplier } : {}),
          ...(debuff.kind === "bleed" && debuff.bleedDamageBonusPercent
            ? { bleedDamageBonusPercent: debuff.bleedDamageBonusPercent } : {}),
          ...(state.bloodBrand && nextTickAt <= state.bloodBrand.expiresAt && state.bloodBrand.strength > 0
            ? { targetDamageTakenBonusPercent: state.bloodBrand.strength } : {}),
        });
        nextTickAt += 1000;
      }
    }
    if (debuff.kind === "freeze" && now >= debuff.expiresAt && debuff.freezeBurstPercent) {
      ticks.push({ kind: "freeze", at: debuff.expiresAt, stacks: 1,
        freezeBurstPercent: debuff.freezeBurstPercent, attackSnapshot: debuff.attackSnapshot });
    }
    if (now < debuff.expiresAt) {
      remaining[debuff.kind] = { ...debuff, ...(nextTickAt === undefined ? {} : { nextTickAt }) };
    }
  }
  ticks.sort((a, b) => a.at - b.at || a.kind.localeCompare(b.kind));
  return { state: remaining, ticks };
}

export function applyEnemyDebuff(
  state: EnemyDebuffs,
  application: {
    kind: EnemyDebuffKind; level?: number; durationSeconds?: number; ascendedBleed?: boolean; strength?: number;
    bleedDamageBonusPercent?: number; effectBonusPercent?: number; effectMultiplier?: number; freezeBurstPercent?: number; attackSnapshot?: number;
  },
  now: number,
): DebuffUpdate {
  checkTime(now);
  const level = application.level ?? 1;
  if (!Number.isInteger(level) || level < 1 || level > 5) throw new RangeError("Debuff skill level must be 1–5");
  if (application.durationSeconds !== undefined &&
      (!Number.isFinite(application.durationSeconds) || application.durationSeconds <= 0)) {
    throw new RangeError("Debuff duration must be positive and finite");
  }
  if (application.strength !== undefined && (!Number.isFinite(application.strength) || application.strength < 0)) {
    throw new RangeError("Debuff strength must be nonnegative and finite");
  }
  if (application.bleedDamageBonusPercent !== undefined &&
      (application.kind !== "bleed" || !Number.isFinite(application.bleedDamageBonusPercent) ||
        application.bleedDamageBonusPercent < 0)) {
    throw new RangeError("Bleed damage bonus must be nonnegative, finite and applied to bleed");
  }
  for (const number of [application.effectMultiplier, application.effectBonusPercent, application.freezeBurstPercent, application.attackSnapshot]) {
    if (number !== undefined && (!Number.isFinite(number) || number < 0)) throw new RangeError("Invalid abnormal effect multiplier/snapshot");
  }
  // Settle outstanding damage before refreshing the duration; never discard a delayed tick.
  const update = advanceEnemyDebuffs(state, now);
  const old = update.state[application.kind];
  const isBleed = application.kind === "bleed";
  const ticking = isBleed || application.kind === "burn";
  const maxStacks = isBleed ? (application.ascendedBleed ? balanceConfig.skillRework.abnormalities.ascendedBleedMaxStacks : balanceConfig.skillRework.abnormalities.bleedMaxStacks) : 1;
  const fixedDuration = isBleed || application.kind === "burn" || application.kind === "freeze" || application.kind === "paralysis";
  const effectMultiplier = application.effectMultiplier ?? 1;
  update.state[application.kind] = {
    kind: application.kind,
    ...(application.effectBonusPercent !== undefined ? { effectBonusPercent: application.effectBonusPercent } : {}),
    expiresAt: now + (fixedDuration || application.durationSeconds === undefined
      ? durationMs(application.kind, level) : application.durationSeconds * 1000) * (application.kind === "freeze" ? effectMultiplier : 1),
    ...(effectMultiplier !== 1 && (isBleed || application.kind === "burn") ? { effectMultiplier } : {}),
    ...(application.kind === "freeze" ? { freezeBurstPercent: application.freezeBurstPercent ?? old?.freezeBurstPercent, attackSnapshot: application.attackSnapshot ?? old?.attackSnapshot } : {}),
    stacks: isBleed ? Math.min(maxStacks, (old?.stacks ?? 0) + 1) : 1,
    // Armor break keeps the stronger value; other single-instance statuses refresh.
    strength: application.kind === "armorBreak"
      ? Math.max(old?.strength ?? 0, (application.strength ?? 0) * effectMultiplier)
      : application.kind === "paralysis" ? Math.min(100, balanceConfig.skillRework.abnormalities.paralysisSlowPercent * effectMultiplier) : application.strength ?? old?.strength ?? 0,
    ...(ticking ? { nextTickAt: old?.nextTickAt ?? now + 1000 } : {}),
    ...(isBleed && (old?.bleedDamageBonusPercent || application.bleedDamageBonusPercent)
      ? { bleedDamageBonusPercent: Math.max(old?.bleedDamageBonusPercent ?? 0, application.bleedDamageBonusPercent ?? 0) }
      : {}),
  };
  return update;
}

export function clearEnemyDebuffs(): EnemyDebuffs {
  return {};
}
