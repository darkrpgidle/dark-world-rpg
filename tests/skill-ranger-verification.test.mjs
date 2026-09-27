import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { createSkillBuild, upgradeSkill, equipActiveSkill } = await import("../app/skill-rework.ts");
const { createRangerCombat, resolveRangerTurn, transitionRangerNormalKill } =
  await import("../app/skill-ranger-combat.ts");
const { recordRangerEnemyAttack, recordRangerSuccessfulDodge } =
  await import("../app/skill-ranger-defense.ts");

function ranger(ranks, slots = []) {
  let build = createSkillBuild();
  for (const [name, rank] of Object.entries(ranks)) {
    for (let index = 0; index < rank; index++) build = upgradeSkill(build, "遊俠", 100, name);
  }
  for (const [index, name] of slots.entries()) build = equipActiveSkill(build, "遊俠", 100, index, name);
  return createRangerCombat(build, 100);
}
function turn(combat, skill, now, hits = [{ hit: true }], options = {}) {
  return resolveRangerTurn(combat, {
    skill, now, hits, ascended: options.ascended ?? new Set(), roll: options.roll ?? (() => 1),
  });
}
function charge(combat, count) {
  for (let index = 0; index < count; index++) combat = turn(combat, "normal", index * 100).combat;
  return combat;
}
function ready(combat, name) {
  return { ...combat, session: { ...combat.session, charge: {
    ...combat.session.charge, ready: [name], charges: {
      ...combat.session.charge.charges,
      ...(name in combat.session.charge.charges ? { [name]: 1 } : {}),
    },
  } } };
}

test("tailwind critical rolls the five ranked charge-reduction probabilities once each", () => {
  for (const [index, chance] of [10, 13, 16, 19, 22].entries()) {
    const combat = charge(ranger({ 追風箭: index + 1, 蒼穹箭雨: 1 }, ["追風箭"]), 3);
    let draws = 0;
    const triggered = turn(combat, "追風箭", 300, [{ hit: true, critical: true }], {
      roll: () => { draws++; return (chance - 0.01) / 100; },
    });
    assert.equal(draws, 1);
    assert.equal(triggered.tailwindChargeReductionChancePercent, chance);
    assert.equal(triggered.tailwindChargeReductionTriggered, true);
    assert.equal(triggered.tailwindChargeRecovered, 1);
    assert.equal(triggered.combat.session.charge.charges.追風箭, 2);
    assert.equal(triggered.combat.session.charge.ultimateEnergy, 27);
    const boundary = turn(combat, "追風箭", 300, [{ hit: true, critical: true }],
      { roll: () => chance / 100 });
    assert.equal(boundary.tailwindChargeReductionTriggered, false);
    assert.equal(boundary.tailwindChargeRecovered, 0);
    assert.equal(boundary.combat.session.charge.charges.追風箭, 1);
  }
});

test("tailwind miss, normal hit and ordinary critical cannot roll or fabricate charge reduction", () => {
  const combat = charge(ranger({ 追風箭: 1 }, ["追風箭"]), 3);
  for (const hits of [[{ hit: false, critical: true }], [{ hit: true, critical: false }]]) {
    const result = turn(combat, "追風箭", 300, hits,
      { roll: () => { throw Error("not eligible for a roll"); } });
    assert.equal(result.tailwindChargeReductionChancePercent, 0);
    assert.equal(result.tailwindChargeReductionTriggered, false);
    assert.equal(result.tailwindChargeRecovered, 0);
  }
  const normal = turn(ranger({ 追風箭: 1 }), "normal", 0, [{ hit: true, critical: true }],
    { roll: () => { throw Error("normal attack does not roll tailwind"); } });
  assert.equal(normal.tailwindChargeReductionTriggered, false);
});

test("ascended tailwind arrow remains a separate segment and does not roll reduction again", () => {
  const combat = charge(ranger({ 追風箭: 1, 蒼穹箭雨: 1 }, ["追風箭"]), 3);
  let draws = 0;
  const cast = turn(combat, "追風箭", 300, [{ hit: true, critical: true }], {
    ascended: new Set(["追風箭"]), roll: () => { draws++; return 0; },
  });
  assert.equal(draws, 1);
  assert.deepEqual(cast.additionalArrowEvents, [{ id: "風痕追獵", percent: 60 }]);
  assert.equal(cast.tailwindChargeReductionTriggered, true);
  assert.equal(cast.combat.session.charge.charges.追風箭, 2);
  assert.equal(cast.combat.session.charge.ultimateEnergy, 27);
});

