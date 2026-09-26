import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { createSkillBuild, upgradeSkill, equipActiveSkill } = await import("../app/skill-rework.ts");
const { applyEnemyDebuff } = await import("../app/skill-debuff-timer.ts");
const { createMageCombat, resolveMageTurn } = await import("../app/skill-mage-combat.ts");
const { magePassiveStats, resolveMagePassiveAttack } = await import("../app/skill-mage-passives.ts");
const { trySkillProc } = await import("../app/skill-combat-session.ts");
const { grantUltimateEnergy } = await import("../app/skill-combat-queue.ts");

function mage(names, slots = names.filter((name) => ["霜火新星", "奧術飛彈", "隕星術", "虛空崩解"].includes(name)), ranks = {}) {
  let build = createSkillBuild();
  for (const name of names) {
    for (let i = 0; i < (ranks[name] ?? 1); i++) build = upgradeSkill(build, "法師", 100, name);
  }
  for (const [index, name] of slots.entries()) build = equipActiveSkill(build, "法師", 100, index, name);
  return createMageCombat(build, 100);
}
function turn(combat, skill, now, hits = [{ hit: true }], options = {}) {
  return resolveMageTurn(combat, {
    skill, hits, now, ascended: new Set(), roll: options.roll ?? (() => 1),
    shieldValue: options.shieldValue,
    finalExplosionConfirmed: options.finalExplosionConfirmed,
  });
}
function charge(combat, count, start = 0) {
  for (let i = 0; i < count; i++) combat = turn(combat, "normal", start + i * 100).combat;
  return combat;
}
function withStatus(combat, kind, now = 0, options = {}) {
  return {
    ...combat,
    session: { ...combat.session, enemy: applyEnemyDebuff(combat.session.enemy, { kind, ...options }, now).state },
  };
}

test("unlearned passives contribute nothing; learned health and shield bonuses remain separate snapshot inputs", () => {
  const empty = mage(["霜火新星"]);
  assert.deepEqual(magePassiveStats(empty.build), { maxHealthBonusPercent: 0, initialShieldBonusPercent: 0 });
  const learned = mage(["霜火新星", "星界護體", "屏障續航"], ["霜火新星"],
    { 星界護體: 5, 屏障續航: 5 });
  assert.deepEqual(magePassiveStats(learned.build), { maxHealthBonusPercent: 12, initialShieldBonusPercent: 12 });
  assert.equal(turn(charge(learned, 4), "霜火新星", 400).passiveDirectDamageBonusPercent, 0);
});

test("arcane sense affects active direct damage, not normal attacks, missed casts, buffs or target ticks", () => {
  const prepared = charge(mage(["霜火新星", "奧術感知"], ["霜火新星"], { 奧術感知: 5 }), 4);
  assert.equal(turn(prepared, "霜火新星", 400).passiveDirectDamageBonusPercent, 12);
  assert.equal(turn(prepared, "霜火新星", 400, [{ hit: false }]).passiveDirectDamageBonusPercent, 0);
  const normal = turn(mage(["奧術感知"], [], { 奧術感知: 5 }), "normal", 0);
  assert.equal(normal.passiveDirectDamageBonusPercent, 0);
  const statusOnly = resolveMagePassiveAttack(prepared.build, {
    kind: "skill", hits: [{ hit: true }], targetStatuses: {}, shieldValue: 0,
    hasDirectDamage: false, isUltimate: false, finalExplosionConfirmed: false, roll: () => 0,
  });
  assert.equal(statusOnly.directDamageBonusPercent, 0);
});

