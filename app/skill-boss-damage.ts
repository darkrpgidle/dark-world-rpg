import { settleCombatHealth } from "./skill-health-settlement";

// The live boss loop keeps this ledger for one round. Every direct hit, DoT,
// and counter consumes the current HP before ranking damage or victory is sent.
export type BossDamageLedger = Readonly<{
  remainingPercent: number;
  maximumHealth: number;
  defeated: boolean;
}>;

export function createBossDamageLedger(maximumHealth: number, remainingPercent = 100): BossDamageLedger {
  settleCombatHealth(remainingPercent, maximumHealth, 0);
  if (remainingPercent < 0 || remainingPercent > 100) throw new RangeError("Invalid boss health");
  return { maximumHealth, remainingPercent, defeated: remainingPercent === 0 };
}

export function settleBossDamageEvent(ledger: BossDamageLedger, rawDamage: number) {
  if (!Number.isFinite(rawDamage) || rawDamage < 0) throw new RangeError("Invalid boss damage");
  if (ledger.defeated) {
    return { ledger, actualDamage: 0, percentDamage: 0, remainingPercent: 0, defeated: true, newVictory: false };
  }
  const result = settleCombatHealth(ledger.remainingPercent, ledger.maximumHealth, rawDamage);
  return {
    ledger: { ...ledger, remainingPercent: result.remainingPercent, defeated: result.defeated },
    actualDamage: result.actualDamage,
    percentDamage: result.percentDamage,
    remainingPercent: result.remainingPercent,
    defeated: result.defeated,
    newVictory: result.defeated,
  };
}

