import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { createSkillBuild, upgradeSkill, equipActiveSkill } = await import("../app/skill-rework.ts");
const { createMageCombat, resolveMageTurn, transitionMageCombat } = await import("../app/skill-mage-combat.ts");
const {
  createMageShieldState, tryActivateMageShield, recordMageIncomingAttack,
  consumeMageShieldActiveCast,
} = await import("../app/skill-mage-shield.ts");

function mage(ranks, slots = []) {
  let build = createSkillBuild();
  for (const [name, rank] of Object.entries(ranks)) {
    for (let i = 0; i < rank; i++) build = upgradeSkill(build, "法師", 100, name);
  }
  for (const [index, name] of slots.entries()) build = equipActiveSkill(build, "法師", 100, index, name);
  return createMageCombat(build, 100);
}
function activate(combat, currentHealth = 500, ascended = false, maxHealth = 1000) {
  return tryActivateMageShield(combat, { currentHealth, maxHealth, ascended });
}
function turn(combat, skill, now, hits = [{ hit: true }], equippedItems = []) {
  return resolveMageTurn(combat, { skill, hits, now, ascended: new Set(), roll: () => 1, equippedItems });
}
function untilReady(combat, skill, time = 0) {
  for (let i = 0; i < 10 && !combat.session.charge.ready.includes(skill); i++) {
    combat = turn(combat, "normal", time + i * 100).combat;
  }
  assert.ok(combat.session.charge.ready.includes(skill));
  return combat;
}

test("activation requires a learned shield, living HP strictly below 60%, and no existing shield", () => {
  assert.deepEqual(createMageShieldState(),
    { value: 0, initialValue: 0, ascended: false, enhancedCastsRemaining: 0 });
  const unlearned = mage({ 星界寂滅: 1 });
  assert.equal(activate(unlearned).activated, false);
  const combat = mage({ 魔力護盾: 1 });
  assert.equal(activate(combat, 600).activated, false);
  assert.equal(activate(combat, 0).activated, false);
  const triggered = activate(combat, 599.999);
  assert.equal(triggered.activated, true);
  assert.equal(triggered.initialShieldValue, 120);
  assert.equal(triggered.combat.shield.value, 120);
  assert.equal(activate(triggered.combat, 500).activated, false);
  assert.equal(triggered.combat.session.charge.ultimateEnergy, 0);
});

test("all five shield ranks scale from the current effective maximum health", () => {
  for (const [rank, percent] of [12, 15, 18, 21, 25].entries()) {
    const result = activate(mage({ 魔力護盾: rank + 1 }));
    assert.equal(result.initialShieldValue, percent * 10);
    assert.equal(result.combat.shield.value, percent * 10);
  }
});

test("astral body no longer raises maximum health; barrier sustain still boosts active shield", () => {
  const combat = mage({ 魔力護盾: 5, 星界護體: 5, 屏障續航: 5 });
  const result = activate(combat, 500, false);
  assert.equal(result.effectiveMaxHealth, 1000);
  assert.equal(result.initialShieldValue, 325);
  assert.equal(result.combat.shield.enhancedCastsRemaining, 0);
  const existing = activate(result.combat, 500, false, 2000);
  assert.equal(existing.activated, false);
  assert.equal(existing.combat.shield.value, result.initialShieldValue);
  assert.equal(existing.combat.shield.initialValue, result.initialShieldValue);
  assert.equal(existing.effectiveMaxHealth, 2000);
});

test("astral body rolls after an unshielded hit and its barrier protects later attacks", () => {
  const combat = mage({ 星界護體: 5 });
  const first = recordMageIncomingAttack(combat, [40], { maxHealth: 1000, roll: () => 0.049 });
  assert.equal(first.remainingDamage, 40); // the proc does not absorb the hit that triggered it
  assert.equal(first.passiveShieldActivated, true);
  assert.equal(first.combat.shield.value, 100);
  assert.equal(first.combat.shield.ascended, false);

  const next = recordMageIncomingAttack(first.combat, [150], { maxHealth: 1000, roll: () => 0 });
  assert.equal(next.absorbedDamage, 100);
  assert.equal(next.remainingDamage, 50);
  assert.equal(next.passiveShieldActivated, true); // no re-roll while shielded
});

test("astral body respects its ranked chance and does not proc on zero damage", () => {
  const combat = mage({ 星界護體: 1 });
  let rolls = 0;
  const missChance = recordMageIncomingAttack(combat, [40], {
    maxHealth: 1000, roll: () => { rolls++; return 0.05; },
  });
  assert.equal(missChance.passiveShieldActivated, false); // strict 3% threshold
  assert.equal(missChance.combat.shield.value, 0);
  const noDamage = recordMageIncomingAttack(combat, [0], {
    maxHealth: 1000, roll: () => { throw Error("zero damage must not roll"); },
  });
  assert.equal(noDamage.passiveShieldActivated, false);
  assert.equal(rolls, 1);
});

