// Stage 21: isolated mage shield and its ascended follow-up casts.
// Caller applies remaining incoming damage to HP and decides when to check
// the below-60% activation condition; this module never deals damage itself.
import type { MageCombat } from "./skill-mage-combat";
import { grantUltimateEnergy } from "./skill-combat-queue";
import { magePassiveStats } from "./skill-mage-passives";
import { MAGE_ACTIVE_RULES, mageSkillRankValue } from "./skill-mage-rules";

export type MageShieldState = {
  value: number;
  initialValue: number;
  ascended: boolean;
  // An ascended shield grants this buff at creation. It lasts through a
  // shield break until its three later active casts have been used.
  enhancedCastsRemaining: number;
};

export function createMageShieldState(): MageShieldState {
  return { value: 0, initialValue: 0, ascended: false, enhancedCastsRemaining: 0 };
}

export function tryActivateMageShield(
  combat: MageCombat,
  input: { currentHealth: number; maxHealth: number; ascended: boolean },
): { combat: MageCombat; activated: boolean; effectiveMaxHealth: number; initialShieldValue: number } {
  if (!Number.isFinite(input.maxHealth) || input.maxHealth <= 0
    || !Number.isFinite(input.currentHealth) || input.currentHealth < 0) {
    throw new RangeError("Mage health must be finite and maximum health positive");
  }
  const effectiveMaxHealth = input.maxHealth;
  if (!Number.isFinite(effectiveMaxHealth)) throw new RangeError("Effective mage maximum health overflow");
  if (input.currentHealth > effectiveMaxHealth) throw new RangeError("Mage current health exceeds effective maximum");
  const rank = combat.build.ranks["魔力護盾"] ?? 0;
  const eligible = rank > 0 && !combat.shieldActivatedThisBattle
    && input.currentHealth > 0
    && input.currentHealth / effectiveMaxHealth * 100 < MAGE_ACTIVE_RULES.魔力護盾.healthBelow;
  if (!eligible) return { combat, activated: false, effectiveMaxHealth, initialShieldValue: 0 };

  const initialShieldValue = effectiveMaxHealth
    * (mageSkillRankValue(MAGE_ACTIVE_RULES.魔力護盾.maxHealthShieldPercent, rank) / 100)
    * (1 + magePassiveStats(combat.build).initialShieldBonusPercent / 100);
  if (!Number.isFinite(initialShieldValue)) throw new RangeError("Initial mage shield overflow");
  const shield: MageShieldState = {
    value: combat.shield.value + initialShieldValue, initialValue: combat.shield.initialValue + initialShieldValue,
    ascended: input.ascended,
    enhancedCastsRemaining: input.ascended ? MAGE_ACTIVE_RULES.魔力護盾.followingActiveCasts : 0,
  };
  return {
    combat: { ...combat, shield, shieldActivatedThisBattle: true },
    activated: true, effectiveMaxHealth, initialShieldValue,
  };
}

export function consumeMageShieldActiveCast(
  state: MageShieldState, active: boolean,
): { state: MageShieldState; activeDamageBonusPercent: number } {
  if (!active || state.enhancedCastsRemaining <= 0) {
    return { state, activeDamageBonusPercent: 0 };
  }
  return {
    state: { ...state, enhancedCastsRemaining: state.enhancedCastsRemaining - 1 },
    activeDamageBonusPercent: MAGE_ACTIVE_RULES.魔力護盾.activeDamageBonus,
  };
}

export function recordMageIncomingAttack(
  combat: MageCombat, damageSegments: readonly number[],
  passiveShield?: { maxHealth: number; roll: () => number },
): {
  combat: MageCombat; absorbedDamage: number; remainingDamage: number;
  shieldBroke: boolean; ultimateEnergyGranted: number; passiveShieldActivated: boolean;
} {
  if (!damageSegments.length || damageSegments.some((damage) => !Number.isFinite(damage) || damage < 0)) {
    throw new RangeError("Enemy attack needs finite nonnegative damage segments");
  }
  // One enemy attack event may have several segments. Its shield break grants
  // energy once for the whole event, regardless of segment count.
  const total = damageSegments.reduce((sum, damage) => sum + damage, 0);
  if (!Number.isFinite(total)) throw new RangeError("Enemy attack damage overflow");
  const absorbedDamage = Math.min(combat.shield.value, total);
  const value = combat.shield.value - absorbedDamage;
  const shieldBroke = combat.shield.value > 0 && value === 0;
  const ultimateEnergyGranted = shieldBroke && combat.shield.ascended
    && combat.session.charge.ultimate ? MAGE_ACTIVE_RULES.魔力護盾.energyOnBreak : 0;
  let shield: MageShieldState = {
    ...combat.shield,
    value,
    ...(shieldBroke ? { ascended: false } : {}),
  };
  const session = ultimateEnergyGranted
    ? { ...combat.session, charge: grantUltimateEnergy(combat.session.charge, ultimateEnergyGranted) }
    : combat.session;
  let passiveShieldActivated = false;
  if (passiveShield && total > 0
    && (combat.build.ranks["星界護體"] ?? 0) > 0) {
    if (!Number.isFinite(passiveShield.maxHealth) || passiveShield.maxHealth <= 0) {
      throw new RangeError("Passive mage shield needs positive maximum health");
    }
    const roll = passiveShield.roll();
    if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new RangeError("Passive mage shield roll must be in [0, 1)");
    const stats = magePassiveStats(combat.build);
    if (roll * 100 < stats.incomingShieldChancePercent) {
      const shieldValue = passiveShield.maxHealth * stats.incomingShieldMaxHealthPercent / 100 * (1 + stats.initialShieldBonusPercent / 100);
      if (!Number.isFinite(shieldValue)) throw new RangeError("Passive mage shield overflow");
      shield = { ...shield, value: shield.value + shieldValue, initialValue: shield.initialValue + shieldValue };
      passiveShieldActivated = true;
    }
  }
  return {
    combat: { ...combat, shield, session },
    absorbedDamage,
    remainingDamage: total - absorbedDamage,
    shieldBroke,
    ultimateEnergyGranted,
    passiveShieldActivated,
  };
}
