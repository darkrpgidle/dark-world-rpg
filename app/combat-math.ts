import { balanceConfig } from "./balance-config";

const nonnegative = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;

// Both sides use the same encounter scale. Power assessment uses a fixed scale
// so changing level alone never makes the reference opponent harder.
export function armorThreshold(mapId: number, floor = 1) {
  const rules = balanceConfig.combat.defenseMitigation;
  return rules.baseThreshold + Math.max(0, mapId - 1) * rules.perMapThreshold
    + Math.max(0, floor - 1) * rules.perFloorThreshold;
}

export function armorMitigation(defense: number, threshold: number, defenseIgnore = 0) {
  const rules = balanceConfig.combat.defenseMitigation;
  const effective = nonnegative(defense) * (1 - Math.min(rules.maximumIgnore, nonnegative(defenseIgnore) / 100));
  return rules.cap * effective / (effective + Math.max(1, nonnegative(threshold)));
}

// Convert legacy monster stat units into armor ratings before applying the
// shared curve. The returned rating is also used by personal/world bosses.
export function monsterArmorRating(legacyDefense: number, threshold: number) {
  const rules = balanceConfig.combat.defenseMitigation;
  return nonnegative(legacyDefense) * threshold / rules.monsterReferenceScale * rules.monsterRatingMultiplier;
}

export function additiveDamageMultiplier({ skillDamage = 0, bossDamage = 0,
  eliteDamage = 0, lowHealthDamage = 0, skillTriggered = false,
  bossTarget = false, eliteTarget = false, lowHealth = false,
}: { skillDamage?: number; bossDamage?: number; eliteDamage?: number; lowHealthDamage?: number;
  skillTriggered?: boolean; bossTarget?: boolean; eliteTarget?: boolean; lowHealth?: boolean }) {
  return 1 + ((skillTriggered ? nonnegative(skillDamage) : 0)
    + (bossTarget ? nonnegative(bossDamage) : 0)
    + (eliteTarget ? nonnegative(eliteDamage) : 0)
    + (lowHealth ? nonnegative(lowHealthDamage) : 0)) / 100;
}