test("multi-segment damage is absorbed once, overflow is returned once, and ascended break grants 15 energy", () => {
  let combat = mage({ 魔力護盾: 1, 星界寂滅: 1, 霜火新星: 1 }, ["霜火新星"]);
  const before = combat.session.charge;
  combat = activate(combat, 500, true).combat;
  assert.equal(combat.session.charge, before); // activation is no player action
  const first = recordMageIncomingAttack(combat, [20, 30]);
  assert.equal(first.absorbedDamage, 50);
  assert.equal(first.remainingDamage, 0);
  assert.equal(first.shieldBroke, false);
  assert.equal(first.combat.shield.value, 70);
  const broken = recordMageIncomingAttack(first.combat, [30, 40, 20]);
  assert.equal(broken.absorbedDamage, 70);
  assert.equal(broken.remainingDamage, 20);
  assert.equal(broken.shieldBroke, true);
  assert.equal(broken.ultimateEnergyGranted, 15);
  assert.equal(broken.combat.session.charge.ultimateEnergy, 15);
  assert.deepEqual(broken.combat.session.charge.charges, before.charges);
  assert.equal(broken.combat.shield.enhancedCastsRemaining, 3);
  const again = recordMageIncomingAttack(broken.combat, [10, 10]);
  assert.equal(again.shieldBroke, false);
  assert.equal(again.ultimateEnergyGranted, 0);
  assert.equal(again.remainingDamage, 20);
  assert.equal(again.combat.session.charge.ultimateEnergy, 15);
});

test("break energy caps at 100, prioritizes the ultimate and requires ascension and an unlocked ultimate", () => {
  let combat = mage({ 魔力護盾: 1, 霜火新星: 1, 星界寂滅: 1 }, ["霜火新星"]);
  combat = untilReady(combat, "霜火新星");
  combat = { ...combat, session: { ...combat.session, charge: { ...combat.session.charge, ultimateEnergy: 95 } } };
  const active = activate(combat, 500, true).combat;
  const broken = recordMageIncomingAttack(active, [120]);
  assert.equal(broken.combat.session.charge.ultimateEnergy, 100);
  assert.deepEqual(broken.combat.session.charge.ready, ["星界寂滅", "霜火新星"]);
  assert.equal(combat.session.charge.ultimateEnergy, 95);
  const basic = recordMageIncomingAttack(activate(combat, 500, false).combat, [120]);
  assert.equal(basic.ultimateEnergyGranted, 0);
  assert.equal(basic.combat.session.charge.ultimateEnergy, 95);
  const noUltimate = recordMageIncomingAttack(activate(mage({ 魔力護盾: 1 }), 500, true).combat, [120]);
  assert.equal(noUltimate.combat.session.charge.ultimateEnergy, 0);
});

test("three later active casts consume the ascended bonus, including a miss; normals never consume it", () => {
  let combat = activate(mage({ 魔力護盾: 1, 霜火新星: 1 }, ["霜火新星"]), 500, true).combat;
  combat = recordMageIncomingAttack(combat, [120]).combat; // the buff survives break
  for (let index = 0; index < 3; index++) {
    combat = untilReady(combat, "霜火新星", index * 1000);
    assert.equal(combat.shield.enhancedCastsRemaining, 3 - index);
    const cast = turn(combat, "霜火新星", index * 1000 + 500,
      [{ hit: index !== 1 }]);
    assert.equal(cast.shieldAscensionDamageBonusPercent, 10);
    assert.equal(cast.combat.shield.enhancedCastsRemaining, 2 - index);
    combat = cast.combat;
  }
  combat = untilReady(combat, "霜火新星", 4000);
  assert.equal(turn(combat, "霜火新星", 4500).shieldAscensionDamageBonusPercent, 0);
  assert.deepEqual(consumeMageShieldActiveCast(combat.shield, false),
    { state: combat.shield, activeDamageBonusPercent: 0 });
});

test("a status-only active cast spends one shield-enhanced cast without creating damage", () => {
  let combat = activate(mage({ 魔力護盾: 1, 元素蝕印: 1 }, ["元素蝕印"]), 500, true).combat;
  combat = untilReady(combat, "元素蝕印");
  const result = turn(combat, "元素蝕印", 500);
  assert.deepEqual(result.damageSegmentPercents, []);
  assert.equal(result.shieldAscensionDamageBonusPercent, 10);
  assert.equal(result.combat.shield.enhancedCastsRemaining, 2);
  assert.deepEqual(result.statusApplications, [{ kind: "elementSigil", level: 1, strength: 5, effectBonusPercent: 10 }]);
});

