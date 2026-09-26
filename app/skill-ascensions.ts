import { SKILL_REWORK_CATALOG, createSkillBuild, type SkillBuild, type SkillClass } from "./skill-rework";

export type AscensionChoices = [string | null, string | null, string | null, string | null, string | null];
export type SkillAscensionState = {
  // Kept separate from the legacy rebirthCount. Old rebirths grant no new ascensions.
  rebirthCount: number;
  choices: AscensionChoices;
  selectionOpen: boolean;
};

export function createSkillAscensions(): SkillAscensionState {
  return { rebirthCount: 0, choices: [null, null, null, null, null], selectionOpen: false };
}

export function ascensionOptions(characterClass: SkillClass, tier: number): string[] {
  if (!Number.isInteger(tier) || tier < 1 || tier > 5) return [];
  const categories = tier === 1 ? ["basic"] : tier === 2 || tier === 3
    ? ["status", "defense", "mechanic"] : tier === 4 ? ["burst"] : ["ultimate"];
  return SKILL_REWORK_CATALOG[characterClass]
    .filter((skill) => skill.kind === "active" && skill.category && categories.includes(skill.category))
    .map((skill) => skill.name);
}

export function isValidSkillAscensions(state: SkillAscensionState, characterClass: SkillClass): boolean {
  if (!state || !Number.isInteger(state.rebirthCount) || state.rebirthCount < 0 || state.rebirthCount > 5 ||
      typeof state.selectionOpen !== "boolean" || !Array.isArray(state.choices) || state.choices.length !== 5) return false;
  for (let i = 0; i < 5; i++) {
    const name = state.choices[i];
    if (name !== null && (i >= state.rebirthCount || !ascensionOptions(characterClass, i + 1).includes(name))) return false;
    if (!state.selectionOpen && i < state.rebirthCount && name === null) return false;
    if (i >= state.rebirthCount && name !== null) return false;
  }
  if (state.rebirthCount === 0 && state.selectionOpen) return false;
  if (state.rebirthCount === 5 && state.choices[4] !== ascensionOptions(characterClass, 5)[0]) return false;
  return !state.choices[1] || state.choices[1] !== state.choices[2];
}

export function restoreSkillAscensions(saved: unknown, characterClass: SkillClass): SkillAscensionState {
  if (!isValidSkillAscensions(saved as SkillAscensionState, characterClass)) return createSkillAscensions();
  const state = saved as SkillAscensionState;
  return { rebirthCount: state.rebirthCount, choices: [...state.choices] as AscensionChoices, selectionOpen: state.selectionOpen };
}

export function beginSkillRebirth(
  state: SkillAscensionState, characterClass: SkillClass, characterLevel: number,
): { ascensions: SkillAscensionState; build: SkillBuild } | null {
  if (!isValidSkillAscensions(state, characterClass) || state.selectionOpen || characterLevel !== 100 || state.rebirthCount >= 5) return null;
  const rebirthCount = state.rebirthCount + 1;
  const choices = [...state.choices] as AscensionChoices;
  if (rebirthCount === 5) choices[4] = ascensionOptions(characterClass, 5)[0];
  return { ascensions: { rebirthCount, choices, selectionOpen: true }, build: createSkillBuild() };
}

export function selectSkillAscension(
  state: SkillAscensionState, characterClass: SkillClass, tier: number, name: string,
): SkillAscensionState | null {
  if (!isValidSkillAscensions(state, characterClass) || !state.selectionOpen ||
      !Number.isInteger(tier) || tier < 1 || tier > state.rebirthCount || tier === 5 ||
      !ascensionOptions(characterClass, tier).includes(name) ||
      ((tier === 2 && state.choices[2] === name) || (tier === 3 && state.choices[1] === name))) return null;
  const choices = [...state.choices] as AscensionChoices;
  choices[tier - 1] = name;
  return { ...state, choices };
}

export function confirmSkillAscensions(state: SkillAscensionState, characterClass: SkillClass): SkillAscensionState | null {
  if (!isValidSkillAscensions(state, characterClass) || !state.selectionOpen ||
      state.choices.slice(0, state.rebirthCount).some((choice) => choice === null)) return null;
  return { ...state, choices: [...state.choices] as AscensionChoices, selectionOpen: false };
}

export function enabledAscensions(state: SkillAscensionState, characterClass: SkillClass): string[] {
  if (!isValidSkillAscensions(state, characterClass) || state.selectionOpen) return [];
  return state.choices.filter((choice): choice is string => choice !== null);
}
