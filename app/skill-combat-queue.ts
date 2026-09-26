// Skill rework, stage 2: pure combat charge and ready-queue state.
// The existing battle loop remains untouched until its event adapter is introduced.
import type { SkillBuild, SkillClass } from "./skill-rework";

type ChargeRule = { event: "primary" | "primaryHit" | "skillHit"; threshold: number; status?: string };

export const SKILL_CHARGE_RULES: Record<SkillClass, Readonly<Record<string, ChargeRule>>> = {
  戰士: {
    裂地斬: { event: "primary", threshold: 4 },
    血刃斬: { event: "primary", threshold: 3 },
    血戰烙印: { event: "primary", threshold: 5, status: "血戰烙印" },
    狂戰姿態: { event: "primary", threshold: 8 },
    碎甲猛擊: { event: "primary", threshold: 8 },
  },
  遊俠: {
    穿雲箭: { event: "primary", threshold: 4 },
    追風箭: { event: "primary", threshold: 3 },
    獵殺標記: { event: "primary", threshold: 5, status: "獵殺標記" },
    疾風連射: { event: "primary", threshold: 7 },
    風行領域: { event: "primaryHit", threshold: 8 },
    破星狙擊: { event: "primary", threshold: 9 },
  },
  法師: {
    霜火新星: { event: "primary", threshold: 4 },
    奧術飛彈: { event: "primary", threshold: 3 },
    元素蝕印: { event: "primary", threshold: 5, status: "元素蝕印" },
    隕星術: { event: "primary", threshold: 8 },
    奧術超載: { event: "skillHit", threshold: 6 },
    虛空崩解: { event: "primary", threshold: 9 },
  },
};

export type SkillCombatState = {
  charges: Record<string, number>;
  ready: string[];
  ultimateEnergy: number;
  ultimate: string | null;
  slots: SkillBuild["activeSlots"];
  characterClass: SkillClass;
};

export type PrimaryAttackEvent = {
  kind: "normal" | "skill";
  // One cast, even a multi-hit cast, is one primary attack event.
  hits: readonly { hit: boolean; critical?: boolean }[];
  appliedStatus?: boolean;
};

export function createSkillCombatState(
  build: SkillBuild, characterClass: SkillClass, ultimate: string | null,
): SkillCombatState {
  const charges: Record<string, number> = {};
  for (const name of build.activeSlots) {
    if (name && SKILL_CHARGE_RULES[characterClass][name]) charges[name] = 0;
  }
  return { charges, ready: [], ultimateEnergy: 0, ultimate, slots: [...build.activeSlots], characterClass };
}

function copyState(state: SkillCombatState): SkillCombatState {
  return {
    ...state, charges: { ...state.charges }, ready: [...state.ready], slots: [...state.slots],
  };
}

export function recordPrimaryAttack(state: SkillCombatState, event: PrimaryAttackEvent): SkillCombatState {
  const next = copyState(state);
  const hit = event.hits.some((segment) => segment.hit);
  const critical = event.hits.some((segment) => segment.hit && segment.critical);
  // The document grants +8 for a normal hit, and +3 once for a critical,
  // irrespective of how many damage segments a skill contains.
  if (next.ultimate) {
    const gained = (event.kind === "normal" && hit ? 8 : 0) + (critical ? 3 : 0) + (event.appliedStatus ? 3 : 0);
    next.ultimateEnergy = Math.min(100, next.ultimateEnergy + gained);
  }
  for (const name of Object.keys(next.charges)) {
    const rule = SKILL_CHARGE_RULES[state.characterClass][name];
    const charged = rule.event === "primary"
      || (rule.event === "primaryHit" && hit)
      || (rule.event === "skillHit" && event.kind === "skill" && hit);
    if (charged) {
      next.charges[name] = Math.min(rule.threshold, next.charges[name] + 1);
      if (next.charges[name] === rule.threshold && !next.ready.includes(name)) next.ready.push(name);
    }
  }
  // Skills made ready by this attack can only be cast on a later player action.
  next.ready.sort((a, b) => {
    const aWasReady = state.ready.indexOf(a);
    const bWasReady = state.ready.indexOf(b);
    if (aWasReady !== -1 && bWasReady !== -1) return aWasReady - bWasReady;
    if (aWasReady !== -1) return -1;
    if (bWasReady !== -1) return 1;
    return next.slots.indexOf(a) - next.slots.indexOf(b);
  });
  if (next.ultimate && next.ultimateEnergy >= 100 && !next.ready.includes(next.ultimate)) next.ready.push(next.ultimate);
  return next;
}

export function recordSuccessfulDodge(state: SkillCombatState): SkillCombatState {
  const next = copyState(state);
  if (next.ultimate) {
    next.ultimateEnergy = Math.min(100, next.ultimateEnergy + 3);
    if (next.ultimateEnergy === 100 && !next.ready.includes(next.ultimate)) next.ready.push(next.ultimate);
  }
  return next;
}

export function nextReadySkill(
  state: SkillCombatState, targetAvailable: boolean, targetStatuses: ReadonlySet<string> = new Set(),
): string | null {
  if (!targetAvailable) return null;
  return state.ready.find((name) => {
    const status = SKILL_CHARGE_RULES[state.characterClass][name]?.status;
    return !status || !targetStatuses.has(status);
  }) ?? null;
}

export function consumeReadySkill(
  state: SkillCombatState, targetAvailable: boolean, targetStatuses: ReadonlySet<string> = new Set(),
): { skill: string; state: SkillCombatState } | null {
  const skill = nextReadySkill(state, targetAvailable, targetStatuses);
  if (!skill) return null;
  const next = copyState(state);
  next.ready = next.ready.filter((name) => name !== skill);
  if (skill === next.ultimate) next.ultimateEnergy = 0;
  else next.charges[skill] = 0;
  return { skill, state: next };
}

export type CombatBoundary = "normal-kill" | "death" | "map-change" | "boss-start" | "pvp-start";

export function transitionSkillCombat(state: SkillCombatState, boundary: CombatBoundary): SkillCombatState {
  if (boundary === "normal-kill") return copyState(state);
  return {
    ...copyState(state),
    charges: Object.fromEntries(Object.keys(state.charges).map((name) => [name, 0])),
    ready: [],
    ultimateEnergy: 0,
  };
}
