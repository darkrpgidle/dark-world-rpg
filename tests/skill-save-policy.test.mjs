import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { applySkillSaveAction, applySkillSaveActionOnce, hasAppliedSkillAction, preserveServerSkillSave, restoreSkillSave } = await import("../app/skill-save-policy.ts");
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


test("paid skill reset charges exactly 300 yuanbao and preserves unrelated progress", () => {
  let before = applySkillSaveAction({ ...base(), yuanbao: 300, gold: 999,
    dailyRewardClaimed: true, storedSeconds: 80 }, { kind: "upgrade", name: "裂地斬" });
  before = applySkillSaveAction(before, { kind: "equip", slot: 0, name: "裂地斬" });
  const after = applySkillSaveAction(before, { kind: "paid_reset" });
  assert.equal(after.yuanbao, 0);
  assert.equal(after.adminRevision, 1);
  assert.deepEqual(after.skillReworkBuild, createSkillBuild());
  assert.deepEqual(after.skillAscensions, before.skillAscensions);
  for (const key of ["gold", "dailyRewardClaimed", "storedSeconds", "rebirthCount"])
    assert.equal(after[key], before[key]);
  assert.deepEqual(before.skillReworkBuild.activeSlots, ["裂地斬", null, null]);
  assert.equal(applySkillSaveAction(after, { kind: "paid_reset" }), null);
});

test("paid reset rejects insufficient, malformed and unspent balances without mutation", () => {
  const spent = applySkillSaveAction({ ...base(), yuanbao: 299 }, { kind: "upgrade", name: "裂地斬" });
  for (const yuanbao of [0, 299, -1, 300.5, "300", null, Number.NaN])
    assert.equal(applySkillSaveAction({ ...spent, yuanbao }, { kind: "paid_reset" }), null);
  assert.equal(applySkillSaveAction({ ...base(), yuanbao: 300 }, { kind: "paid_reset" }), null);
  assert.equal(spent.yuanbao, 299);
});

test("generic autosave cannot remove or fabricate server paid reset receipts", () => {
  const id = "123e4567-e89b-12d3-a456-426614174000";
  const server = { ...base(), yuanbao: 0, _paidSkillResetActionIds: [id] };
  assert.deepEqual(preserveServerSkillSave({ ...base(), _paidSkillResetActionIds: ["forged"] }, server)
    ._paidSkillResetActionIds, [id]);
  assert.deepEqual(preserveServerSkillSave({ ...base(), _paidSkillResetActionIds: [id] }, null)
    ._paidSkillResetActionIds, []);
});


test("paid reset receipt prevents replay after an intervening skill action", () => {
  const resetId = "123e4567-e89b-12d3-a456-426614174000";
  const laterId = "123e4567-e89b-12d3-a456-426614174001";
  const save = { ...base(), yuanbao: 300, _lastSkillActionId: laterId,
    _paidSkillResetActionIds: [resetId] };
  assert.equal(hasAppliedSkillAction(save, resetId), true);
  assert.equal(hasAppliedSkillAction(save, laterId), true);
  assert.equal(hasAppliedSkillAction(save, "123e4567-e89b-12d3-a456-426614174002"), false);
});


test("intervening upgrade cannot replay an earlier accepted skill action after reconnect", () => {
  const firstId = "123e4567-e89b-12d3-a456-426614174100";
  const secondId = "123e4567-e89b-12d3-a456-426614174101";
  const first = applySkillSaveActionOnce(base(), { kind: "upgrade", name: "裂地斬" }, firstId);
  const second = applySkillSaveActionOnce(first.save, { kind: "upgrade", name: "裂地斬" }, secondId);
  assert.equal(second.save.skillReworkBuild.ranks.裂地斬, 2);
  const reconnected = JSON.parse(JSON.stringify(second.save));
  const replay = applySkillSaveActionOnce(reconnected, { kind: "upgrade", name: "裂地斬" }, firstId);
  assert.equal(replay.accepted, false);
  assert.deepEqual(replay.save, reconnected);
  assert.equal(replay.save.skillReworkBuild.ranks.裂地斬, 2);
});

test("autosave cannot erase or forge durable skill action receipts", () => {
  const id = "123e4567-e89b-12d3-a456-426614174102";
  const server = applySkillSaveActionOnce(base(), { kind: "upgrade", name: "裂地斬" }, id).save;
  const stale = { ...base(), _skillActionIds: ["forged"], skillReworkBuild: createSkillBuild() };
  const saved = preserveServerSkillSave(stale, server);
  assert.deepEqual(saved._skillActionIds, [id]);
  assert.deepEqual(saved.skillReworkBuild, server.skillReworkBuild);
  assert.equal(hasAppliedSkillAction(saved, id), true);
  assert.deepEqual(preserveServerSkillSave(stale, null)._skillActionIds, []);
});

test("reset receipt remains idempotent after another allocation and normal autosave", () => {
  const upgradeId = "123e4567-e89b-12d3-a456-426614174103";
  const resetId = "123e4567-e89b-12d3-a456-426614174104";
  const laterId = "123e4567-e89b-12d3-a456-426614174105";
  const upgraded = applySkillSaveActionOnce({ ...base(), yuanbao: 600 },
    { kind: "upgrade", name: "裂地斬" }, upgradeId).save;
  const reset = applySkillSaveActionOnce(upgraded, { kind: "paid_reset" }, resetId).save;
  const allocated = applySkillSaveActionOnce(reset, { kind: "upgrade", name: "裂地斬" }, laterId).save;
  const reconnected = preserveServerSkillSave({ ...base(), yuanbao: 300, _skillActionIds: [] },
    JSON.parse(JSON.stringify(allocated)));
  const replay = applySkillSaveActionOnce(reconnected, { kind: "paid_reset" }, resetId);
  assert.equal(replay.accepted, false);
  assert.equal(replay.save.yuanbao, 300);
  assert.equal(replay.save.skillReworkBuild.ranks.裂地斬, 1);
  assert.deepEqual(replay.save._skillActionIds, [upgradeId, resetId, laterId]);
});

test("recent receipt history stays bounded and carries forward a legacy last action", () => {
  const legacyId = "123e4567-e89b-12d3-a456-426614174106";
  const newId = "123e4567-e89b-12d3-a456-426614174107";
  const migrated = applySkillSaveActionOnce({ ...base(), _lastSkillActionId: legacyId },
    { kind: "upgrade", name: "裂地斬" }, newId).save;
  assert.deepEqual(migrated._skillActionIds, [legacyId, newId]);
  const longHistory = Array.from({ length: 256 }, (_, i) =>
    `123e4567-e89b-12d3-a456-${String(i).padStart(12, "0")}`);
  const next = applySkillSaveActionOnce({ ...base(), _skillActionIds: longHistory },
    { kind: "upgrade", name: "裂地斬" }, newId).save;
  assert.equal(next._skillActionIds.length, 256);
  assert.equal(next._skillActionIds.at(-1), newId);
  assert.equal(next._skillActionIds.includes(longHistory[0]), false);
});
