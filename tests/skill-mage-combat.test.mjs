import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { createSkillBuild, upgradeSkill, equipActiveSkill } = await import("../app/skill-rework.ts");
const { applyEnemyDebuff } = await import("../app/skill-debuff-timer.ts");
const { trySkillProc } = await import("../app/skill-combat-session.ts");
const {
  createMageCombat, resolveMageTurn, transitionMageCombat,
  recordMageStability, clearMageCombatExhaustion,
} = await import("../app/skill-mage-combat.ts");

function mage(names, slots = names.filter((name) => name !== "星界寂滅"), ranks = {}) {
  let build = createSkillBuild();
  for (const name of names) {
    const target = ranks[name] ?? 1;
    for (let i = 0; i < target; i++) build = upgradeSkill(build, "法師", 100, name);
  }
  for (const [index, name] of slots.entries()) build = equipActiveSkill(build, "法師", 100, index, name);
  return createMageCombat(build, 100);
}

function turn(combat, skill, now, hits = [{ hit: true }], options = {}) {
  return resolveMageTurn(combat, {
    skill, now, hits, ascended: options.ascended ?? new Set(), roll: options.roll ?? (() => 1),
    equippedItems: options.equippedItems,
    finalExplosionConfirmed: skill === "星界寂滅",
  });
}

test("meteor mythic adds one critical second meteor without another cast or charge", () => {
  const item = { mythicId: "skill-mage-cataclysm-crown" };
  const ready = normalUntilSkillReady(mage(["隕星術"]), "隕星術");
  const base = turn(ready, "隕星術", 1000, [{ hit: true, critical: true }], { roll: () => 0.99 });
  const rolls = [0.99, 0.34]; // burn fails; the equipment's 35% roll succeeds
  const equipped = turn(ready, "隕星術", 1000, [{ hit: true, critical: true }], {
    equippedItems: [item], roll: () => rolls.shift(),
  });
  assert.deepEqual(equipped.equipmentDamageEvents, [{
    id: "滅世星雨", percent: 182, guaranteedCritical: true, afterOriginalSegment: 1,
  }]);
  assert.deepEqual(equipped.damageSegmentPercents, base.damageSegmentPercents);
  assert.deepEqual(equipped.combat.session.charge, base.combat.session.charge);
  assert.deepEqual(equipped.combat.session.usedDamageProcs, ["skill-mage-cataclysm-crown"]);
  assert.equal(rolls.length, 0);
});

test("meteor mythic requires its own equipment and hit, and shares two proc slots", () => {
  const item = { mythicId: "skill-mage-cataclysm-crown" };
  const ready = normalUntilSkillReady(mage(["隕星術"]), "隕星術");
  const noItem = turn(ready, "隕星術", 1000, [{ hit: true }], { roll: () => 0 });
  assert.deepEqual(noItem.equipmentDamageEvents, []);
  const otherItem = turn(ready, "隕星術", 1000, [{ hit: true }], {
    equippedItems: [{ mythicId: "skill-mage-polar-staff" }], roll: () => 0,
  });
  assert.deepEqual(otherItem.equipmentDamageEvents, []);
  const miss = turn(ready, "隕星術", 1000, [{ hit: false }], {
    equippedItems: [item], roll: () => 0,
  });
  assert.deepEqual(miss.equipmentDamageEvents, []);
  const failed = turn(ready, "隕星術", 1000, [{ hit: true }], {
    equippedItems: [item], roll: () => 0.35,
  });
  assert.deepEqual(failed.equipmentDamageEvents, []);
  const success = turn(ready, "隕星術", 1000, [{ hit: true }], {
    equippedItems: [item], roll: () => 0,
  });
  assert.equal(success.combat.session.usedDamageProcs.length, 1);
  const second = trySkillProc(success.combat.session, {
    id: "another-equipment", kind: "damage", source: "primary", family: "equipment",
  });
  const third = trySkillProc(second.session, {
    id: "third-equipment", kind: "damage", source: "primary", family: "equipment",
  });
  assert.equal(second.allowed, true);
  assert.equal(third.allowed, false);
});

function normalUntilReady(combat, count, startingAt = 0) {
  for (let i = 0; i < count; i++) combat = turn(combat, "normal", startingAt + i * 100).combat;
  return combat;
}

