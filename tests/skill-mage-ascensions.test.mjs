import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { createSkillBuild, upgradeSkill, equipActiveSkill } = await import("../app/skill-rework.ts");
const { createMageCombat, resolveMageTurn } = await import("../app/skill-mage-combat.ts");
const { applyEnemyDebuff } = await import("../app/skill-debuff-timer.ts");

function mage(ranks, skill, additionalSlots = []) {
  let build = createSkillBuild();
  for (const [name, rank] of Object.entries(ranks)) {
    for (let i = 0; i < rank; i++) build = upgradeSkill(build, "法師", 100, name);
  }
  build = equipActiveSkill(build, "法師", 100, 0, skill);
  for (const [index, name] of additionalSlots.entries()) {
    build = equipActiveSkill(build, "法師", 100, index + 1, name);
  }
  return createMageCombat(build, 100);
}
function turn(combat, skill, now, hits = [{ hit: true }], ascended = new Set(), roll = () => 1) {
  return resolveMageTurn(combat, { skill, now, hits, ascended, roll });
}
function ready(combat, count) {
  for (let index = 0; index < count; index++) combat = turn(combat, "normal", index * 100).combat;
  return combat;
}
function burning(combat, now = 0) {
  return { ...combat, session: { ...combat.session,
    enemy: applyEnemyDebuff(combat.session.enemy, { kind: "burn" }, now).state } };
}

test("ascended frost adds one 70% segment after its original hit against an already burning target", () => {
  const combat = ready(burning(mage({ 霜火新星: 5, 星界寂滅: 1 }, "霜火新星")), 4);
  const result = turn(combat, "霜火新星", 400, [{ hit: true }], new Set(["霜火新星"]));
  assert.deepEqual(result.damageSegmentPercents, [205]);
  assert.deepEqual(result.ascensionDamageEvents,
    [{ id: "極炎霜爆", percent: 70, afterOriginalSegment: 1 }]);
  assert.equal(result.combat.session.enemy.burn.expiresAt, 3000);
  assert.equal(result.combat.session.enemy.burn.nextTickAt, 1000);
  assert.deepEqual(result.statusApplications, []);
  assert.equal(result.combat.session.charge.ultimateEnergy, 32); // four normal hits only
  assert.equal(result.combat.session.charge.charges.霜火新星, 1); // the original cast only
});

test("a frost miss, newly applied burn, expired burn or missing ascension never creates an afterburst", () => {
  const base = ready(mage({ 霜火新星: 1 }, "霜火新星"), 4);
  const enabled = new Set(["霜火新星"]);
  const newBurn = turn(base, "霜火新星", 400, [{ hit: true }], enabled, () => 0);
  assert.deepEqual(newBurn.statusApplications, [{ kind: "burn" }]);
  assert.deepEqual(newBurn.ascensionDamageEvents, []);
  const preburn = burning(base);
  assert.deepEqual(turn(preburn, "霜火新星", 400, [{ hit: false }], enabled)
    .ascensionDamageEvents, []);
  const expired = turn(preburn, "霜火新星", 3000, [{ hit: true }], enabled);
  assert.deepEqual(expired.ascensionDamageEvents, []);
  assert.equal(expired.combat.session.enemy.burn, undefined);
  assert.deepEqual(turn(preburn, "霜火新星", 400).ascensionDamageEvents, []);
});

test("successful frost burn refresh and its one independent afterburst do not multiply statuses or resource gain", () => {
  const combat = ready(burning(mage({ 霜火新星: 1, 星界寂滅: 1 }, "霜火新星")), 4);
  let rolls = 0;
  const result = turn(combat, "霜火新星", 400, [{ hit: true }], new Set(["霜火新星"]),
    () => { rolls++; return 0; });
  assert.equal(rolls, 1);
  assert.deepEqual(result.statusApplications, [{ kind: "burn" }]);
  assert.equal(result.ascensionDamageEvents.length, 1);
  assert.equal(result.combat.session.enemy.burn.expiresAt, 3400);
  assert.equal(result.combat.session.enemy.burn.nextTickAt, 1000);
  assert.equal(result.combat.session.charge.ultimateEnergy, 35); // one status application
});

