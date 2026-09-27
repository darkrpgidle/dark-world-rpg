import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { applySkillSaveAction, preserveServerSkillSave, restoreSkillSave } = await import("../app/skill-save-policy.ts");
const { createSkillBuild } = await import("../app/skill-rework.ts");
const { createSkillAscensions } = await import("../app/skill-ascensions.ts");
const { preserveLegacyRebirthCount } = await import("../app/legacy-rebirth-storage.ts");

const base = () => ({ playerClass: "戰士", level: 100, rebirthCount: 0, mapBestFloors: { 9: 30 } });

test("legacy saves migrate without granting old rebirths, malformed or cross-class fields reset", () => {
  const legacy = { ...base(), rebirthCount: 10 };
  assert.deepEqual(restoreSkillSave(legacy).skillReworkBuild, createSkillBuild());
  assert.deepEqual(restoreSkillSave(legacy).skillAscensions, createSkillAscensions());
  const malformed = { ...legacy, skillReworkBuild: { ranks: { 穿雲箭: 5 }, activeSlots: ["穿雲箭", null, null] },
    skillAscensions: { rebirthCount: 5, choices: ["穿雲箭", null, null, null, null], selectionOpen: false } };
  assert.deepEqual(restoreSkillSave(malformed).skillReworkBuild, createSkillBuild());
  assert.deepEqual(restoreSkillSave(malformed).skillAscensions, createSkillAscensions());
});

test("generic autosaves preserve canonical skill fields, including after stale and forged writes", () => {
  const saved = applySkillSaveAction(base(), { kind: "upgrade", name: "裂地斬" });
  const incoming = { ...base(), skillReworkBuild: createSkillBuild(), skillAscensions: { rebirthCount: 5 } };
  assert.deepEqual(preserveServerSkillSave(incoming, saved).skillReworkBuild, saved.skillReworkBuild);
  assert.deepEqual(preserveServerSkillSave(incoming, saved).skillAscensions, saved.skillAscensions);
  assert.deepEqual(preserveServerSkillSave(incoming, null).skillReworkBuild, createSkillBuild());
  assert.equal(preserveServerSkillSave({ ...incoming, playerClass: "法師" }, saved), null);
});

test("client autosaves cannot assign or overwrite the future server-owned legacy count", () => {
  const client = { ...base(), rebirthCount: 12, legacyRebirthCount: 20 };
  const oldServer = { ...base(), rebirthCount: 4 };
  const fresh = preserveServerSkillSave(client, null);
  const unissued = preserveServerSkillSave(client, oldServer);
  assert.equal(Object.hasOwn(fresh, "legacyRebirthCount"), false);
  assert.equal(Object.hasOwn(unissued, "legacyRebirthCount"), false);
  assert.equal(unissued.rebirthCount, 12); // The old combat flow is unchanged until the reset.

  const issued = { ...oldServer, legacyRebirthCount: 5 };
  assert.equal(preserveServerSkillSave(client, issued).legacyRebirthCount, 5);
  assert.equal(preserveServerSkillSave({ ...client, legacyRebirthCount: undefined }, issued).legacyRebirthCount, 5);
  assert.equal(applySkillSaveAction(issued, { kind: "upgrade", name: "裂地斬" }).legacyRebirthCount, 5);
  // A previously stored malformed value remains visible for investigation.
  assert.equal(preserveServerSkillSave(client, { ...issued, legacyRebirthCount: "needs-review" }).legacyRebirthCount,
    "needs-review");
  assert.equal(client.legacyRebirthCount, 20);
});

