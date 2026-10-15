import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { createSkillBuild, upgradeSkill, equipActiveSkill } = await import("../app/skill-rework.ts");
const { createRangerCombat, resolveRangerTurn } = await import("../app/skill-ranger-combat.ts");
const { recordRangerEnemyAttack, recordRangerSuccessfulDodge } =
  await import("../app/skill-ranger-defense.ts");

function ranger(names) {
  let build = createSkillBuild();
  for (const name of names) build = upgradeSkill(build, "遊俠", 100, name);
  names.filter((name) => name === "幻影步" || name === "穿雲箭").forEach((name, index) => {
    build = equipActiveSkill(build, "遊俠", 100, index, name);
  });
  return createRangerCombat(build, 100);
}
function enemy(combat, options = {}) {
  return recordRangerEnemyAttack(combat, {
    segments: 1, countsAsReceivedHit: true, healthPercent: 100,
    canActivateFromHealth: false, ascended: false, ...options,
  });
}
function turn(combat, skill, now, hit = true) {
  return resolveRangerTurn(combat, {
    skill, now, hits: [{ hit }], ascended: new Set(),
  });
}

test("phantom step health condition activates below 55 only when caller allows a new activation", () => {
  let combat = ranger(["幻影步"]);
  assert.equal(enemy(combat, { healthPercent: 55, canActivateFromHealth: true }).activation, null);
  assert.equal(enemy(combat, { healthPercent: 54, canActivateFromHealth: false }).activation, null);
  const triggered = enemy(combat, { healthPercent: 54, canActivateFromHealth: true, ascended: true });
  assert.deepEqual(triggered.activation, {
    dodgeChancePoints: 10, nextHitCriticalChancePoints: 10, grantsGuaranteedDodge: true,
  });
  assert.equal(triggered.combat.defense.guaranteedDodgePending, true);
  assert.equal(triggered.combat.defense.receivedAttacks, 0);
});

test("five received enemy attacks activate once, even when each attack has many segments", () => {
  let combat = ranger(["幻影步", "影步反射"]);
  combat = enemy(combat, { countsAsReceivedHit: false, segments: 3 }).combat;
  assert.equal(combat.defense.receivedAttacks, 1);
  for (let index = 1; index < 4; index++) {
    const result = enemy(combat, { segments: 7 });
    assert.equal(result.activation, null);
    assert.equal(result.combat.defense.receivedAttacks, index + 1);
    assert.equal(result.passiveDodgeChancePoints, 2);
    combat = result.combat;
  }
  const fifth = enemy(combat, { segments: 7 });
  assert.equal(fifth.activation.dodgeChancePoints, 10);
  assert.equal(fifth.combat.defense.receivedAttacks, 0);
  assert.throws(() => enemy(combat, { segments: 0 }), RangeError);
});

test("confirmed dodge earns energy once and arms phantom and passive next-action effects", () => {
  let combat = ranger(["幻影步", "穿雲箭", "影步反射", "乘風閃擊", "蒼穹箭雨"]);
  const activation = enemy(combat, { healthPercent: 40, canActivateFromHealth: true, ascended: true });
  combat = activation.combat;
  const dodged = recordRangerSuccessfulDodge(combat, { phantomStepActive: true, ascended: true });
  assert.equal(dodged.consumedGuaranteedDodge, true);
  assert.equal(dodged.combat.session.charge.ultimateEnergy, 3);
  assert.equal(dodged.combat.defense.guaranteedDodgePending, false);
  combat = dodged.combat;
  const missed = turn(combat, "normal", 0, false);
  assert.equal(missed.criticalChancePoints, 15); // phantom 10 + shadow reflection 5
  assert.equal(missed.combat.defense.nextHitCriticalChancePoints, 10);
  assert.equal(missed.combat.passives.nextPrimaryCriticalPending, false);
  assert.equal(missed.combat.passives.dodgeFollowupPending, true);
  combat = missed.combat;
  const landed = turn(combat, "normal", 100);
  assert.equal(landed.criticalChancePoints, 10);
  assert.deepEqual(landed.passiveDamageProcs, [{ id: "乘風閃擊", percent: 25 }]);
  assert.equal(landed.combat.defense.nextHitCriticalChancePoints, 0);
  assert.equal(landed.combat.defense.nextSkillCriticalDamagePending, true);
  combat = landed.combat;
  combat.session.charge.charges["穿雲箭"] = 4;
  combat.session.charge.ready = ["穿雲箭"];
  const skill = turn(combat, "穿雲箭", 200, false);
  assert.equal(skill.phantomNextSkillCriticalDamagePercent, 35);
  assert.equal(skill.combat.defense.nextSkillCriticalDamagePending, false);
});

test("successful dodge without phantom step still grants learned passives and energy", () => {
  let combat = ranger(["影步反射", "乘風閃擊", "蒼穹箭雨"]);
  combat = recordRangerSuccessfulDodge(combat, { phantomStepActive: false, ascended: false }).combat;
  assert.equal(combat.session.charge.ultimateEnergy, 3);
  assert.equal(combat.defense.nextHitCriticalChancePoints, 0);
  assert.equal(combat.passives.nextPrimaryCriticalPending, true);
  assert.equal(combat.passives.dodgeFollowupPending, true);
});