function normalUntilSkillReady(combat, skill, startingAt = 0) {
  for (let i = 0; i < 10 && !combat.session.charge.ready.includes(skill); i++) {
    combat = turn(combat, "normal", startingAt + i * 100).combat;
  }
  assert.ok(combat.session.charge.ready.includes(skill));
  return combat;
}

test("mage uses the shared ready queue; wrong skill, unequipped skill and early cast cannot consume it", () => {
  let combat = mage(["霜火新星", "奧術飛彈"], ["霜火新星", "奧術飛彈"]);
  assert.equal(turn(combat, "霜火新星", 0), null);
  combat = normalUntilReady(combat, 3);
  assert.deepEqual(combat.session.charge.ready, ["奧術飛彈"]);
  assert.equal(turn(combat, "normal", 300), null);
  assert.equal(turn(combat, "霜火新星", 300), null);
  assert.equal(turn(combat, "奧術飛彈", 300, [{ hit: true }]), null);
  assert.deepEqual(combat.session.charge.ready, ["奧術飛彈"]);
  assert.equal(turn(combat, "魔力護盾", 300), null);
  const cast = turn(combat, "奧術飛彈", 300, [{ hit: true }, { hit: true }, { hit: true }]);
  assert.deepEqual(cast.damageSegmentPercents, [50, 50, 50]);
  assert.equal(cast.combat.session.charge.charges.奧術飛彈, 1);
  assert.deepEqual(cast.combat.session.charge.ready, ["霜火新星"]);
});

test("frost hit rolls burn once, schedules exactly one tick per second and keeps direct damage separate", () => {
  let combat = normalUntilReady(mage(["霜火新星", "星界寂滅"], ["霜火新星"]), 4);
  let rolls = 0;
  const cast = turn(combat, "霜火新星", 400, [{ hit: true }], { roll: () => { rolls++; return 0.19; } });
  assert.equal(rolls, 1);
  assert.deepEqual(cast.damageSegmentPercents, [155]);
  assert.equal(cast.burnChancePercent, 20);
  assert.deepEqual(cast.statusApplications, [{ kind: "burn" }]);
  assert.equal(cast.combat.session.enemy.burn.expiresAt, 3400);
  assert.equal(cast.combat.session.charge.ultimateEnergy, 35); // four normals + status
  const later = turn(cast.combat, "normal", 2400);
  assert.deepEqual(later.dueTicks, [
    { kind: "burn", at: 1400, stacks: 1 },
    { kind: "burn", at: 2400, stacks: 1 },
  ]);
  assert.deepEqual(later.damageSegmentPercents, [100]);
  assert.equal(later.combat.session.charge.ultimateEnergy, 43); // tick does not grant energy
});

test("frost misses and failed burn rolls apply no status or status energy", () => {
  let combat = normalUntilReady(mage(["霜火新星", "星界寂滅"], ["霜火新星"]), 4);
  let rolls = 0;
  const miss = turn(combat, "霜火新星", 400, [{ hit: false }], { roll: () => { rolls++; return 0; } });
  assert.equal(rolls, 0);
  assert.deepEqual(miss.statusApplications, []);
  assert.equal(miss.combat.session.charge.ultimateEnergy, 32);
  combat = normalUntilReady(miss.combat, 3, 500);
  const failed = turn(combat, "霜火新星", 800, [{ hit: true }], { roll: () => 0.2 });
  assert.deepEqual(failed.statusApplications, []); // threshold is strictly below 20%
  assert.equal(failed.burnChancePercent, 20);
});

test("element sigil blocks a ready recast while active, then permits it after wall-clock expiry", () => {
  let combat = normalUntilReady(mage(["元素蝕印"]), 5);
  let cast = turn(combat, "元素蝕印", 500);
  assert.deepEqual(cast.statusApplications, [{ kind: "elementSigil", level: 1, strength: 5 }]);
  assert.equal(cast.combat.session.enemy.elementSigil.expiresAt, 7500);
  combat = normalUntilReady(cast.combat, 5, 600);
  assert.deepEqual(combat.session.charge.ready, ["元素蝕印"]);
  assert.equal(turn(combat, "元素蝕印", 1200), null);
  const between = turn(combat, "normal", 1200);
  assert.deepEqual(between.combat.session.charge.ready, ["元素蝕印"]);
  cast = turn(between.combat, "元素蝕印", 7500);
  assert.equal(cast.combat.session.enemy.elementSigil.expiresAt, 14500);
  assert.deepEqual(cast.combat.session.charge.ready, []);
});