test("GM edits and historical snapshot restores retain only the present server legacy count", () => {
  const current = { rebirthCount: 0, legacyRebirthCount: 5, gold: 10 };
  const edited = preserveLegacyRebirthCount({ ...current, gold: 99, legacyRebirthCount: 20 }, current);
  const restored = preserveLegacyRebirthCount({ rebirthCount: 9, gold: 2 }, current);
  assert.deepEqual(edited, { rebirthCount: 0, legacyRebirthCount: 5, gold: 99 });
  assert.deepEqual(restored, { rebirthCount: 9, gold: 2, legacyRebirthCount: 5 });
  assert.equal(Object.hasOwn(preserveLegacyRebirthCount({ legacyRebirthCount: 10 }, { rebirthCount: 10 }),
    "legacyRebirthCount"), false);
  assert.equal(preserveLegacyRebirthCount({ legacyRebirthCount: 5 },
    { legacyRebirthCount: "needs-review" }).legacyRebirthCount, "needs-review");
  assert.equal(current.gold, 10);
});

test("server upgrade and equip enforce earned points, unlocked levels and exact slots", () => {
  const low = { ...base(), level: 2 };
  const rank1 = applySkillSaveAction(low, { kind: "upgrade", name: "裂地斬" });
  assert.equal(rank1.skillReworkBuild.ranks.裂地斬, 1);
  assert.equal(applySkillSaveAction(rank1, { kind: "upgrade", name: "裂地斬" }), null);
  assert.equal(applySkillSaveAction(rank1, { kind: "upgrade", name: "血刃斬" }), null);
  const equipped = applySkillSaveAction(rank1, { kind: "equip", slot: 0, name: "裂地斬" });
  assert.deepEqual(equipped.skillReworkBuild.activeSlots, ["裂地斬", null, null]);
  assert.equal(applySkillSaveAction(equipped, { kind: "equip", slot: 1, name: "裂地斬" }), null);
  assert.equal(applySkillSaveAction(equipped, { kind: "equip", slot: 3, name: null }), null);
  assert.equal(applySkillSaveAction(equipped, { kind: "equip", slot: 1, name: "泰坦斷界斬" }), null);
});

test("rebirth and ascension actions enforce eligibility, choices and confirmation", () => {
  assert.equal(applySkillSaveAction({ ...base(), mapBestFloors: { 9: 29 } }, { kind: "begin_rebirth" }), null);
  assert.equal(applySkillSaveAction({ ...base(), level: 99 }, { kind: "begin_rebirth" }), null);
  let save = applySkillSaveAction(base(), { kind: "begin_rebirth" });
  assert.equal(save.skillAscensions.rebirthCount, 1);
  assert.deepEqual(save.skillReworkBuild, createSkillBuild());
  assert.equal(save._lastSkillRebirthLegacyCount, 0);
  assert.equal(applySkillSaveAction(save, { kind: "begin_rebirth" }), null);
  assert.equal(applySkillSaveAction(save, { kind: "select_ascension", tier: 1, name: "穿雲箭" }), null);
  assert.equal(applySkillSaveAction(save, { kind: "confirm_ascensions" }), null);
  save = applySkillSaveAction(save, { kind: "select_ascension", tier: 1, name: "裂地斬" });
  save = applySkillSaveAction(save, { kind: "confirm_ascensions" });
  assert.equal(save.skillAscensions.selectionOpen, false);
  assert.equal(applySkillSaveAction(save, { kind: "select_ascension", tier: 1, name: "血刃斬" }), null);
  assert.equal(applySkillSaveAction(save, { kind: "begin_rebirth" }), null);
});

test("skill actions preserve daily, idle and resource balances", () => {
  const previous = { ...base(), yuanbao: 73, gold: 200, storedSeconds: 120,
    lastSeenAt: 12345, dailyDate: "2026-09-27", dailyRewardClaimed: true };
  const next = applySkillSaveAction(previous, { kind: "upgrade", name: "裂地斬" });
  for (const key of ["yuanbao", "gold", "storedSeconds", "lastSeenAt", "dailyDate", "dailyRewardClaimed"])
    assert.equal(next[key], previous[key], key);
  assert.deepEqual(previous.skillReworkBuild, undefined);
});