test("eight critical rain arrows grant eight marks, but a missed main arrow receives no bonus", () => {
  const combat = ready(ranger({ 蒼穹箭雨: 1, 蒼穹餘響: 1 }), "蒼穹箭雨");
  combat.session.charge.ultimateEnergy = 100;
  const hits = [...Array.from({ length: 8 }, () => ({ hit: true, critical: true })), { hit: false }];
  const result = turn(combat, "蒼穹箭雨", 0, hits, { ascended: new Set(["蒼穹箭雨"]) });
  assert.equal(result.skyMarks, 8);
  assert.equal(result.mainArrowDamageBonusPercent, 0);
  assert.deepEqual(result.passiveDamageProcs, []);
  assert.equal(result.combat.session.charge.ultimateEnergy, 3);
  assert.deepEqual(result.damageSegmentPercents, [...Array(8).fill(30), 160]);
});

test("main arrow critical alone grants no marks; mixed rain hits boost only the landed main arrow", () => {
  const combat = ready(ranger({ 蒼穹箭雨: 5, 蒼穹餘響: 1 }), "蒼穹箭雨");
  combat.session.charge.ultimateEnergy = 100;
  const mainOnly = turn(combat, "蒼穹箭雨", 0,
    [...Array.from({ length: 8 }, () => ({ hit: false })), { hit: true, critical: true }],
    { ascended: new Set(["蒼穹箭雨"]) });
  assert.equal(mainOnly.skyMarks, 0);
  assert.equal(mainOnly.mainArrowDamageBonusPercent, 0);
  assert.deepEqual(mainOnly.passiveDamageProcs, [{ id: "蒼穹餘響", percent: 45 }]);
  const mixed = turn(combat, "蒼穹箭雨", 0,
    [...Array.from({ length: 3 }, () => ({ hit: true, critical: true })),
      ...Array.from({ length: 5 }, () => ({ hit: false })), { hit: true }],
    { ascended: new Set(["蒼穹箭雨"]) });
  assert.equal(mixed.totalDamagePercent, 630);
  assert.deepEqual(mixed.damageSegmentPercents, [...Array(8).fill(46), 262]);
  assert.equal(mixed.skyMarks, 3);
  assert.equal(mixed.mainArrowDamageBonusPercent, 18);
  assert.equal(mixed.combat.session.charge.ultimateEnergy, 3);
});

test("piercing ascension applies to one later active skill, skips normals, and a miss consumes it", () => {
  let combat = ready(ranger({ 穿雲箭: 1, 破星狙擊: 1 }, ["穿雲箭", "破星狙擊"]), "穿雲箭");
  const piercing = turn(combat, "穿雲箭", 0, [{ hit: true }],
    { ascended: new Set(["穿雲箭"]) });
  assert.equal(piercing.ignoreDefensePercent, 20);
  assert.equal(piercing.combat.nextSkillIgnoreDefensePending, true);
  combat = turn(piercing.combat, "normal", 100).combat;
  assert.equal(combat.nextSkillIgnoreDefensePending, true);
  const missed = turn(ready(combat, "破星狙擊"), "破星狙擊", 200, [{ hit: false }]);
  assert.equal(missed.ignoreDefensePercent, 15);
  assert.equal(missed.combat.nextSkillIgnoreDefensePending, false);
  assert.equal(turn(missed.combat, "normal", 300).ignoreDefensePercent, 0);
});

test("a second ascended piercing cast uses the prior bonus and refreshes exactly one later cast", () => {
  const combat = ready(ranger({ 穿雲箭: 1 }, ["穿雲箭"]), "穿雲箭");
  const first = turn(combat, "穿雲箭", 0, [{ hit: true }],
    { ascended: new Set(["穿雲箭"]) });
  const recast = turn(ready(first.combat, "穿雲箭"), "穿雲箭", 100,
    [{ hit: true }], { ascended: new Set(["穿雲箭"]) });
  assert.equal(recast.ignoreDefensePercent, 35); // 20 base plus the earlier 15
  assert.equal(recast.combat.nextSkillIgnoreDefensePending, true);
  assert.equal(transitionRangerNormalKill(recast.combat).nextSkillIgnoreDefensePending, true);
});

test("phantom dodge bonus waits through normals, then the next skill spends it even on a miss", () => {
  let combat = ranger({ 幻影步: 1, 穿雲箭: 1 }, ["幻影步", "穿雲箭"]);
  combat = recordRangerEnemyAttack(combat, {
    segments: 2, countsAsReceivedHit: true, healthPercent: 54,
    canActivateFromHealth: true, ascended: true,
  }).combat;
  combat = recordRangerSuccessfulDodge(combat,
    { phantomStepActive: true, ascended: true }).combat;
  assert.equal(combat.defense.nextSkillCriticalDamagePending, true);
  combat = turn(combat, "normal", 0, [{ hit: false }]).combat;
  assert.equal(combat.defense.nextSkillCriticalDamagePending, true);
  const missed = turn(ready(combat, "穿雲箭"), "穿雲箭", 100, [{ hit: false }]);
  assert.equal(missed.phantomNextSkillCriticalDamagePercent, 35);
  assert.equal(missed.combat.defense.nextSkillCriticalDamagePending, false);
});