test("normal-only flame vein makes one burn roll, awards one status energy and preserves refresh tick cadence", () => {
  const combat = mage(["焰脈", "星界寂滅"], [], { 焰脈: 5 });
  let draws = 0;
  const first = turn(combat, "normal", 0, [{ hit: true }], { roll: () => { draws++; return 0.11; } });
  assert.equal(draws, 1);
  assert.deepEqual(first.statusApplications, [{ kind: "burn" }]);
  assert.equal(first.combat.session.charge.ultimateEnergy, 11);
  assert.equal(first.combat.session.enemy.burn.nextTickAt, 1000);
  const refreshed = turn(first.combat, "normal", 500, [{ hit: true }], { roll: () => 0 });
  assert.equal(refreshed.combat.session.enemy.burn.nextTickAt, 1000);
  assert.equal(refreshed.combat.session.enemy.burn.expiresAt, 3500);
  const miss = turn(refreshed.combat, "normal", 750, [{ hit: false }], { roll: () => { throw Error("no roll on miss"); } });
  assert.deepEqual(miss.statusApplications, []);
  assert.equal(miss.combat.session.charge.ultimateEnergy, 22);
});

test("precision adds points to a skill's one burn roll, preserving the existing sigil bonus", () => {
  let combat = mage(["霜火新星", "精密咒式"], ["霜火新星"], { 精密咒式: 5 });
  combat = withStatus(combat, "elementSigil", 0, { strength: 14 });
  combat = charge(combat, 4, 100);
  let draws = 0;
  const cast = turn(combat, "霜火新星", 500, [{ hit: true }], { roll: () => { draws++; return 0.41; } });
  assert.equal(cast.passiveStatusChancePoints, 8);
  assert.equal(cast.burnChancePercent, 42);
  assert.equal(draws, 1);
  assert.deepEqual(cast.statusApplications, [{ kind: "burn" }]);
});

test("burn guidance, shield transfer and resonance count only existing, distinct abnormal states", () => {
  let combat = mage(["霜火新星", "奧術感知", "燃燼導引", "護盾轉流", "元素共振"],
    ["霜火新星"], { 奧術感知: 5, 燃燼導引: 5, 護盾轉流: 5, 元素共振: 5 });
  combat = withStatus(combat, "burn", 0);
  combat = withStatus(combat, "bleed", 0);
  combat = withStatus(combat, "bleed", 0); // two stacks are one abnormal kind
  combat = withStatus(combat, "armorBreak", 0);
  combat = withStatus(combat, "elementSigil", 0);
  assert.equal(combat.session.enemy.bleed.stacks, 2);
  combat = charge(combat, 4);
  const shielded = turn(combat, "霜火新星", 400, [{ hit: true }], { shieldValue: 1 });
  assert.equal(shielded.abnormalKindsCounted, 3);
  assert.equal(shielded.passiveDirectDamageBonusPercent, 12 + 18 + 12 + 24);
  assert.equal(turn(combat, "霜火新星", 400, [{ hit: true }], { shieldValue: 0 })
    .passiveDirectDamageBonusPercent, 12 + 18 + 24);
  assert.equal(turn(combat, "霜火新星", 400, [{ hit: false }], { shieldValue: 1 })
    .passiveDirectDamageBonusPercent, 0);
  assert.equal(turn(combat, "霜火新星", 8000, [{ hit: true }], { shieldValue: 1 })
    .passiveDirectDamageBonusPercent, 12 + 12);
});

test("ember echo rolls once only against an already burning target and does not refresh burn", () => {
  let combat = mage(["奧術飛彈", "餘燼回響", "星界寂滅"], ["奧術飛彈"], { 餘燼回響: 5 });
  combat = withStatus(combat, "burn", 0);
  combat = charge(combat, 3);
  let draws = 0;
  const cast = turn(combat, "奧術飛彈", 300,
    [{ hit: true }, { hit: false }, { hit: true }], { roll: () => { draws++; return 0.14; } });
  assert.equal(draws, 1);
  assert.deepEqual(cast.passiveDamageProcs, [{ id: "餘燼回響", percent: 65 }]);
  assert.equal(cast.combat.session.enemy.burn.expiresAt, 3000);
  assert.equal(cast.combat.session.charge.ultimateEnergy, 24); // three normals only
  assert.equal(cast.combat.session.usedDamageProcs.length, 1);
  assert.deepEqual(turn(combat, "奧術飛彈", 300,
    [{ hit: false }, { hit: false }, { hit: false }], { roll: () => { throw Error("no roll on miss"); } })
    .passiveDamageProcs, []);
  const fresh = charge(mage(["霜火新星", "餘燼回響"], ["霜火新星"]), 4);
  assert.deepEqual(turn(fresh, "霜火新星", 400, [{ hit: true }], { roll: () => 0 })
    .passiveDamageProcs, []); // burn added by this cast was absent at its start
});

