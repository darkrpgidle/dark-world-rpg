import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { createSkillBuild, upgradeSkill, equipActiveSkill } = await import("../app/skill-rework.ts");
const { createWarriorCombat, resolveWarriorTurn } = await import("../app/skill-warrior-combat.ts");

const hit = [{ hit: true }];

function warrior(names) {
  let build = createSkillBuild();
  for (const name of names) build = upgradeSkill(build, "戰士", 100, name);
  names.filter((name) => name !== "鮮血怒吼").forEach((name, index) => {
    build = equipActiveSkill(build, "戰士", 100, index, name);
  });
  return createWarriorCombat(build, 100);
}

function turn(combat, skill, now, options = {}) {
  return resolveWarriorTurn(combat, { skill, hits: hit, healthPercent: 100, now, ascended: new Set(), ...options });
}

test("ground split uses its exact rank and arms shock only for the next action", () => {
  let combat = warrior(["裂地斬"]);
  for (let i = 0; i < 4; i++) combat = turn(combat, "normal", i * 100).combat;
  assert.deepEqual(combat.session.charge.ready, ["裂地斬"]);
  combat.session.enemy.armorBreak = { kind: "armorBreak", expiresAt: 5000, stacks: 1, strength: 15 };
  const cast = turn(combat, "裂地斬", 400, { ascended: new Set(["裂地斬"]) });
  assert.equal(cast.baseDamagePercent, 150);
  assert.deepEqual(cast.extraDamagePercents, []);
  assert.deepEqual(cast.statusApplications, [{ kind: "armorBreak", strength: 15 }]);
  assert.equal(cast.combat.buffs.groundShockPending, true);
  assert.deepEqual(turn(cast.combat, "normal", 500).extraDamagePercents, [60]);
});

test("blood blade rolls bleed once, applies mark bonus, and caps ascended stacks at three", () => {
  let combat = warrior(["血刃斬"]);
  for (let i = 0; i < 3; i++) combat = turn(combat, "normal", i * 100).combat;
  combat.session.enemy.bleed = { kind: "bleed", expiresAt: 5000, stacks: 2, strength: 0, nextTickAt: 1000 };
  const cast = turn(combat, "血刃斬", 300, { ascended: new Set(["血刃斬"]), roll: () => 0 });
  assert.equal(cast.bleedChancePercent, 35);
  assert.equal(cast.combat.session.enemy.bleed.stacks, 3);
  assert.equal(cast.combat.session.charge.charges["血刃斬"], 1);
});

test("low-health roar affects five actions once per encounter and preserves later damage", () => {
  let combat = warrior(["鮮血怒吼"]);
  const first = turn(combat, "normal", 0, { healthPercent: 39, ascended: new Set(["鮮血怒吼"]) });
  assert.equal(first.bonusDamagePercent, 25);
  assert.equal(first.lifestealPercent, 10);
  assert.equal(first.clearsOneNegativeStatus, true);
  combat = first.combat;
  for (let i = 1; i < 4; i++) combat = turn(combat, "normal", i * 100, { healthPercent: 20 }).combat;
  const fifth = turn(combat, "normal", 400, { healthPercent: 20 });
  assert.deepEqual(fifth.extraDamagePercents, [180]);
  assert.equal(turn(fifth.combat, "normal", 500, { healthPercent: 20 }).bonusDamagePercent, 0);
});

test("a wrong queued skill cannot bypass slot order or consume the charge", () => {
  let combat = warrior(["裂地斬", "血刃斬"]);
  for (let i = 0; i < 4; i++) {
    const selected = combat.session.charge.ready[0] ?? "normal";
    if (selected === "normal") combat = turn(combat, "normal", i * 100).combat;
    else break;
  }
  assert.deepEqual(combat.session.charge.ready, ["血刃斬"]);
  assert.equal(turn(combat, "裂地斬", 400), null);
  assert.equal(turn(combat, "normal", 400), null);
  assert.deepEqual(combat.session.charge.ready, ["血刃斬"]);
});

test("marked target adds bleed chance only when blood brand is learned", () => {
  let combat = warrior(["血刃斬"]);
  for (let i = 0; i < 3; i++) combat = turn(combat, "normal", i * 100).combat;
  combat.session.enemy.bloodBrand = { kind: "bloodBrand", expiresAt: 5000, stacks: 1, strength: 0 };
  assert.equal(turn(combat, "血刃斬", 300, { roll: () => 0.9 }).bleedChancePercent, 20);
});
