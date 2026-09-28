import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { createSkillBuild, upgradeSkill, equipActiveSkill } = await import("../app/skill-rework.ts");
const { createWarriorCombat, resolveWarriorTurn } = await import("../app/skill-warrior-combat.ts");
const { recordWarriorEnemyAttack, recordWarriorSuccessfulBlock, recordWarriorCounter } =
  await import("../app/skill-warrior-defense.ts");

function warrior(names) {
  let build = createSkillBuild();
  for (const name of names) build = upgradeSkill(build, "戰士", 100, name);
  if (names.includes("不屈戰意")) build = equipActiveSkill(build, "戰士", 100, 0, "不屈戰意");
  return createWarriorCombat(build, 100);
}

function enemy(combat, countsAsReceivedHit, segments = 1, ascended = false, healthPercent = 100) {
  return recordWarriorEnemyAttack(combat, { countsAsReceivedHit, segments, ascended, healthPercent });
}

test("one enemy attack event counts once even with many segments; fourth event activates the ranked defense", () => {
  let combat = warrior(["不屈戰意"]);
  for (let index = 0; index < 3; index++) {
    const next = enemy(combat, true, 4, true);
    assert.equal(next.activation, null);
    assert.equal(next.combat.defense.receivedAttacks, index + 1);
    combat = next.combat;
  }
  const fourth = enemy(combat, true, 7, true);
  assert.deepEqual(fourth.activation, {
    blockChancePercent: 15, counterChancePercent: 10, grantsGuaranteedBlock: true,
  });
  assert.deepEqual(fourth.combat.defense, {
    receivedAttacks: 0, activeAttacksRemaining: 2, activeForAttack: true,
    guaranteedBlockPending: true, ascendedCounterStacks: 0,
  });
  const second = enemy(fourth.combat, true);
  assert.equal(second.activation, null);
  assert.equal(second.activeForAttack, true);
  assert.equal(second.combat.defense.receivedAttacks, 1);
  assert.equal(second.combat.defense.activeAttacksRemaining, 1);
  const third = enemy(second.combat, false, 3);
  assert.equal(third.activeForAttack, true);
  assert.equal(third.combat.defense.activeAttacksRemaining, 0);
  assert.equal(third.blockChancePercent, 15);
  const quiet = enemy(third.combat, true);
  assert.equal(quiet.activation, null);
  assert.equal(quiet.activeForAttack, false);
  assert.equal(quiet.blockChancePercent, 0);
  assert.equal(quiet.combat.defense.guaranteedBlockPending, false);
  const again = enemy(quiet.combat, true);
  assert.ok(again.activation);
  assert.equal(again.combat.defense.activeAttacksRemaining, 2);
});

test("blocked and dodged enemy attacks count once regardless of damage outcome", () => {
  let combat = warrior(["不屈戰意"]);
  combat = enemy(combat, false, 3).combat;
  assert.equal(combat.defense.receivedAttacks, 1);
  combat = enemy(combat, true, 3).combat;
  assert.equal(combat.defense.receivedAttacks, 2);
  assert.throws(() => enemy(combat, true, 0), RangeError);
});

test("confirmed block arms one extra strike and one counter bonus without occupying a player action", () => {
  let combat = warrior(["不屈戰意", "堅盾反射", "格擋精通"]);
  for (let i = 0; i < 4; i++) combat = enemy(combat, true, 1, true).combat;
  const blocked = recordWarriorSuccessfulBlock(combat);
  assert.equal(blocked.consumedGuaranteedBlock, true);
  assert.equal(blocked.combat.defense.guaranteedBlockPending, false);
  combat = blocked.combat;
  assert.equal(recordWarriorCounter(combat).damageBonusPercent, 10);
  combat = recordWarriorCounter(combat).combat;
  assert.equal(recordWarriorCounter(combat).damageBonusPercent, 0);
  const nextAttack = resolveWarriorTurn(combat, {
    skill: "normal", hits: [{ hit: true }], healthPercent: 100, now: 0, ascended: new Set(),
  });
  assert.deepEqual(nextAttack.passiveDamageProcs, [{ id: "堅盾反射", percent: 20 }]);
  assert.equal(nextAttack.combat.session.charge.charges["不屈戰意"], undefined);
});

test("non-learned defense stays inactive but passive protection still reports low-health values", () => {
  const combat = warrior(["逆境鋼心", "格擋精通"]);
  const next = enemy(combat, true, 2, false, 39);
  assert.equal(next.activation, null);
  assert.equal(next.combat.defense.receivedAttacks, 0);
  assert.deepEqual(next.passive, {
    maxHealthBonusPercent: 0, blockChancePoints: 3, incomingDamageReductionPercent: 4,
  });
});
