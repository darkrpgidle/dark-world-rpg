import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { createSkillBuild, upgradeSkill, equipActiveSkill } = await import("../app/skill-rework.ts");
const { createMageCombat, resolveMageTurn, transitionMageCombat } = await import("../app/skill-mage-combat.ts");
const { applyEnemyDebuff } = await import("../app/skill-debuff-timer.ts");
const { countMageAbnormalKinds } = await import("../app/skill-mage-passives.ts");

function mage(ranks, slot = null) {
  let build = createSkillBuild();
  for (const [name, rank] of Object.entries(ranks)) {
    for (let i = 0; i < rank; i++) build = upgradeSkill(build, "法師", 100, name);
  }
  if (slot) build = equipActiveSkill(build, "法師", 100, 0, slot);
  return createMageCombat(build, 100);
}
function turn(combat, skill, now, hits = [{ hit: true }], options = {}) {
  return resolveMageTurn(combat, {
    skill, now, hits, ascended: options.ascended ?? new Set(),
    finalExplosionConfirmed: options.finalExplosionConfirmed ?? false,
    roll: options.roll ?? (() => 1),
  });
}
function charge(combat, count) {
  for (let index = 0; index < count; index++) combat = turn(combat, "normal", index * 100).combat;
  return combat;
}
function withStatuses(combat, kinds, at = 800) {
  let enemy = combat.session.enemy;
  for (const kind of kinds) enemy = applyEnemyDebuff(enemy, { kind }, at).state;
  return { ...combat, session: { ...combat.session, enemy } };
}

test("void collapse adds 18 points per distinct existing abnormal kind up to three", () => {
  const base = charge(mage({ 虛空崩解: 5, 星界寂滅: 1 }, "虛空崩解"), 9);
  const ascended = new Set(["虛空崩解"]);
  for (const [kinds, expected] of [
    [[], 0], [["burn"], 18], [["burn", "bleed"], 36],
    [["burn", "bleed", "armorBreak"], 54],
    [["burn", "bleed", "armorBreak", "elementSigil"], 54],
  ]) {
    const input = withStatuses(base, kinds);
    const result = turn(input, "虛空崩解", 900, [{ hit: true }], { ascended });
    assert.deepEqual(result.damageSegmentPercents, [365]);
    assert.equal(result.conditionalDamageBonusPercent, kinds.length ? 40 : 0);
    assert.equal(result.voidAscensionDamageBonusPercent, expected);
    assert.equal(result.combat.session.charge.charges.虛空崩解, 1);
    assert.equal(result.combat.session.charge.ultimateEnergy, 72);
  }
});

test("multiple bleed stacks count once; the provisional mage category list excludes other marks", () => {
  const base = charge(mage({ 虛空崩解: 1 }, "虛空崩解"), 9);
  const combat = withStatuses(base, ["bleed", "bleed", "bloodBrand", "hunterMark"]);
  assert.equal(combat.session.enemy.bleed.stacks, 2);
  assert.equal(countMageAbnormalKinds(combat.session.enemy), 1);
  const result = turn(combat, "虛空崩解", 900, [{ hit: true }],
    { ascended: new Set(["虛空崩解"]) });
  assert.equal(result.conditionalDamageBonusPercent, 20);
  assert.equal(result.voidAscensionDamageBonusPercent, 18);
  assert.deepEqual(result.combat.session.usedDamageProcs, []);
});

test("the ascension bonus needs its own ascension, original hit and unexpired statuses", () => {
  const base = charge(mage({ 虛空崩解: 1 }, "虛空崩解"), 9);
  const marked = withStatuses(base, ["burn"]);
  const ascended = new Set(["虛空崩解"]);
  assert.equal(turn(marked, "虛空崩解", 900).conditionalDamageBonusPercent, 20);
  assert.equal(turn(marked, "虛空崩解", 900).voidAscensionDamageBonusPercent, 0);
  assert.equal(turn(marked, "虛空崩解", 900, [{ hit: false }], { ascended })
    .voidAscensionDamageBonusPercent, 0);
  assert.equal(turn(marked, "虛空崩解", 5800, [{ hit: true }], { ascended })
    .voidAscensionDamageBonusPercent, 0);
  assert.equal(turn(transitionMageCombat(marked, "normal-kill"), "虛空崩解", 900,
    [{ hit: true }], { ascended }).voidAscensionDamageBonusPercent, 0);
});

