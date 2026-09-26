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
const { recordWarriorSuccessfulBlock, recordWarriorCounter } =
  await import("../app/skill-warrior-defense.ts");
const { recordWarriorSkillHit } = await import("../app/skill-warrior-rules.ts");

function warrior(ranks, slots = []) {
  let build = createSkillBuild();
  for (const [name, rank] of Object.entries(ranks)) {
    for (let index = 0; index < rank; index++) build = upgradeSkill(build, "戰士", 100, name);
  }
  for (const [index, name] of slots.entries()) build = equipActiveSkill(build, "戰士", 100, index, name);
  return createWarriorCombat(build, 100);
}
function turn(combat, skill = "normal", now = 0, options = {}) {
  return resolveWarriorTurn(combat, {
    skill, now, hits: options.hits ?? [{ hit: true }], healthPercent: options.hp ?? 100,
    ascended: options.ascended ?? new Set(), negativeStatuses: options.negativeStatuses,
    roll: options.roll ?? (() => 1),
  });
}

test("ascended roar selects one caller-ordered negative status once and preserves the others", () => {
  const combat = warrior({ 鮮血怒吼: 5 });
  const activated = turn(combat, "normal", 0,
    { hp: 39, ascended: new Set(["鮮血怒吼"]), negativeStatuses: ["poison", "slow"] });
  assert.equal(activated.clearsOneNegativeStatus, true);
  assert.equal(activated.clearedNegativeStatus, "poison");
  assert.deepEqual(activated.remainingNegativeStatuses, ["slow"]);
  assert.equal(activated.combat.buffs.bloodRoarRemaining, 4);
  const next = turn(activated.combat, "normal", 100,
    { hp: 10, ascended: new Set(["鮮血怒吼"]), negativeStatuses: ["slow"] });
  assert.equal(next.clearsOneNegativeStatus, false);
  assert.equal(next.clearedNegativeStatus, null);
  assert.deepEqual(next.remainingNegativeStatuses, ["slow"]);
});

test("roar has no status to clear if none exists, and an ordinary roar does not request a cleanse", () => {
  const combat = warrior({ 鮮血怒吼: 1 });
  const none = turn(combat, "normal", 0, { hp: 39, ascended: new Set(["鮮血怒吼"]) });
  assert.equal(none.clearsOneNegativeStatus, true); // the ascended activation grants the cleanse
  assert.equal(none.clearedNegativeStatus, null);
  assert.deepEqual(none.remainingNegativeStatuses, []);
  const ordinary = turn(combat, "normal", 0, { hp: 39, negativeStatuses: ["poison"] });
  assert.equal(ordinary.clearsOneNegativeStatus, false);
  assert.equal(ordinary.clearedNegativeStatus, null);
  assert.deepEqual(ordinary.remainingNegativeStatuses, ["poison"]);
  assert.equal(turn(combat, "normal", 0, { hp: 40, negativeStatuses: ["poison"] }).clearsOneNegativeStatus, false);
});

test("three confirmed ascended blocks stack the next counter at +60%, alongside block mastery", () => {
  let combat = warrior({ 不屈戰意: 1, 格擋精通: 5 });
  const chargeBefore = combat.session.charge;
  for (let index = 0; index < 4; index++) {
    combat = recordWarriorSuccessfulBlock(combat, true).combat;
    assert.equal(combat.defense.ascendedCounterStacks, Math.min(3, index + 1));
  }
  assert.equal(combat.passives.counterBonusPending, true);
  const counter = recordWarriorCounter(combat);
  assert.equal(counter.damageBonusPercent, 60 + 30);
  assert.deepEqual(counter.counterDamageEvent, { id: "反擊", damageBonusPercent: 90 });
  assert.equal(counter.combat.defense.ascendedCounterStacks, 0);
  assert.equal(counter.combat.passives.counterBonusPending, false);
  assert.deepEqual(counter.combat.session.charge, chargeBefore);
  assert.deepEqual(counter.combat.session.usedDamageProcs, []);
  assert.equal(recordWarriorCounter(counter.combat).damageBonusPercent, 0);
});

test("a failed counter roll does not spend the pending bonus; an actual missed counter does", () => {
  let combat = recordWarriorSuccessfulBlock(warrior({ 不屈戰意: 1, 格擋精通: 1 }), true).combat;
  combat = turn(combat, "normal", 0).combat; // the next player action is not a counter
  assert.equal(combat.defense.ascendedCounterStacks, 1);
  assert.equal(combat.passives.counterBonusPending, true);
  const missed = recordWarriorCounter(combat, false);
  assert.equal(missed.damageBonusPercent, 0);
  assert.equal(missed.counterDamageEvent, null);
  assert.equal(missed.combat.defense.ascendedCounterStacks, 0);
  assert.equal(missed.combat.passives.counterBonusPending, false);
  assert.deepEqual(missed.combat.session.charge, combat.session.charge);
});

