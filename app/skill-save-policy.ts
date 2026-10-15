import {finalizePendingRebirth} from "./rebirth-save";
import {
  createSkillBuild, equipActiveSkill, restoreSkillBuild, upgradeSkill,
  type SkillBuild, type SkillClass,
} from "./skill-rework";
import {
  beginSkillRebirth, confirmSkillAscensions, createSkillAscensions,
  restoreSkillAscensions, selectSkillAscension, type SkillAscensionState,
} from "./skill-ascensions";
import { preserveLegacyRebirthCount } from "./legacy-rebirth-storage";
import { balanceConfig } from "./balance-config";
import { MAX_REBIRTHS, clampRebirthCount } from "./rebirth-config";

export const SKILL_REWORK_SAVE_VERSION = 2;
const MAX_RECENT_SKILL_ACTION_IDS = 256;

export function hasAppliedSkillAction(save: Record<string, unknown>, actionId: string): boolean {
  return save._lastSkillActionId === actionId ||
    (Array.isArray(save._skillActionIds) && save._skillActionIds.includes(actionId)) ||
    (Array.isArray(save._paidSkillResetActionIds) && save._paidSkillResetActionIds.includes(actionId));
}

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
  | { kind: "begin_rebirth" }
  | { kind: "paid_reset" };

function isSkillClass(value: unknown): value is SkillClass {
  return value === "戰士" || value === "遊俠" || value === "法師";
}

export function restoreSkillSave(save: Record<string, unknown>): SkillSaveFields | null {
  if (!isSkillClass(save.playerClass)) return null;
  const level = Number(save.level);
  if (!Number.isInteger(level) || level < 1 || level > 100) return null;
  return {
    skillReworkVersion: SKILL_REWORK_SAVE_VERSION,
    skillReworkBuild: Number(save.skillReworkVersion) < SKILL_REWORK_SAVE_VERSION ||
      !Number.isInteger(save.skillReworkVersion) ? createSkillBuild()
      : restoreSkillBuild(save.skillReworkBuild, save.playerClass, level),
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
    ...incoming, skillReworkVersion: SKILL_REWORK_SAVE_VERSION,
    skillReworkBuild: createSkillBuild(), skillAscensions: createSkillAscensions(),
  });
  if (!canonical) return null;
  if (server && incoming.playerClass !== server.playerClass) return null;
  const next = preserveLegacyRebirthCount({ ...incoming, ...canonical,
    rebirthCount: clampRebirthCount(incoming.rebirthCount),
    _paidSkillResetActionIds: server && Array.isArray(server._paidSkillResetActionIds)
      ? server._paidSkillResetActionIds : [],
    _skillActionIds: server && Array.isArray(server._skillActionIds) ? server._skillActionIds : [],
  }, server);
  delete next.skills;
  delete next.skillPoints;
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
    case "paid_reset": {
      const price = balanceConfig.economy.costs.skillReworkResetYuanbao;
      const balance = save.yuanbao;
      if (!Number.isSafeInteger(balance) || (balance as number) < price ||
          !Object.values(build.ranks).some((rank) => rank > 0)) return null;
      build = createSkillBuild();
      save = { ...save, yuanbao: (balance as number) - price,
        adminRevision: Math.max(0, Number(save.adminRevision) || 0) + 1 };
      break;
    }
    case "begin_rebirth": {
      const floors = save.mapBestFloors as Record<string, unknown> | undefined;
      if (!Number.isSafeInteger(floors?.[9]) || Number(floors?.[9]) < 30 || typeof save.rebirthCount !== "number" || !Number.isInteger(save.rebirthCount) ||
          Number(save.rebirthCount) < 0 || Number(save.rebirthCount) >= MAX_REBIRTHS) return null;
      if (save._lastSkillRebirthLegacyCount === save.rebirthCount) return null;
      const next = beginSkillRebirth(ascensions, characterClass, level);
      if (next) {
        build = next.build;
        ascensions = next.ascensions;
      } else return null;
      break;
    }
    default:
      return null;
  }
  const next: Record<string, unknown> = { ...save, skillReworkVersion: SKILL_REWORK_SAVE_VERSION, skillReworkBuild: build,
    skillAscensions: ascensions,
    ...(action.kind === "begin_rebirth" ? { _lastSkillRebirthLegacyCount: save.rebirthCount } : {}) };
  delete next.skills;
  delete next.skillPoints;
  if(action.kind === "begin_rebirth"){
    const reborn=finalizePendingRebirth(next);
    return reborn===next?null:reborn;
  }
  return next;
}


/** Save the receipt with the action in one CAS update; a replay returns the current state. */
export function applySkillSaveActionOnce(
  save: Record<string, unknown>, action: SkillSaveAction, actionId: string,
): { accepted: boolean; save: Record<string, unknown> } | null {
  if (!/^[a-f0-9-]{36}$/.test(actionId)) return null;
  if (hasAppliedSkillAction(save, actionId)) return { accepted: false, save };
  const next = applySkillSaveAction(save, action);
  if (!next) return null;
  next._lastSkillActionId = actionId;
  const recent = Array.isArray(save._skillActionIds) ? save._skillActionIds : [];
  // Carry forward the last receipt from saves created before the bounded history existed.
  const last = save._lastSkillActionId;
  const history = typeof last === "string" && !recent.includes(last) ? [...recent, last] : recent;
  next._skillActionIds = [...history, actionId].slice(-MAX_RECENT_SKILL_ACTION_IDS);
  if (action.kind === "paid_reset")
    next._paidSkillResetActionIds = [...(Array.isArray(save._paidSkillResetActionIds)
      ? save._paidSkillResetActionIds : []), actionId];
  return { accepted: true, save: next };
}