test("ascended missile creates one 80% resonance after the third original hit", () => {
  const combat = ready(mage({ 奧術飛彈: 5, 奧術超載: 1, 星界寂滅: 1 },
    "奧術飛彈", ["奧術超載"]), 3);
  const result = turn(combat, "奧術飛彈", 300,
    [{ hit: true, critical: true }, { hit: true, critical: true }, { hit: true, critical: true }],
    new Set(["奧術飛彈"]));
  assert.deepEqual(result.damageSegmentPercents, [72, 72, 72]);
  assert.deepEqual(result.ascensionDamageEvents,
    [{ id: "星環共鳴", percent: 80, afterOriginalSegment: 3 }]);
  assert.equal(result.combat.session.charge.charges.奧術超載, 1);
  assert.equal(result.combat.session.charge.charges.奧術飛彈, 1);
  assert.equal(result.combat.session.charge.ultimateEnergy, 27); // 24 from normals, one critical event
  assert.deepEqual(result.statusApplications, []);
});

test("any one missed missile prevents resonance; regular missile and invalid segments do not emit it", () => {
  const combat = ready(mage({ 奧術飛彈: 1 }, "奧術飛彈"), 3);
  const enabled = new Set(["奧術飛彈"]);
  for (let missIndex = 0; missIndex < 3; missIndex++) {
    const hits = Array.from({ length: 3 }, (_, index) => ({ hit: index !== missIndex }));
    assert.deepEqual(turn(combat, "奧術飛彈", 300, hits, enabled).ascensionDamageEvents, []);
  }
  assert.deepEqual(turn(combat, "奧術飛彈", 300,
    [{ hit: true }, { hit: true }, { hit: true }]).ascensionDamageEvents, []);
  assert.equal(turn(combat, "奧術飛彈", 300, [{ hit: true }], enabled), null);
});

test("ascended meteor explodes once for 120% against existing burn, preserving its tick clock", () => {
  const combat = ready(burning(mage({ 隕星術: 5, 星界寂滅: 1 }, "隕星術")), 8);
  const result = turn(combat, "隕星術", 800, [{ hit: true }], new Set(["隕星術"]));
  assert.deepEqual(result.damageSegmentPercents, [395]);
  assert.deepEqual(result.ascensionDamageEvents,
    [{ id: "天火墜星", percent: 120, afterOriginalSegment: 1 }]);
  assert.equal(result.combat.session.enemy.burn.expiresAt, 3000);
  assert.equal(result.combat.session.enemy.burn.nextTickAt, 1000);
  assert.equal(result.combat.session.charge.ultimateEnergy, 64);
  assert.equal(result.combat.session.charge.charges.隕星術, 1);
});

test("meteor's own new burn cannot trigger its explosion; a miss or elapsed burn cannot trigger it", () => {
  const enabled = new Set(["隕星術"]);
  const combat = ready(mage({ 隕星術: 1 }, "隕星術"), 8);
  const newBurn = turn(combat, "隕星術", 800, [{ hit: true }], enabled, () => 0);
  assert.deepEqual(newBurn.statusApplications, [{ kind: "burn" }]);
  assert.deepEqual(newBurn.ascensionDamageEvents, []);
  const preburn = burning(combat);
  assert.deepEqual(turn(preburn, "隕星術", 800, [{ hit: false }], enabled).ascensionDamageEvents, []);
  assert.deepEqual(turn(preburn, "隕星術", 3000, [{ hit: true }], enabled).ascensionDamageEvents, []);
  assert.deepEqual(turn(preburn, "隕星術", 800).ascensionDamageEvents, []);
});

test("an afterburst and the ember-echo proc remain separate damage events without a new proc roll", () => {
  const combat = ready(burning(mage({ 霜火新星: 1, 餘燼回響: 5, 星界寂滅: 1 }, "霜火新星")), 4);
  let rolls = 0;
  const result = turn(combat, "霜火新星", 400, [{ hit: true }], new Set(["霜火新星"]),
    () => { rolls++; return 0; });
  assert.equal(rolls, 2); // one echo roll and one original frost burn roll
  assert.deepEqual(result.ascensionDamageEvents,
    [{ id: "極炎霜爆", percent: 70, afterOriginalSegment: 1 }]);
  assert.deepEqual(result.passiveDamageProcs, [{ id: "餘燼回響", percent: 65 }]);
  assert.deepEqual(result.combat.session.usedDamageProcs, ["餘燼回響"]);
  assert.equal(result.combat.session.charge.ultimateEnergy, 35);
});