test("tailwind recovers only its own charge after the cast without changing queued order", () => {
  let combat = ranger({ 追風箭: 1, 穿雲箭: 1, 蒼穹箭雨: 1 }, ["追風箭", "穿雲箭"]);
  combat = ready(combat, "追風箭");
  combat.session.charge.ready.push("穿雲箭");
  combat.session.charge.charges.穿雲箭 = 4;
  const cast = turn(combat, "追風箭", 0, [{ hit: true, critical: true }], { roll: () => 0 });
  assert.equal(cast.combat.session.charge.charges.追風箭, 2);
  assert.equal(cast.combat.session.charge.charges.穿雲箭, 4);
  assert.deepEqual(cast.combat.session.charge.ready, ["穿雲箭"]);
  assert.equal(cast.combat.session.charge.ultimateEnergy, 3);
  const next = turn(cast.combat, "穿雲箭", 1);
  assert.equal(next.combat.session.charge.charges.追風箭, 3);
  assert.deepEqual(next.combat.session.charge.ready, ["追風箭"]);
});

test("all sky-rain ranks divide their listed total into eight independent rains and one main", () => {
  for (const [index, [total, rain]] of [[400, 30], [450, 34], [505, 38], [565, 42], [630, 46]].entries()) {
    const combat = ready(ranger({ 蒼穹箭雨: index + 1 }), "蒼穹箭雨");
    combat.session.charge.ultimateEnergy = 100;
    const cast = turn(combat, "蒼穹箭雨", 0, Array.from({ length: 9 }, () => ({ hit: true })));
    assert.equal(cast.damageSegmentPercents.length, 9);
    assert.deepEqual(cast.damageSegmentPercents, [...Array(8).fill(rain), total - 8 * rain]);
    assert.equal(cast.damageSegmentPercents.reduce((sum, value) => sum + value, 0), total);
    assert.equal(cast.combat.session.charge.ultimateEnergy, 0);
  }
});

test("phantom lasts three enemy attacks and low HP cannot retrigger until it resets", () => {
  let combat = ranger({ 幻影步: 5, 影步反射: 1 }, ["幻影步"]);
  const incoming = (healthPercent, extra = {}) => recordRangerEnemyAttack(combat, {
    segments: 8, countsAsReceivedHit: true, healthPercent,
    canActivateFromHealth: true, ascended: true, ...extra,
  });
  let event = incoming(54);
  assert.equal(event.activation.dodgeChancePoints, 22);
  assert.equal(event.dodgeChancePoints, 24);
  assert.equal(event.guaranteedDodgeForAttack, true);
  combat = recordRangerSuccessfulDodge(event.combat,
    { phantomStepActive: true, ascended: true }).combat;
  assert.equal(combat.defense.guaranteedDodgePending, false);
  for (const remaining of [1, 0]) {
    event = incoming(54);
    assert.equal(event.activation, null);
    assert.equal(event.phantomActiveForAttack, true);
    assert.equal(event.dodgeChancePoints, 24);
    assert.equal(event.guaranteedDodgeForAttack, false);
    assert.equal(event.combat.defense.phantomAttacksRemaining, remaining);
    combat = event.combat;
  }
  event = incoming(54);
  assert.equal(event.activation, null);
  assert.equal(event.phantomActiveForAttack, false);
  assert.equal(event.dodgeChancePoints, 2);
  combat = event.combat;
  event = incoming(56);
  assert.equal(event.activation, null);
  combat = event.combat;
  event = incoming(54);
  assert.equal(event.activation.dodgeChancePoints, 22);
  assert.equal(event.guaranteedDodgeForAttack, true);
});

test("phantom reactivates on five received attacks after expiry even if HP stays low", () => {
  let combat = ranger({ 幻影步: 1 }, ["幻影步"]);
  const incoming = () => recordRangerEnemyAttack(combat, {
    segments: 5, countsAsReceivedHit: true, healthPercent: 40,
    canActivateFromHealth: true, ascended: false,
  });
  combat = incoming().combat;
  for (let count = 1; count <= 4; count++) {
    const event = incoming();
    assert.equal(event.activation, null);
    assert.equal(event.combat.defense.receivedAttacks, count);
    combat = event.combat;
  }
  const fifth = incoming();
  assert.equal(fifth.activation.dodgeChancePoints, 10);
  assert.equal(fifth.guaranteedDodgeForAttack, false);
  assert.equal(fifth.combat.defense.receivedAttacks, 0);
  assert.equal(transitionRangerNormalKill(fifth.combat).defense.phantomAttacksRemaining, 2);
});
