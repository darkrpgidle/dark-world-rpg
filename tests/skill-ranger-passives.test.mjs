import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { createSkillBuild, upgradeSkill, equipActiveSkill } = await import("../app/skill-rework.ts");
const { createRangerCombat, resolveRangerTurn } = await import("../app/skill-ranger-combat.ts");
const { recordRangerDodge, rangerPassiveStats } = await import("../app/skill-ranger-passives.ts");
const { trySkillProc } = await import("../app/skill-combat-session.ts");

function ranger(names, skills = []) {
  let build = createSkillBuild();
  for (const name of [...names, ...skills]) build = upgradeSkill(build, "遊俠", 100, name);
  for (const [index, name] of skills.filter((name) => name !== "蒼穹箭雨").entries()) {
    build = equipActiveSkill(build, "遊俠", 100, index, name);
  }
  return createRangerCombat(build, 100);
}
function turn(combat, skill = "normal", now = 0, hits = [{ hit: true }]) {
  return resolveRangerTurn(combat, { skill, now, hits, ascended: new Set() });
}

test("constant attack speed, critical and dodge bonuses require their own learned passives", () => {
  const combat = ranger(["迅捷手感", "鷹眼", "影步反射"]);
  assert.deepEqual(rangerPassiveStats(combat.build), {
    attackSpeedBonusPercent: 3, criticalChancePoints: 2, dodgeChancePoints: 2,
  });
  const result = turn(combat);
  assert.equal(result.attackSpeedBonusPercent, 3);
  assert.equal(result.criticalChancePoints, 2);
  assert.equal(result.dodgeChancePoints, 2);
  assert.deepEqual(rangerPassiveStats(ranger([]).build), {
    attackSpeedBonusPercent: 0, criticalChancePoints: 0, dodgeChancePoints: 0,
  });
});

test("normal critical arms only the next normal bonus; wind momentum lasts four later primary actions", () => {
  let combat = ranger(["疾風餘勢", "風之積蓄"]);
  const first = turn(combat, "normal", 0, [{ hit: true, critical: true }]);
  assert.equal(first.damageBonusPercent, 0);
  assert.equal(first.combat.passives.windMomentumStacks, 1);
  combat = first.combat;
  const second = turn(combat, "normal", 100, [{ hit: false }]);
  assert.equal(second.damageBonusPercent, 4);
  assert.equal(second.attackSpeedBonusPercent, 1);
  combat = second.combat;
  for (let i = 2; i < 5; i++) combat = turn(combat, "normal", i * 100, [{ hit: false }]).combat;
  assert.equal(combat.passives.windMomentumStacks, 0);
  assert.equal(turn(combat, "normal", 500).attackSpeedBonusPercent, 0);
});

test("marked rapid fire gets one star-trace and rhythm bonus, while critical damage stays per arrow", () => {
  let combat = ranger(["破綻獵手", "精準連射", "狩獵節奏", "要害穿透", "星痕蓄力"], ["疾風連射"]);
  combat.session.enemy.hunterMark = { kind: "hunterMark", expiresAt: 10000, stacks: 1, strength: 5 };
  for (let i = 0; i < 7; i++) {
    combat = turn(combat, "normal", i * 100,
      [{ hit: true, critical: i < 3 }]).combat;
  }
  assert.equal(combat.passives.starTraceStacks, 3);
  assert.equal(combat.passives.nextSkillDamagePending, true);
  const hits = [{ hit: true, critical: true }, { hit: true, critical: true },
    { hit: true }, { hit: false }, { hit: true }];
  const cast = turn(combat, "疾風連射", 700, hits);
  assert.equal(cast.damageBonusPercent, 21); // marked 5 + multihit 2 + rhythm 5 + 3 * star trace 3
  assert.deepEqual(cast.criticalDirectDamageBonusPercentBySegment, [3, 3, 0, 0, 0]);
  assert.equal(cast.combat.passives.starTraceStacks, 1);
  assert.equal(cast.combat.passives.nextSkillDamagePending, false);
  assert.equal(cast.combat.session.charge.charges["疾風連射"], 1);
});

test("dodge effects consume at the right action, and main-arrow echo shares two-proc limit", () => {
  let combat = ranger(["影步反射", "乘風閃擊", "蒼穹餘響"], ["蒼穹箭雨"]);
  combat.passives = recordRangerDodge(combat.passives, combat.build);
  combat.session.charge.ultimateEnergy = 100;
  combat.session.charge.ready = ["蒼穹箭雨"];
  const hits = Array.from({ length: 8 }, () => ({ hit: false }));
  hits.push({ hit: true });
  const cast = turn(combat, "蒼穹箭雨", 0, hits);
  assert.equal(cast.criticalChancePoints, 5);
  assert.deepEqual(cast.passiveDamageProcs, [
    { id: "乘風閃擊", percent: 25 }, { id: "蒼穹餘響", percent: 45 },
  ]);
  assert.equal(trySkillProc(cast.combat.session, {
    id: "weapon", kind: "damage", source: "primary", family: "equipment",
  }).allowed, false);
  assert.equal(cast.combat.passives.nextPrimaryCriticalPending, false);
  assert.equal(cast.combat.passives.dodgeFollowupPending, false);
  combat = ranger(["影步反射", "乘風閃擊"]);
  combat.passives = recordRangerDodge(combat.passives, combat.build);
  const miss = turn(combat, "normal", 0, [{ hit: false }]);
  assert.equal(miss.combat.passives.nextPrimaryCriticalPending, false);
  assert.equal(miss.combat.passives.dodgeFollowupPending, true);
  assert.deepEqual(turn(miss.combat, "normal", 100).passiveDamageProcs,
    [{ id: "乘風閃擊", percent: 25 }]);
});
