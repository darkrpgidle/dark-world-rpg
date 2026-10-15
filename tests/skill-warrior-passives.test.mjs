import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { createSkillBuild, upgradeSkill, equipActiveSkill } = await import("../app/skill-rework.ts");
const { createWarriorCombat, resolveWarriorTurn } = await import("../app/skill-warrior-combat.ts");
const { warriorPassiveDefenses, recordWarriorBlock, consumeWarriorCounter, resolveWarriorPassiveAttack } = await import("../app/skill-warrior-passives.ts");
const { trySkillProc, transitionCombatSession } = await import("../app/skill-combat-session.ts");

function warrior(passives, skills = []) {
  let build = createSkillBuild();
  for (const name of [...passives, ...skills]) build = upgradeSkill(build, "戰士", 100, name);
  for (const [index, name] of skills.filter((name) => name !== "泰坦斷界斬").entries()) {
    build = equipActiveSkill(build, "戰士", 100, index, name);
  }
  return createWarriorCombat(build, 100);
}

function turn(combat, { skill = "normal", now = 0, hits = [{ hit: true }], hp = 100, roll = () => 0.99 } = {}) {
  return resolveWarriorTurn(combat, { skill, hits, now, healthPercent: hp, ascended: new Set(), roll });
}

test("health, block, counter, and low-health protection expose exactly ranked values", () => {
  const combat = warrior(["鐵骨", "格擋精通", "逆境鋼心", "堅盾反射"]);
  assert.deepEqual(warriorPassiveDefenses(combat.build, 39), {
    defenseBonusFlat: 20, blockChancePoints: 3, incomingDamageReductionPercent: 6,
  });
  const maxedIronbone = warrior(["鐵骨"]).build;
  for (let rank = 1; rank < 5; rank++) maxedIronbone.ranks.鐵骨 = rank + 1;
  assert.equal(warriorPassiveDefenses(maxedIronbone, 100).defenseBonusFlat, 150);
  assert.equal(warriorPassiveDefenses(combat.build, 40).incomingDamageReductionPercent, 0);
  const blocked = recordWarriorBlock(combat.passives, combat.build);
  const first = consumeWarriorCounter(blocked, combat.build);
  assert.equal(first.damageBonusPercent, 10);
  assert.equal(consumeWarriorCounter(first.state, combat.build).damageBonusPercent, 0);
  const strike = turn({ ...combat, passives: blocked });
  assert.deepEqual(strike.passiveDamageProcs, [{ id: "堅盾反射", percent: 20 }]);
  assert.equal(turn(strike.combat, { now: 100 }).passiveDamageProcs.length, 0);
});

test("bleed passive rolls once for normal attacks and skills, but not for misses", () => {
  let combat = warrior(["裂傷本能"]);
  let rolls = 0;
  const result = turn(combat, { hits: [{ hit: true }, { hit: true }], roll: () => { rolls++; return 0; } });
  assert.equal(rolls, 1);
  assert.deepEqual(result.statusApplications, [{ kind: "bleed", durationSeconds: 5, ascendedBleed: false }]);
  assert.equal(result.combat.session.enemy.bleed.stacks, 1);
  assert.equal(result.combat.session.enemy.bleed.expiresAt, 5000);
  combat = result.combat;
  turn(combat, { now: 100, hits: [{ hit: false }], roll: () => { rolls++; return 0; } });
  assert.equal(rolls, 1);
  combat = warrior(["裂傷本能"], ["裂地斬"]);
  combat.session.charge.ready = ["裂地斬"];
  rolls = 0;
  const skillResult = turn(combat, { skill: "裂地斬", now: 200, hits: [{ hit: true }, { hit: true }],
    roll: () => { rolls++; return 0; } });
  assert.equal(rolls, 1);
  assert.ok(skillResult.statusApplications.some((status) => status.kind === "bleed"));
});