test("six preceding hits grant six collapse stacks, applying 48% only to confirmed final explosion", () => {
  const base = charge(mage({ 星界寂滅: 5, 星界回爆: 5, 奧術循環: 5 }), 13);
  const hits = Array.from({ length: 7 }, () => ({ hit: true }));
  const result = turn(base, "星界寂滅", 1300, hits,
    { ascended: new Set(["星界寂滅"]), finalExplosionConfirmed: true });
  assert.equal(result.totalDamagePercent, 660);
  assert.deepEqual(result.damageSegmentPercents, [44, 44, 44, 44, 44, 44, 396]);
  assert.equal(result.ultimateCollapseStacks, 6);
  assert.equal(result.finalExplosionDamageBonusPercent, 48);
  assert.deepEqual(result.passiveDamageProcs, [{ id: "星界回爆", percent: 90 }]);
  assert.equal(result.passiveUltimateEnergyGain, 6);
  assert.equal(result.combat.session.charge.ultimateEnergy, 6);
  assert.equal(result.combat.session.usedDamageProcs.length, 1);
});

test("missed preceding segments grant no stack, and additional hits stop at the six-stack cap", () => {
  const base = charge(mage({ 星界寂滅: 1 }), 13);
  const ascended = new Set(["星界寂滅"]);
  const partial = turn(base, "星界寂滅", 1300,
    [{ hit: true }, { hit: false }, { hit: true }, { hit: false },
      { hit: true }, { hit: false }, { hit: true }],
    { ascended, finalExplosionConfirmed: true });
  assert.equal(partial.ultimateCollapseStacks, 3);
  assert.equal(partial.finalExplosionDamageBonusPercent, 24);
  const many = turn(base, "星界寂滅", 1300,
    Array.from({ length: 7 }, () => ({ hit: true })),
    { ascended, finalExplosionConfirmed: true });
  assert.equal(many.ultimateCollapseStacks, 6);
  assert.equal(many.finalExplosionDamageBonusPercent, 48);
  assert.equal(many.combat.session.charge.ultimateEnergy, 0);
});

test("a missed final explosion gives no bonus or final-hit proc even if earlier hits built stacks", () => {
  const base = charge(mage({ 星界寂滅: 1, 星界回爆: 5, 奧術循環: 5 }), 13);
  const hits = [...Array.from({ length: 6 }, () => ({ hit: true })), { hit: false }];
  const result = turn(base, "星界寂滅", 1300, hits,
    { ascended: new Set(["星界寂滅"]), finalExplosionConfirmed: true });
  assert.equal(result.ultimateCollapseStacks, 6);
  assert.equal(result.finalExplosionDamageBonusPercent, 0);
  assert.deepEqual(result.passiveDamageProcs, []);
  assert.equal(result.combat.session.charge.ultimateEnergy, 6); // one successful cast, not six
});

test("an unconfirmed final segment or absent ascension cannot borrow a beam hit as the explosion", () => {
  const base = charge(mage({ 星界寂滅: 1, 星界回爆: 5 }), 13);
  const hits = Array.from({ length: 7 }, () => ({ hit: true }));
  const ascended = new Set(["星界寂滅"]);
  const unconfirmed = turn(base, "星界寂滅", 1300, hits, { ascended });
  assert.equal(unconfirmed.ultimateCollapseStacks, 0);
  assert.equal(unconfirmed.finalExplosionDamageBonusPercent, 0);
  assert.deepEqual(unconfirmed.passiveDamageProcs, []);
  const ordinary = turn(base, "星界寂滅", 1300, hits,
    { finalExplosionConfirmed: true });
  assert.equal(ordinary.ultimateCollapseStacks, 0);
  assert.equal(ordinary.finalExplosionDamageBonusPercent, 0);
  assert.deepEqual(ordinary.passiveDamageProcs, [{ id: "星界回爆", percent: 90 }]);
});

test("the final segment itself grants no stack, and every ultimate rank preserves its defined total", () => {
  for (const [index, total] of [420, 475, 530, 590, 660].entries()) {
    const base = charge(mage({ 星界寂滅: index + 1 }), 13);
    const result = turn(base, "星界寂滅", 1300,
      [...Array.from({ length: 6 }, () => ({ hit: false })), { hit: true }],
      { ascended: new Set(["星界寂滅"]), finalExplosionConfirmed: true });
    assert.equal(result.totalDamagePercent, total);
    assert.equal(result.ultimateCollapseStacks, 0);
    assert.equal(result.finalExplosionDamageBonusPercent, 0);
    assert.equal(result.combat.session.charge.ultimateEnergy, 0);
  }
});
