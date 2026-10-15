import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { createSkillBuild, upgradeSkill, equipActiveSkill } = await import("../app/skill-rework.ts");
const { createWarriorCombat, resolveWarriorTurn } = await import("../app/skill-warrior-combat.ts");

function warrior(names, equip = []) {
  let build = createSkillBuild();
  for (const name of names) build = upgradeSkill(build, "戰士", 100, name);
  for (const [index, name] of equip.entries()) build = equipActiveSkill(build, "戰士", 100, index, name);
  return createWarriorCombat(build, 100);
}

function turn(combat, skill, now, ascended = true, roll = () => 1) {
  return resolveWarriorTurn(combat, {
    skill, now, hits: [{ hit: true }], healthPercent: 100,
    ascended: ascended ? new Set(["血刃斬"]) : new Set(), roll,
  });
}

test("blood blade ascension tags its bleed, then the scheduled tick carries a 20 percent bonus", () => {
  let combat = warrior(["血刃斬"], ["血刃斬"]);
  for (let i = 0; i < 3; i++) combat = turn(combat, "normal", i * 100).combat;
  const cast = turn(combat, "血刃斬", 300, true, () => 0);
  assert.deepEqual(cast.statusApplications, [
    { kind: "bleed", durationSeconds: 5, ascendedBleed: true, bleedDamageBonusPercent: 20 },
  ]);
  assert.equal(cast.combat.session.enemy.bleed.bleedDamageBonusPercent, 20);
  const tick = turn(cast.combat, "normal", 1300);
  assert.deepEqual(tick.dueTicks, [
    { kind: "bleed", at: 1300, stacks: 1, bleedDamageBonusPercent: 20 },
  ]);
  assert.deepEqual(tick.extraDamagePercents, []);
});

test("normal-attack passive bleed gets the ascension bonus only with learned ascended blood blade", () => {
  const combat = warrior(["血刃斬", "裂傷本能"]);
  const first = turn(combat, "normal", 0, true, () => 0);
  assert.deepEqual(first.statusApplications, [
    { kind: "bleed", durationSeconds: 5, ascendedBleed: true, bleedDamageBonusPercent: 20 },
  ]);
  assert.equal(first.combat.session.enemy.bleed.stacks, 1);
  const plain = warrior(["血刃斬", "裂傷本能"]);
  const unascended = turn(plain, "normal", 0, false, () => 0);
  assert.deepEqual(unascended.statusApplications, [{ kind: "bleed", durationSeconds: 5, ascendedBleed: false }]);
  assert.equal(unascended.combat.session.enemy.bleed.bleedDamageBonusPercent, undefined);
  const unlearned = warrior(["裂傷本能"]);
  assert.deepEqual(turn(unlearned, "normal", 0, true, () => 0).statusApplications, [
    { kind: "bleed", durationSeconds: 5, ascendedBleed: false },
  ]);
});
