// Stage 33: one damage/display result per reworked battle action.
// The caller supplies actual hit outcomes and final damage; this module never
// re-rolls skills, creates procs or awards resources for follow-up segments.
export type SkillDamageSegment = {
  key: string;
  source: "original" | "ascension" | "passive" | "equipment" | "dot";
  hit: boolean;
  damage: number;
};

export type SkillDamageLedger = {
  encounterId: string;
  targetId: string;
  maximumHealth: number;
  remainingHealth: number;
  lastActionSequence: number;
};

export function createSkillDamageLedger(
  encounterId: string, targetId: string, maximumHealth: number,
  remainingHealth = maximumHealth,
): SkillDamageLedger {
  if (!encounterId || !targetId || !Number.isSafeInteger(maximumHealth) || maximumHealth <= 0
      || !Number.isSafeInteger(remainingHealth) || remainingHealth < 0 || remainingHealth > maximumHealth) {
    throw new RangeError("Invalid battle target health");
  }
  return { encounterId, targetId, maximumHealth, remainingHealth, lastActionSequence: 0 };
}

export function nextSkillDamageTarget(
  ledger: SkillDamageLedger, targetId: string, maximumHealth: number,
): SkillDamageLedger {
  if (!targetId || targetId === ledger.targetId || !Number.isSafeInteger(maximumHealth) || maximumHealth <= 0) {
    throw new RangeError("Invalid next battle target");
  }
  return { ...ledger, targetId, maximumHealth, remainingHealth: maximumHealth };
}

export function settleSkillDamageAction(
  ledger: SkillDamageLedger, actionSequence: number, segments: readonly SkillDamageSegment[],
) {
  if (!Number.isSafeInteger(actionSequence) || actionSequence <= 0) throw new RangeError("Invalid battle action sequence");
  if (actionSequence <= ledger.lastActionSequence) {
    return { ledger, appliedDamage: 0, events: [], duplicate: true } as const;
  }
  const keys = new Set<string>();
  for (const segment of segments) {
    if (!segment.key || keys.has(segment.key) || !["original", "ascension", "passive", "equipment", "dot"].includes(segment.source)
        || typeof segment.hit !== "boolean" || !Number.isFinite(segment.damage) || segment.damage < 0) {
      throw new RangeError("Invalid or duplicate damage segment");
    }
    keys.add(segment.key);
  }
  let remainingHealth = ledger.remainingHealth;
  const events: { key: string; source: SkillDamageSegment["source"]; hit: boolean; damage: number }[] = [];
  for (const segment of segments) {
    if (remainingHealth <= 0) break;
    const damage = segment.hit ? Math.min(remainingHealth, Math.round(segment.damage)) : 0;
    remainingHealth -= damage;
    events.push({
      key: JSON.stringify([ledger.encounterId, ledger.targetId, actionSequence, segment.key]),
      source: segment.source, hit: segment.hit, damage,
    });
  }
  return {
    ledger: { ...ledger, remainingHealth, lastActionSequence: actionSequence },
    appliedDamage: ledger.remainingHealth - remainingHealth,
    events,
    duplicate: false,
  } as const;
}