test("bleeding and armor-broken target effects use the target state before this hit", () => {
  let combat = warrior(["破鎧追擊", "血氣汲取", "血痕累積", "重刃專精", "過度失血", "絕境怒火"], ["裂地斬"]);
  combat.session.enemy.bleed = { kind: "bleed", expiresAt: 5000, stacks: 1, strength: 0, nextTickAt: 1000 };
  combat.session.enemy.armorBreak = { kind: "armorBreak", expiresAt: 5000, stacks: 1, strength: 15 };
  const first = turn(combat, { hp: 39 });
  assert.equal(first.bonusDamagePercent, 16); // armor break 8 + low HP 8; blood trace starts next attack
  assert.equal(first.lifestealPercent, 5);
  assert.equal(first.combat.passives.bloodTraceStacks, 1);
  combat = first.combat;
  const second = turn(combat, { now: 100, hp: 39 });
  assert.equal(second.bonusDamagePercent, 18);
  combat = second.combat;
  for (let i = 2; i < 4; i++) combat = turn(combat, { now: i * 100 }).combat;
  const cast = turn(combat, { skill: "裂地斬", now: 400, hp: 39 });
  assert.equal(cast.bonusDamagePercent, 8 + 4 + 6 + 8);
  assert.equal(cast.baseDamagePercent, 150);
  assert.equal(cast.combat.passives.bloodTraceStacks, 3);
  combat = cast.combat;
  combat.session.enemy = {};
  for (let i = 5; i < 8; i++) combat = turn(combat, { now: i * 100 }).combat;
  assert.equal(combat.passives.bloodTraceStacks, 0);
});

test("titan aftershock is saved for next primary attack and shares two-proc limit with equipment", () => {
  let combat = warrior(["堅盾反射", "泰坦餘震", "格擋精通"], ["泰坦斷界斬"]);
  combat.session.charge.ultimateEnergy = 100;
  combat.session.charge.ready = ["泰坦斷界斬"];
  combat.passives = recordWarriorBlock(combat.passives, combat.build);
  const ultimate = turn(combat, { skill: "泰坦斷界斬" });
  assert.deepEqual(ultimate.passiveDamageProcs, [{ id: "堅盾反射", percent: 20 }]);
  assert.equal(ultimate.combat.passives.titanAftershockPending, true);
  let next = ultimate.combat;
  next.passives = recordWarriorBlock(next.passives, next.build);
  const strike = turn(next, { now: 100 });
  assert.deepEqual(strike.passiveDamageProcs.map((x) => x.id), ["堅盾反射", "泰坦餘震"]);
  const equipment = trySkillProc(strike.combat.session, { id: "weapon", kind: "damage", source: "primary", family: "equipment" });
  assert.equal(equipment.allowed, false);
  assert.equal(turn(strike.combat, { now: 200 }).passiveDamageProcs.length, 0);
});

test("over-bleed amplifies bleed ticks, and pending next-attack proc expires on a miss", () => {
  const combat = warrior(["重刃專精", "過度失血", "裂傷本能", "堅盾反射"], ["裂地斬"]);
  const burst = resolveWarriorPassiveAttack(combat.passives, combat.build, {
    kind: "skill", category: "burst", hit: true, targetBleeding: false, targetArmorBroken: true,
    healthPercent: 100, isUltimate: false, ascendedBleed: false, roll: () => 1,
  });
  assert.equal(burst.damageBonusPercent, 4);
  const clean = resolveWarriorPassiveAttack(combat.passives, combat.build, {
    kind: "skill", category: "burst", hit: true, targetBleeding: false, targetArmorBroken: false,
    healthPercent: 100, isUltimate: false, ascendedBleed: false, roll: () => 1,
  });
  assert.equal(clean.damageBonusPercent, 4);
  combat.session.charge.ready = ["裂地斬"];
  const bleedingStrike = turn(combat, { skill: "裂地斬", roll: () => 0 });
  assert.equal(bleedingStrike.combat.session.enemy.bleed.expiresAt, 5000);
  const missCombat = warrior(["重刃專精", "過度失血", "裂傷本能", "堅盾反射"], ["裂地斬"]);
  missCombat.session.charge.ready = ["裂地斬"];
  const pending = recordWarriorBlock(missCombat.passives, missCombat.build);
  const missed = turn({ ...missCombat, passives: pending }, { skill: "裂地斬", hits: [{ hit: false }] });
  assert.deepEqual(missed.passiveDamageProcs, []);
  assert.equal(missed.combat.passives.shieldReflectionPending, false);
});

test("crossing to the next normal monster keeps the warrior buff but clears target statuses", () => {
  let combat = warrior(["血痕累積"]);
  combat.session.enemy.bleed = { kind: "bleed", expiresAt: 5000, stacks: 1, strength: 0, nextTickAt: 1000 };
  combat = turn(combat).combat;
  combat = { ...combat, session: transitionCombatSession(combat.session, "normal-kill") };
  assert.equal(combat.passives.bloodTraceStacks, 1);
  assert.equal(combat.session.enemy.bleed, undefined);
  assert.equal(turn(combat, { now: 100 }).bonusDamagePercent, 2);
});