test("blocks without an ascended learned defense do not create the ascension counter stack", () => {
  const ordinary = recordWarriorSuccessfulBlock(warrior({ 不屈戰意: 1 }), false);
  assert.equal(ordinary.combat.defense.ascendedCounterStacks, 0);
  assert.equal(recordWarriorCounter(ordinary.combat).damageBonusPercent, 0);
  const unlearned = recordWarriorSuccessfulBlock(warrior({ 格擋精通: 1 }), true);
  assert.equal(unlearned.combat.defense.ascendedCounterStacks, 0);
  assert.equal(recordWarriorCounter(unlearned.combat).damageBonusPercent, 10);
});

test("ground shock, three titan slashes and roar finisher appear as named later damage segments", () => {
  let combat = warrior({ 裂地斬: 1, 泰坦斷界斬: 1, 鮮血怒吼: 1 });
  combat = { ...combat, buffs: recordWarriorSkillHit(
    recordWarriorSkillHit(combat.buffs, "裂地斬", true, true), "泰坦斷界斬", false, true) };
  combat = { ...combat, buffs: { ...combat.buffs, bloodRoarUsed: true, bloodRoarRemaining: 1,
    bloodRoarRank: 1, bloodRoarAscended: true } };
  const first = turn(combat, "normal", 0);
  assert.deepEqual(first.ascensionDamageEvents, [
    { id: "地脈崩裂", percent: 60 }, { id: "天地斷絕", percent: 70 },
    { id: "血怒終焉", percent: 180 },
  ]);
  assert.deepEqual(first.extraDamagePercents, [60, 70, 180]);
  assert.equal(first.combat.buffs.groundShockPending, false);
  assert.equal(first.combat.buffs.titanSlashesRemaining, 2);
  assert.equal(first.combat.buffs.bloodRoarRemaining, 0);
  const second = turn(first.combat, "normal", 100);
  assert.deepEqual(second.ascensionDamageEvents, [{ id: "天地斷絕", percent: 70 }]);
  const third = turn(second.combat, "normal", 200);
  assert.deepEqual(third.ascensionDamageEvents, [{ id: "天地斷絕", percent: 70 }]);
  assert.deepEqual(turn(third.combat, "normal", 300).ascensionDamageEvents, []);
});

test("a missed primary action consumes its pending followups without producing damage or resources", () => {
  let combat = warrior({ 裂地斬: 1, 泰坦斷界斬: 1, 鮮血怒吼: 1 });
  combat = { ...combat, buffs: recordWarriorSkillHit(
    recordWarriorSkillHit(combat.buffs, "裂地斬", true, true), "泰坦斷界斬", false, true) };
  combat = { ...combat, buffs: { ...combat.buffs, bloodRoarUsed: true,
    bloodRoarRemaining: 1, bloodRoarRank: 1, bloodRoarAscended: true } };
  const missed = turn(combat, "normal", 0, { hits: [{ hit: false }] });
  assert.deepEqual(missed.ascensionDamageEvents, []);
  assert.deepEqual(missed.extraDamagePercents, []);
  assert.equal(missed.combat.buffs.groundShockPending, false);
  assert.equal(missed.combat.buffs.titanSlashesRemaining, 2);
  assert.equal(missed.combat.buffs.bloodRoarRemaining, 0);
  assert.equal(missed.combat.session.charge.ultimateEnergy, 0);
  assert.deepEqual(turn(missed.combat, "normal", 100).ascensionDamageEvents,
    [{ id: "天地斷絕", percent: 70 }]);
});

test("stance extension counts successful bleed applications at most three times and survives ordinary target swap", () => {
  let combat = warrior({ 狂戰姿態: 1, 裂傷本能: 5 }, ["狂戰姿態"]);
  for (let index = 0; index < 8; index++) combat = turn(combat, "normal", index * 100).combat;
  combat = turn(combat, "狂戰姿態", 800, { ascended: new Set(["狂戰姿態"]) }).combat;
  assert.equal(combat.buffs.stanceRemaining, 8);
  for (let index = 0; index < 3; index++) {
    const applied = turn(combat, "normal", 900 + index * 100, { roll: () => 0 });
    assert.deepEqual(applied.statusApplications, [{ kind: "bleed", ascendedBleed: false }]);
    assert.equal(applied.combat.buffs.stanceRemaining, 8);
    combat = applied.combat;
  }
  assert.equal(combat.buffs.stanceExtensions, 3);
  combat = transitionWarriorNormalKill(combat);
  const afterSwap = turn(combat, "normal", 1200, { roll: () => 0 });
  assert.equal(afterSwap.combat.buffs.stanceExtensions, 3);
  assert.equal(afterSwap.combat.buffs.stanceRemaining, 7);
});