test("existing sigil raises frost's burn chance; application and expiry use the old target snapshot", () => {
  let combat = mage(["霜火新星"]);
  combat = {
    ...combat,
    session: { ...combat.session, enemy: applyEnemyDebuff({}, { kind: "elementSigil", strength: 14 }, 0).state },
  };
  combat = normalUntilReady(combat, 4, 100);
  const cast = turn(combat, "霜火新星", 500, [{ hit: true }], { roll: () => 0.33 });
  assert.equal(cast.burnChancePercent, 34);
  assert.deepEqual(cast.statusApplications, [{ kind: "burn" }]);
  let expired = normalUntilReady(cast.combat, 3, 8000);
  const later = turn(expired, "霜火新星", 8500, [{ hit: true }], { roll: () => 0.33 });
  assert.equal(later.burnChancePercent, 20);
  assert.deepEqual(later.statusApplications, []);
});

test("ranked meteor rolls burn once and void bonus uses only existing abnormal statuses", () => {
  let meteor = normalUntilReady(mage(["隕星術"], ["隕星術"], { 隕星術: 5 }), 8);
  const result = turn(meteor, "隕星術", 800, [{ hit: true }], { roll: () => 0.49 });
  assert.deepEqual(result.damageSegmentPercents, [395]);
  assert.equal(result.burnChancePercent, 50);
  assert.deepEqual(result.statusApplications, [{ kind: "burn" }]);

  let voidCombat = normalUntilReady(mage(["虛空崩解"], ["虛空崩解"], { 虛空崩解: 5 }), 9);
  voidCombat = {
    ...voidCombat,
    session: { ...voidCombat.session, enemy: applyEnemyDebuff({}, { kind: "burn" }, 0).state },
  };
  const voidHit = turn(voidCombat, "虛空崩解", 900);
  assert.deepEqual(voidHit.damageSegmentPercents, [365]);
  assert.equal(voidHit.conditionalDamageBonusPercent, 40);
  assert.deepEqual(voidHit.statusApplications, []);
  const expired = turn(voidCombat, "虛空崩解", 4000);
  assert.equal(expired.conditionalDamageBonusPercent, 0);
  assert.deepEqual(expired.dueTicks.map((tick) => tick.at), [1000, 2000, 3000]);
  assert.equal(turn(normalUntilReady(mage(["虛空崩解"], ["虛空崩解"]), 9), "虛空崩解", 900)
    .conditionalDamageBonusPercent, 0);
});

test("missile has three independent outcomes, but critical energy and overload charge count once", () => {
  let combat = mage(["奧術飛彈", "奧術超載", "星界寂滅"], ["奧術飛彈", "奧術超載"]);
  combat = normalUntilReady(combat, 3);
  const missiles = turn(combat, "奧術飛彈", 300,
    [{ hit: false }, { hit: true, critical: true }, { hit: true, critical: true }]);
  assert.deepEqual(missiles.damageSegmentPercents, [50, 50, 50]);
  assert.equal(missiles.combat.session.charge.charges.奧術超載, 1);
  assert.equal(missiles.combat.session.charge.ultimateEnergy, 27);
  assert.deepEqual(missiles.statusApplications, []);
});

test("astral ultimate has six 40%-share beams and one 60%-share explosion", () => {
  const combat = normalUntilReady(mage(["星界寂滅"], []), 13);
  assert.deepEqual(combat.session.charge.ready, ["星界寂滅"]);
  assert.equal(turn(combat, "normal", 1300), null);
  const hits = [
    { hit: true, critical: true }, { hit: false }, { hit: true },
    { hit: false }, { hit: true }, { hit: false }, { hit: true },
  ];
  const result = turn(combat, "星界寂滅", 1300, hits, {
    ascended: new Set(["星界寂滅"]),
  });
  assert.equal(result.totalDamagePercent, 420);
  assert.deepEqual(result.damageSegmentPercents, [28, 28, 28, 28, 28, 28, 252]);
  assert.equal(result.ultimateCollapseStacks, 3);
  assert.equal(result.finalExplosionDamageBonusPercent, 24);
  assert.equal(result.combat.session.charge.ultimateEnergy, 3);
  assert.deepEqual(result.combat.session.charge.ready, []);
  const finalMiss = turn(combat, "星界寂滅", 1300, [
    ...Array.from({ length: 6 }, () => ({ hit: true })), { hit: false },
  ], { ascended: new Set(["星界寂滅"]) });
  assert.equal(finalMiss.ultimateCollapseStacks, 6);
  assert.equal(finalMiss.finalExplosionDamageBonusPercent, 0);
  assert.equal(turn(combat, "星界寂滅", 1300, hits.slice(0, 6)), null);
});