test("arcane cycle grants energy once per successful cast, capped and queued after earlier skills", () => {
  let combat = mage(["奧術飛彈", "奧術循環", "星界寂滅"], ["奧術飛彈"], { 奧術循環: 5 });
  combat = charge(combat, 3);
  const cast = turn(combat, "奧術飛彈", 300,
    [{ hit: true, critical: true }, { hit: true, critical: true }, { hit: false }]);
  assert.equal(cast.passiveUltimateEnergyGain, 6);
  assert.equal(cast.combat.session.charge.ultimateEnergy, 24 + 3 + 6);
  assert.equal(turn(combat, "奧術飛彈", 300, [{ hit: false }, { hit: false }, { hit: false }])
    .passiveUltimateEnergyGain, 0);

  const near = { ...combat.session.charge, ultimateEnergy: 98, ready: ["奧術飛彈"] };
  const gained = grantUltimateEnergy(near, 6);
  assert.equal(gained.ultimateEnergy, 100);
  assert.deepEqual(gained.ready, ["奧術飛彈", "星界寂滅"]);
  assert.deepEqual(near.ready, ["奧術飛彈"]);
  assert.throws(() => grantUltimateEnergy(near, -1), RangeError);
});

test("final explosion echo requires an explicit final hit; two passive procs share the two-slot limit", () => {
  let combat = mage(["星界寂滅", "餘燼回響", "星界回爆", "奧術循環"], [],
    { 餘燼回響: 5, 星界回爆: 5, 奧術循環: 5 });
  combat = withStatus(combat, "burn", 0);
  combat = charge(combat, 13);
  const hits = [{ hit: true }, { hit: true }, { hit: true }];
  assert.deepEqual(turn(combat, "星界寂滅", 1300, hits, { roll: () => 0 }).passiveDamageProcs,
    [{ id: "餘燼回響", percent: 65 }]);
  assert.deepEqual(turn(combat, "星界寂滅", 1300,
    [{ hit: true }, { hit: false }], { roll: () => 0, finalExplosionConfirmed: true }).passiveDamageProcs,
    [{ id: "餘燼回響", percent: 65 }]);
  const cast = turn(combat, "星界寂滅", 1300, hits,
    { roll: () => 0, finalExplosionConfirmed: true });
  assert.deepEqual(cast.passiveDamageProcs, [
    { id: "餘燼回響", percent: 65 }, { id: "星界回爆", percent: 90 },
  ]);
  assert.deepEqual(cast.combat.session.usedDamageProcs, ["餘燼回響", "星界回爆"]);
  assert.equal(cast.passiveUltimateEnergyGain, 6);
  assert.equal(cast.combat.session.charge.ultimateEnergy, 6); // ultimate spent its 100 first
  assert.equal(trySkillProc(cast.combat.session, {
    id: "裝備追加", kind: "damage", source: "primary", family: "equipment",
  }).allowed, false);
  assert.equal(trySkillProc(cast.combat.session, {
    id: "星界回爆", kind: "damage", source: "proc", family: "passive",
  }).allowed, false);
});

test("exhaustion control reduces the next skill's penalty but cannot create a damage bonus", () => {
  let combat = mage(["霜火新星", "枯竭控制"], ["霜火新星"], { 枯竭控制: 5 });
  combat = { ...combat, overload: { phase: "exhausted", basePenaltyPercent: 5 } };
  combat = charge(combat, 4);
  const cast = turn(combat, "霜火新星", 400);
  assert.equal(cast.skillDamagePenaltyPercent, 0);
  assert.equal(cast.combat.overload.phase, "exhausted");
  assert.equal(turn(combat, "霜火新星", 400, [{ hit: false }]).skillDamagePenaltyPercent, 0);
});
