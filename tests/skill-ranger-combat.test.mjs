import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { createSkillBuild, upgradeSkill, equipActiveSkill } = await import("../app/skill-rework.ts");
const { createRangerCombat, resolveRangerTurn } = await import("../app/skill-ranger-combat.ts");

function ranger(names, slots = []) {
  let build = createSkillBuild();
  for (const name of names) build = upgradeSkill(build, "遊俠", 100, name);
  for (const [index, name] of slots.entries()) build = equipActiveSkill(build, "遊俠", 100, index, name);
  return createRangerCombat(build, 100);
}
function turn(combat, skill, now, hits = [{ hit: true }], ascended = new Set()) {
  return resolveRangerTurn(combat, { skill, now, hits, ascended });
}

test("rapid fire requires five arrow outcomes, then an all-hit ascension adds one separate arrow", () => {
  let combat = ranger(["疾風連射"], ["疾風連射"]);
  for (let index = 0; index < 7; index++) combat = turn(combat, "normal", index * 100).combat;
  assert.deepEqual(combat.session.charge.ready, ["疾風連射"]);
  assert.equal(turn(combat, "normal", 700), null);
  assert.equal(turn(combat, "疾風連射", 700, [{ hit: true }]), null);
  const cast = turn(combat, "疾風連射", 700, Array.from({ length: 5 }, () => ({ hit: true })),
    new Set(["疾風連射"]));
  assert.deepEqual(cast.damageSegmentPercents, [60, 60, 60, 60, 60]);
  assert.equal(cast.additionalArrowPercent, 90);
  assert.equal(cast.combat.session.charge.charges["疾風連射"], 1);
  assert.deepEqual(cast.combat.session.charge.ready, []);
  const missed = turn(combat, "疾風連射", 700,
    [{ hit: true }, { hit: false }, { hit: true }, { hit: true }, { hit: true }],
    new Set(["疾風連射"]));
  assert.equal(missed.additionalArrowPercent, 0);
});

test("hunter mark is added once, retains ranked critical chance and blocks duplicate casting", () => {
  let combat = ranger(["獵殺標記"], ["獵殺標記"]);
  for (let index = 0; index < 5; index++) combat = turn(combat, "normal", index * 100).combat;
  const cast = turn(combat, "獵殺標記", 500);
  assert.deepEqual(cast.statusApplications, [{ kind: "hunterMark", level: 1, strength: 5 }]);
  assert.equal(cast.markedTargetCriticalChancePoints, 0);
  assert.equal(cast.combat.session.enemy.hunterMark.strength, 5);
  combat = cast.combat;
  assert.equal(turn(combat, "normal", 600).markedTargetCriticalChancePoints, 5);
  combat = turn(combat, "normal", 600).combat;
  for (let index = 0; index < 3; index++) combat = turn(combat, "normal", 700 + index * 100).combat;
  assert.deepEqual(combat.session.charge.ready, ["獵殺標記"]);
  assert.equal(turn(combat, "獵殺標記", 1000), null);
  assert.ok(turn(combat, "normal", 1000));
});

test("wind domain begins after its cast and consumes eight later primary actions", () => {
  let combat = ranger(["風行領域"], ["風行領域"]);
  for (let index = 0; index < 8; index++) combat = turn(combat, "normal", index * 100).combat;
  const cast = turn(combat, "風行領域", 800, [], new Set(["風行領域"]));
  assert.equal(cast.attackSpeedBonusPercent, 0);
  assert.equal(cast.combat.windDomain.remainingActions, 8);
  combat = cast.combat;
  const first = turn(combat, "normal", 900, [{ hit: true, critical: true }]);
  assert.equal(first.attackSpeedBonusPercent, 12);
  assert.equal(first.normalDamagePenaltyPercent, 10);
  assert.equal(first.combat.windDomain.galeStacks, 1);
  combat = first.combat;
  const second = turn(combat, "normal", 1000);
  assert.equal(second.attackSpeedBonusPercent, 15);
  assert.equal(second.combat.windDomain.remainingActions, 6);
});

test("sky rain checks nine independent segments and counts only rain-arrow critical marks", () => {
  const combat = ranger(["蒼穹箭雨"]);
  combat.session.charge.ultimateEnergy = 100;
  combat.session.charge.ready = ["蒼穹箭雨"];
  assert.equal(turn(combat, "蒼穹箭雨", 0, [{ hit: true }]), null);
  const hits = Array.from({ length: 8 }, () => ({ hit: true, critical: true }));
  hits.push({ hit: true, critical: true });
  const cast = turn(combat, "蒼穹箭雨", 0, hits, new Set(["蒼穹箭雨"]));
  assert.equal(cast.totalDamagePercent, 400);
  assert.deepEqual(cast.damageSegmentPercents, [...Array(8).fill(30), 160]);
  assert.equal(cast.skyMarks, 8);
  assert.equal(cast.mainArrowDamageBonusPercent, 48);
  assert.equal(cast.combat.session.charge.ultimateEnergy, 3);
});