test("shield transfer ends on break but an unused ascended cast still carries its damage bonus", () => {
  let combat = mage({ 魔力護盾: 1, 霜火新星: 1, 護盾轉流: 5 }, ["霜火新星"]);
  combat = untilReady(combat, "霜火新星");
  combat = activate(combat, 500, true).combat;
  const shielded = turn(combat, "霜火新星", 400);
  assert.equal(shielded.passiveDirectDamageBonusPercent, 15);
  assert.equal(shielded.shieldAscensionDamageBonusPercent, 10);
  const broken = recordMageIncomingAttack(combat, [200]);
  assert.equal(broken.remainingDamage, 80);
  const afterward = turn(broken.combat, "霜火新星", 400);
  assert.equal(afterward.passiveDirectDamageBonusPercent, 0);
  assert.equal(afterward.shieldAscensionDamageBonusPercent, 10);
});

test("eternal core adds 25% skill damage only while the shield exists", () => {
  const core = [{ mythicId: "skill-mage-eternal-core" }];
  let combat = untilReady(activate(mage({ 魔力護盾: 1, 霜火新星: 1 }, ["霜火新星"]), 500, true).combat,
    "霜火新星");
  assert.equal(turn(combat, "霜火新星", 400, [{ hit: true }], core).equipmentSkillDamageBonusPercent, 25);
  assert.equal(turn(combat, "霜火新星", 400).equipmentSkillDamageBonusPercent, 0);
  const broken = recordMageIncomingAttack(combat, [120]);
  const cast = turn(broken.combat, "霜火新星", 400, [{ hit: true }], core);
  assert.equal(cast.equipmentSkillDamageBonusPercent, 0);
  assert.equal(cast.shieldAscensionDamageBonusPercent, 10); // ascension buff survives break
});

test("eternal core does not improve normal attacks or status-only spells", () => {
  const core = [{ mythicId: "skill-mage-eternal-core" }];
  let combat = activate(mage({ 魔力護盾: 1, 元素蝕印: 1 }, ["元素蝕印"]), 500).combat;
  assert.equal(turn(combat, "normal", 0, [{ hit: true }], core).equipmentSkillDamageBonusPercent, 0);
  combat = untilReady(combat, "元素蝕印");
  assert.equal(turn(combat, "元素蝕印", 500, [{ hit: true }], core).equipmentSkillDamageBonusPercent, 0);
});

test("normal kill retains player shield and unused buff; death and new battle boundaries clear them", () => {
  let combat = activate(mage({ 魔力護盾: 1, 星界寂滅: 1 }), 500, true).combat;
  combat = recordMageIncomingAttack(combat, [40]).combat;
  const afterKill = transitionMageCombat(combat, "normal-kill");
  assert.equal(afterKill.shield.value, 80);
  assert.equal(afterKill.shield.enhancedCastsRemaining, 3);
  for (const boundary of ["death", "map-change", "boss-start", "pvp-start"]) {
    assert.deepEqual(transitionMageCombat(combat, boundary).shield, createMageShieldState());
  }
});

test("shield activates once per battle even after break and ordinary kills; new battle resets eligibility", () => {
  let combat = activate(mage({ 魔力護盾: 1 }), 500).combat;
  combat = recordMageIncomingAttack(combat, [120]).combat;
  assert.equal(combat.shield.value, 0);
  assert.equal(activate(combat, 500).activated, false);
  const nextMonster = transitionMageCombat(combat, "normal-kill");
  assert.equal(nextMonster.shieldActivatedThisBattle, false);
  assert.equal(activate(nextMonster, 500).activated, true);
  for (const boundary of ["death", "map-change", "boss-start", "pvp-start", "reconnect"]) {
    const fresh = transitionMageCombat(combat, boundary);
    assert.equal(fresh.shieldActivatedThisBattle, false);
    assert.equal(activate(fresh, 500).activated, true);
  }
});

test("invalid health and damage inputs cannot create shield or grant energy", () => {
  const combat = mage({ 魔力護盾: 1 });
  for (const input of [
    { currentHealth: -1, maxHealth: 1000 },
    { currentHealth: 1001, maxHealth: 1000 },
    { currentHealth: NaN, maxHealth: 1000 },
    { currentHealth: 500, maxHealth: 0 },
  ]) {
    assert.throws(() => tryActivateMageShield(combat, { ...input, ascended: false }), RangeError);
  }
  assert.ok(activate(mage({ 魔力護盾: 1 }), 500, false, Number.MAX_VALUE).initialShieldValue > 0);
  for (const bad of [[], [-1], [NaN], [Infinity]]) {
    assert.throws(() => recordMageIncomingAttack(combat, bad), RangeError);
  }
  assert.equal(recordMageIncomingAttack(combat, [0, 10]).remainingDamage, 10);
});
