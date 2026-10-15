import { clampRebirthCount } from './rebirth-config';
import { ascensionOptions, type AscensionChoices, type SkillAscensionState } from './skill-ascensions';
import type { SkillClass } from './skill-rework';

// GM progression edits authorize ascension stages independently of normal rebirth.
export function normalizeAdminAscensions(saved: unknown, characterClass: SkillClass, count: unknown): SkillAscensionState {
  const rebirthCount = clampRebirthCount(count);
  const raw = saved && typeof saved === 'object' && Array.isArray((saved as SkillAscensionState).choices)
    ? (saved as SkillAscensionState).choices : [];
  const choices: AscensionChoices = [null, null, null, null, null];
  for (let index = 0; index < rebirthCount; index++) {
    const options = ascensionOptions(characterClass, index + 1);
    const name = characterClass === '法師' && raw[index] === '奧術飛彈' ? '閃電鏈' : raw[index];
    if (index === 4) choices[index] = options[0] ?? null;
    else if (typeof name === 'string' && options.includes(name) && !(index === 2 && choices[1] === name)) choices[index] = name;
  }
  return { rebirthCount, choices, selectionOpen: choices.slice(0, rebirthCount).some(choice => choice === null) };
}
