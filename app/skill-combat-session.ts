// Skill rework, stage 5: one event boundary for charging, debuffs and proc limits.
// Only the future reworked combat path calls this module; legacy combat stays active.
import { enabledUltimate, isValidSkillBuild, type SkillBuild, type SkillClass } from "./skill-rework";
import {
  consumeReadySkill,
  createSkillCombatState,
  recordPrimaryAttack,
  transitionSkillCombat,
  type CombatBoundary,
  type PrimaryAttackEvent,
  type SkillCombatState,
} from "./skill-combat-queue";
import {
  advanceEnemyDebuffs,
  applyEnemyDebuff,
  clearEnemyDebuffs,
  type DebuffTick,
  type EnemyDebuffKind,
  type EnemyDebuffs,
} from "./skill-debuff-timer";

export type StatusApplication = {
  kind: EnemyDebuffKind;
  level?: number;
  ascendedBleed?: boolean;
  bleedDamageBonusPercent?: number;
  strength?: number;
};

export type SkillCombatSession = {
  charge: SkillCombatState;
  enemy: EnemyDebuffs;
  // Reset at the beginning of each primary attack/cast, never on an extra damage segment.
  usedDamageProcs: string[];
};

export type SkillAction = PrimaryAttackEvent & {
  successfulStatuses?: readonly StatusApplication[];
};

export function createSkillCombatSession(
  build: SkillBuild, characterClass: SkillClass, level: number,
): SkillCombatSession {
  if (!isValidSkillBuild(build, characterClass, level)) throw new RangeError("Invalid skill build");
  return {
    charge: createSkillCombatState(build, characterClass, enabledUltimate(build, characterClass, level)),
    enemy: clearEnemyDebuffs(),
    usedDamageProcs: [],
  };
}

export function advanceCombatSession(session: SkillCombatSession, now: number): { session: SkillCombatSession; ticks: DebuffTick[] } {
  const update = advanceEnemyDebuffs(session.enemy, now);
  return { session: { ...session, enemy: update.state }, ticks: update.ticks };
}

export function resolveSkillAction(
  session: SkillCombatSession, action: SkillAction, now: number,
): { session: SkillCombatSession; ticks: DebuffTick[] } {
  let update = advanceEnemyDebuffs(session.enemy, now);
  let appliedStatus = false;
  if (action.hits.some((segment) => segment.hit)) {
    // Each kind of enemy status is rolled once per cast by the caller. Reject
    // duplicates here so a multi-hit skill cannot stack a single roll repeatedly.
    const seen = new Set<EnemyDebuffKind>();
    for (const status of action.successfulStatuses ?? []) {
      if (seen.has(status.kind)) continue;
      seen.add(status.kind);
      const application = applyEnemyDebuff(update.state, status, now);
      update = { state: application.state, ticks: [...update.ticks, ...application.ticks] };
      appliedStatus = true;
    }
  }
  return {
    session: {
      charge: recordPrimaryAttack(session.charge, { ...action, appliedStatus }),
      enemy: update.state,
      usedDamageProcs: [],
    },
    ticks: update.ticks,
  };
}

export type ProcCandidate = {
  id: string;
  kind: "damage" | "buff" | "status";
  source: "primary" | "secondary" | "proc" | "dot";
  family: "passive" | "equipment";
};

const statusNameByKind: Partial<Record<EnemyDebuffKind, string>> = {
  bloodBrand: "血戰烙印",
  hunterMark: "獵殺標記",
  elementSigil: "元素蝕印",
};

export function trySkillProc(session: SkillCombatSession, candidate: ProcCandidate): { allowed: boolean; session: SkillCombatSession } {
  if (candidate.kind !== "damage") return { allowed: true, session };
  if (candidate.source === "proc" || candidate.source === "dot") return { allowed: false, session };
  if (candidate.source === "secondary" && candidate.family === "passive") return { allowed: false, session };
  if (session.usedDamageProcs.includes(candidate.id) || session.usedDamageProcs.length >= 2) {
    return { allowed: false, session };
  }
  return { allowed: true, session: { ...session, usedDamageProcs: [...session.usedDamageProcs, candidate.id] } };
}

export function takeReadySkill(
  session: SkillCombatSession, targetAvailable: boolean,
): { skill: string; session: SkillCombatSession } | null {
  const targetStatuses = new Set(Object.keys(session.enemy)
    .map((kind) => statusNameByKind[kind as EnemyDebuffKind])
    .filter((name): name is string => Boolean(name)));
  const selected = consumeReadySkill(session.charge, targetAvailable, targetStatuses);
  if (!selected) return null;
  return { skill: selected.skill, session: { ...session, charge: selected.state } };
}

export function transitionCombatSession(session: SkillCombatSession, boundary: CombatBoundary): SkillCombatSession {
  return {
    charge: transitionSkillCombat(session.charge, boundary),
    enemy: clearEnemyDebuffs(),
    usedDamageProcs: [],
  };
}