test("six successful original skill casts unlock overload; activation affects only later casts", () => {
  let combat = mage(["奧術飛彈", "奧術超載"], ["奧術飛彈", "奧術超載"], { 奧術超載: 5 });
  for (let i = 0; i < 6; i++) {
    combat = normalUntilSkillReady(combat, "奧術飛彈", i * 400);
    combat = turn(combat, "奧術飛彈", i * 400 + 300,
      [{ hit: false }, { hit: true }, { hit: false }]).combat;
    assert.equal(combat.session.charge.charges.奧術超載, i + 1);
  }
  assert.deepEqual(combat.session.charge.ready, ["奧術超載"]);
  assert.equal(turn(combat, "奧術超載", 2500, [{ hit: true }]), null);
  const activated = turn(combat, "奧術超載", 2500, [], { ascended: new Set(["奧術超載"]) });
  assert.deepEqual(activated.damageSegmentPercents, []);
  assert.equal(activated.combat.overload.phase, "overloaded");
  assert.equal(activated.combat.overload.remainingSuccessfulCasts, 6);
  assert.equal(activated.combat.overload.stabilityStacks, 0);
  assert.equal(activated.combat.session.charge.charges.奧術超載, 0);
  combat = activated.combat;
  for (let i = 0; i < 6; i++) {
    combat = normalUntilSkillReady(combat, "奧術飛彈", 2600 + i * 400);
    const cast = turn(combat, "奧術飛彈", 2900 + i * 400,
      [{ hit: true }, { hit: true }, { hit: true }]);
    assert.equal(cast.skillEfficiencyBonusPercent, 26);
    assert.equal(cast.skillDamagePenaltyPercent, 0);
    combat = cast.combat;
  }
  assert.deepEqual(combat.overload, { phase: "exhausted", basePenaltyPercent: 15 });
  assert.deepEqual(combat.session.charge.ready, ["奧術超載"]);
  assert.equal(turn(combat, "奧術超載", 5000, []), null);
  combat = normalUntilSkillReady(combat, "奧術飛彈", 5100);
  const exhaustedCast = turn(combat, "奧術飛彈", 5400,
    [{ hit: true }, { hit: false }, { hit: false }]);
  assert.equal(exhaustedCast.skillDamagePenaltyPercent, 15);
  assert.deepEqual(exhaustedCast.combat.session.charge.ready, ["奧術超載"]);
});

test("external stability and exhaustion events are explicit; only ordinary kills retain overload", () => {
  let combat = mage(["奧術飛彈", "奧術超載"], ["奧術飛彈", "奧術超載"]);
  combat = { ...combat, overload: { phase: "overloaded", rank: 1, ascended: true, remainingSuccessfulCasts: 1, stabilityStacks: 0 } };
  combat = recordMageStability(combat, 6);
  combat = normalUntilReady(combat, 3);
  const last = turn(combat, "奧術飛彈", 300, [{ hit: true }, { hit: true }, { hit: true }]);
  assert.deepEqual(last.combat.overload, { phase: "exhausted", basePenaltyPercent: 5 });
  const kill = transitionMageCombat(last.combat, "normal-kill");
  assert.deepEqual(kill.overload, last.combat.overload);
  assert.deepEqual(kill.session.charge.charges, last.combat.session.charge.charges);
  assert.deepEqual(clearMageCombatExhaustion(kill).overload, { phase: "idle" });
  for (const boundary of ["death", "map-change", "boss-start", "pvp-start"]) {
    const reset = transitionMageCombat(last.combat, boundary);
    assert.deepEqual(reset.overload, { phase: "idle" });
    assert.deepEqual(reset.session.charge.ready, []);
    assert.ok(Object.values(reset.session.charge.charges).every((value) => value === 0));
  }
});
