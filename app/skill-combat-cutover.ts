// Stage 33: choose one settlement owner at the start of a battle.
// A reworked action must never fall back to legacy after it has begun.
import { settleSkillDamageAction, type SkillDamageLedger, type SkillDamageSegment } from "./skill-damage-settlement";

export type SkillBattleEncounter = "tower" | "personal-boss" | "world-boss";
export type SkillBattleCutover = Readonly<{
  battleId: string;
  encounter: SkillBattleEncounter;
  mode: "legacy" | "rework";
}>;

export function beginSkillBattleCutover(input: {
  battleId: string;
  encounter: SkillBattleEncounter;
  enableRework: boolean;
  reworkReady: boolean;
}): SkillBattleCutover {
  if (!input.battleId || !["tower", "personal-boss", "world-boss"].includes(input.encounter)) {
    throw new RangeError("Invalid battle identity");
  }
  return Object.freeze({
    battleId: input.battleId,
    encounter: input.encounter,
    mode: input.enableRework && input.reworkReady ? "rework" : "legacy",
  } as const);
}

export function settleCutoverAction(
  route: SkillBattleCutover,
  action: {
    battleId: string;
    sequence: number;
    legacyDamage?: number;
    rework?: { ledger: SkillDamageLedger; segments: readonly SkillDamageSegment[] };
  },
) {
  if (action.battleId !== route.battleId) throw new RangeError("Action belongs to another battle");
  if (route.mode === "legacy") {
    if (action.legacyDamage === undefined || !Number.isFinite(action.legacyDamage) || action.legacyDamage < 0) {
      throw new RangeError("Legacy damage missing");
    }
    return { mode: "legacy" as const, damage: action.legacyDamage };
  }
  if (!action.rework || action.rework.ledger.encounterId !== route.battleId) {
    throw new RangeError("Reworked settlement missing; cannot re-run legacy damage");
  }
  const result = settleSkillDamageAction(action.rework.ledger, action.sequence, action.rework.segments);
  return { mode: "rework" as const, damage: result.appliedDamage, ...result };
}

