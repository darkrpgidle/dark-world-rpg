import { healthFromPercent, healthPercentFromDamage } from "./balance";

// Both tower and boss health bars store a percentage; damage and floating
// numbers use real HP. Resolve their conversion once before victory/rewards.
export function settleCombatHealth(remainingPercent: number, maximumHealth: number, rawDamage: number) {
  if (!Number.isFinite(remainingPercent) || !Number.isFinite(maximumHealth) || maximumHealth <= 0
      || !Number.isFinite(rawDamage) || rawDamage < 0) {
    throw new RangeError("Invalid combat health settlement");
  }
  const currentPercent = Math.max(0, remainingPercent);
  const currentHealth = healthFromPercent(currentPercent, maximumHealth);
  const actualDamage = Math.min(currentHealth, rawDamage);
  const percentDamage = Math.min(currentPercent, healthPercentFromDamage(rawDamage, maximumHealth));
  // A rounded 1 HP display must not survive a blow that dealt its final HP.
  const defeated = currentPercent <= percentDamage + 0.000001
    || (actualDamage > 0 && actualDamage >= currentHealth);
  return {
    actualDamage,
    percentDamage: defeated ? currentPercent : percentDamage,
    remainingPercent: defeated ? 0 : currentPercent - percentDamage,
    defeated,
  };
}
