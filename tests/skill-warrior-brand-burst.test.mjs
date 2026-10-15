import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { createSkillBuild, upgradeSkill, equipActiveSkill } = await import("../app/skill-rework.ts");
const { createWarriorCombat, resolveWarriorTurn, transitionWarriorNormalKill } =
  await import("../app/skill-warrior-combat.ts");
const { recordWarriorBlock } = await import("../app/skill-warrior-passives.ts");
const { trySkillProc } = await import("../app/skill-combat-session.ts");

function warrior(names, active = []) {
  let build = createSkillBuild();
  for (const name of names) build = upgradeSkill(build, "戰士", 100, name);
  for (const [index, name] of active.entries()) build = equipActiveSkill(build, "戰士", 100, index, name);
  return createWarriorCombat(build, 100);
}
function mark(combat, expiresAt = 5000) {
  combat.session.enemy.bloodBrand = { kind: "bloodBrand", expiresAt, stacks: 1, strength: 0 };
  return combat;
}
function turn(combat, skill, now, options = {}) {
  return resolveWarriorTurn(combat, {
    skill, now, hits: [{ hit: true }], healthPercent: 100,
    ascended: new Set(["血戰烙印"]), roll: () => 0, ...options,
  });
}

test("first successful bleed under ascended blood brand bursts once per mark, even on multi-hit", () => {
  let combat = warrior(["血刃斬", "血戰烙印"], ["血刃斬", "血戰烙印"]);
  for (let i = 0; i < 3; i++) combat = turn(combat, "normal", i * 100).combat;
  mark(combat);
  const first = turn(combat, "血刃斬", 300, { hits: [{ hit: false }, { hit: true }, { hit: true }] });
  assert.deepEqual(first.ascensionDamageEvents, [{ id: "血祭印記", percent: 100 }]);
  assert.deepEqual(first.extraDamagePercents, [100]);
  assert.equal(first.combat.session.enemy.bleed.stacks, 1);
  assert.equal(first.combat.bloodBrandBurstUsed, true);
  combat = first.combat;
  combat = turn(combat, "normal", 400).combat;
  combat = turn(combat, "normal", 500).combat;
  const second = turn(combat, "血刃斬", 600);
  assert.deepEqual(second.ascensionDamageEvents, []);
  assert.equal(second.combat.session.enemy.bleed.stacks, 2);
});

test("passive bleed can trigger brand burst, but it does not use passive/equipment proc slots", () => {
  let combat = warrior(["血戰烙印", "裂傷本能", "堅盾反射", "泰坦餘震"],
    ["血戰烙印"]);
  mark(combat);
  combat.passives = { ...recordWarriorBlock(combat.passives, combat.build), titanAftershockPending: true };
  const result = turn(combat, "normal", 0, { hits: [{ hit: true }, { hit: true }] });
  assert.deepEqual(result.ascensionDamageEvents, [{ id: "血祭印記", percent: 100 }]);
  assert.deepEqual(result.passiveDamageProcs.map((proc) => proc.id), ["堅盾反射", "泰坦餘震"]);
  assert.deepEqual(result.extraDamagePercents, [100, 20, 35]);
  assert.equal(trySkillProc(result.combat.session, {
    id: "weapon", kind: "damage", source: "primary", family: "equipment",
  }).allowed, false);
});

test("missed bleed, absent ascension or expired mark cannot burst", () => {
  let combat = warrior(["血戰烙印", "裂傷本能"], ["血戰烙印"]);
  mark(combat, 100);
  const miss = turn(combat, "normal", 0, { hits: [{ hit: false }] });
  assert.deepEqual(miss.ascensionDamageEvents, []);
  combat = miss.combat;
  const expired = turn(combat, "normal", 100);
  assert.deepEqual(expired.ascensionDamageEvents, []);
  assert.equal(expired.combat.bloodBrandBurstUsed, false);
  combat = expired.combat;
  mark(combat, 5000);
  const plain = turn(combat, "normal", 200, { ascended: new Set() });
  assert.deepEqual(plain.ascensionDamageEvents, []);
  assert.equal(plain.combat.bloodBrandBurstUsed, false);
});

test("new mark and next normal monster each start with an unused blood burst", () => {
  let combat = warrior(["血戰烙印", "裂傷本能"], ["血戰烙印"]);
  mark(combat, 100);
  const first = turn(combat, "normal", 0);
  assert.equal(first.combat.bloodBrandBurstUsed, true);
  combat = first.combat;
  combat = turn(combat, "normal", 100).combat;
  assert.equal(combat.bloodBrandBurstUsed, false);
  mark(combat, 5000);
  const refreshed = turn(combat, "normal", 200);
  assert.deepEqual(refreshed.ascensionDamageEvents, [{ id: "血祭印記", percent: 100 }]);
  combat = transitionWarriorNormalKill(refreshed.combat);
  assert.equal(combat.bloodBrandBurstUsed, false);
  assert.equal(combat.session.enemy.bloodBrand, undefined);
  mark(combat, 9000);
  assert.deepEqual(turn(combat, "normal", 300).ascensionDamageEvents, [{ id: "血祭印記", percent: 100 }]);
});

