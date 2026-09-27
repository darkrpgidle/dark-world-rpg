import {
  createSkillBuild, equipActiveSkill, restoreSkillBuild, upgradeSkill,
  type SkillBuild, type SkillClass,
} from "./skill-rework";
import {
  beginSkillRebirth, confirmSkillAscensions, createSkillAscensions,
  restoreSkillAscensions, selectSkillAscension, type SkillAscensionState,
} from "./skill-ascensions";

export const SKILL_REWORK_SAVE_VERSION = 1;

export type SkillSaveFields = {
  skillReworkVersion: number;
  skillReworkBuild: SkillBuild;
  skillAscensions: SkillAscensionState;
};

export type SkillSaveAction =
  | { kind: "upgrade"; name: string }
  | { kind: "equip"; slot: number; name: string | null }
  | { kind: "select_ascension"; tier: number; name: string }
  | { kind: "confirm_ascensions" }
  | { kind: "begin_rebirth" };

function isSkillClass(value: unknown): value is SkillClass {
  return value === "戰士" || value === "遊俠" || value === "法師";
}

export function restoreSkillSave(save: Record<string, unknown>): SkillSaveFields | null {
  if (!isSkillClass(save.playerClass)) return null;
  const level = Number(save.level);
  if (!Number.isInteger(level) || level < 1 || level > 100) return null;
  return {
    skillReworkVersion: SKILL_REWORK_SAVE_VERSION,
    skillReworkBuild: restoreSkillBuild(save.skillReworkBuild, save.playerClass, level),
    skillAscensions: restoreSkillAscensions(save.skillAscensions, save.playerClass),
  };
}

// Generic autosaves never own these fields. This keeps a stale window or a
// forged whole-save payload from silently replacing a confirmed configuration
// or creating the future server-issued legacy compensation counter.
export function preserveServerSkillSave(
  incoming: Record<string, unknown>, server: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const canonical = restoreSkillSave(server ?? {
    ...incoming, skillReworkBuild: createSkillBuild(), skillAscensions: createSkillAscensions(),
  });
  if (!canonical) return null;
  if (server && incoming.playerClass !== server.playerClass) return null;
  const next: Record<string, unknown> = { ...incoming, ...canonical };
  if (server && Object.prototype.hasOwnProperty.call(server, "legacyRebirthCount")) {
    // Preserve stored values verbatim for audit; only a future server migration
    // may assign this field. Never infer it from the client's rebirthCount.
    next.legacyRebirthCount = server.legacyRebirthCount;
  } else {
    delete next.legacyRebirthCount;
  }
  return next;
}

export function applySkillSaveAction(
  save: Record<string, unknown>, action: SkillSaveAction,
): Record<string, unknown> | null {
  if (!action || typeof action !== "object") return null;
  const canonical = restoreSkillSave(save);
  if (!canonical || !isSkillClass(save.playerClass)) return null;
  const characterClass = save.playerClass;
  const level = Number(save.level);
  let build = canonical.skillReworkBuild;
  let ascensions = canonical.skillAscensions;
  switch (action.kind) {
    case "upgrade":
      if (typeof action.name !== "string") return null;
      build = upgradeSkill(build, characterClass, level, action.name)!;
      if (!build) return null;
      break;
    case "equip":
      if (action.name !== null && typeof action.name !== "string") return null;
      build = equipActiveSkill(build, characterClass, level, action.slot, action.name)!;
      if (!build) return null;
      break;
    case "select_ascension":
      if (typeof action.name !== "string") return null;
      ascensions = selectSkillAscension(ascensions, characterClass, action.tier, action.name)!;
      if (!ascensions) return null;
      break;
    case "confirm_ascensions":
      ascensions = confirmSkillAscensions(ascensions, characterClass)!;
      if (!ascensions) return null;
      break;
    case "begin_rebirth": {
      const floors = save.mapBestFloors as Record<string, unknown> | undefined;
      if (Number(floors?.[9]) < 30 || typeof save.rebirthCount !== "number" || !Number.isInteger(save.rebirthCount) ||
          Number(save.rebirthCount) < 0 || Number(save.rebirthCount) >= 20) return null;
      if (save._lastSkillRebirthLegacyCount === save.rebirthCount) return null;
      const next = beginSkillRebirth(ascensions, characterClass, level);
      if (next) {
        build = next.build;
        ascensions = next.ascensions;
      } else if (level === 100 && ascensions.rebirthCount === 5 && !ascensions.selectionOpen) {
        // The legacy game still permits rebirths 6–20 until the new restart.
        build = createSkillBuild();
      } else return null;
      break;
    }
    default:
      return null;
  }
  return { ...save, skillReworkVersion: SKILL_REWORK_SAVE_VERSION, skillReworkBuild: build,
    skillAscensions: ascensions,
    ...(action.kind === "begin_rebirth" ? { _lastSkillRebirthLegacyCount: save.rebirthCount } : {}) };
}
