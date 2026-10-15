import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });

const { createSkillDamageLedger, nextSkillDamageTarget, settleSkillDamageAction } =
  await import("../app/skill-damage-settlement.ts");
const { createSkillBuild, upgradeSkill, equipActiveSkill } = await import("../app/skill-rework.ts");
const { createMageCombat, resolveMageTurn } = await import("../app/skill-mage-combat.ts");

test("each original hit and follow-up has one display result and one shared HP reduction", () => {
  const initial = createSkillDamageLedger("run-7", "enemy-1", 100);
  const first = settleSkillDamageAction(initial, 1, [
    { key: "arrow-1", source: "original", hit: true, damage: 30 },
    { key: "arrow-2", source: "original", hit: false, damage: 900 },
    { key: "arrow-3", source: "original", hit: true, damage: 25 },
    { key: "echo", source: "equipment", hit: true, damage: 15 },
  ]);
  assert.equal(initial.remainingHealth, 100);
  assert.equal(first.ledger.remainingHealth, 30);
  assert.equal(first.appliedDamage, 70);
  assert.deepEqual(first.events.map((event) => [event.source, event.hit, event.damage]), [
    ["original", true, 30], ["original", false, 0],
    ["original", true, 25], ["equipment", true, 15],
  ]);
  assert.equal(new Set(first.events.map((event) => event.key)).size, 4);
  const replay = settleSkillDamageAction(first.ledger, 1, [
    { key: "arrow-1", source: "original", hit: true, damage: 999 },
  ]);
  assert.equal(replay.duplicate, true);
  assert.equal(replay.appliedDamage, 0);
  assert.deepEqual(replay.events, []);
  assert.strictEqual(replay.ledger, first.ledger);
});

test("overkill stops later damage segments and a new monster retains the replay guard", () => {
  const initial = createSkillDamageLedger("run-7", "enemy-1", 20);
  const kill = settleSkillDamageAction(initial, 12, [
    { key: "meteor", source: "original", hit: true, damage: 50 },
    { key: "afterburst", source: "ascension", hit: true, damage: 50 },
  ]);
  assert.equal(kill.appliedDamage, 20);
  assert.equal(kill.ledger.remainingHealth, 0);
  assert.equal(kill.events.length, 1);
  const next = nextSkillDamageTarget(kill.ledger, "enemy-2", 80);
  assert.equal(settleSkillDamageAction(next, 12, [{ key: "meteor", source: "original", hit: true, damage: 50 }]).duplicate, true);
  const strike = settleSkillDamageAction(next, 13, [{ key: "meteor", source: "original", hit: true, damage: 50 }]);
  assert.equal(strike.ledger.remainingHealth, 30);
  assert.notEqual(strike.events[0].key, kill.events[0].key);
});

test("invalid targets and duplicate or malformed segments cannot partially damage a target", () => {
  const initial = createSkillDamageLedger("run-7", "enemy-1", 100);
  assert.throws(() => nextSkillDamageTarget(initial, "enemy-1", 100), RangeError);
  assert.throws(() => createSkillDamageLedger("run-7", "enemy-1", -1), RangeError);
  assert.throws(() => settleSkillDamageAction(initial, 0, []), RangeError);
  assert.throws(() => settleSkillDamageAction(initial, 1, [
    { key: "a", source: "original", hit: true, damage: 30 },
    { key: "a", source: "equipment", hit: true, damage: 30 },
  ]), RangeError);
  assert.throws(() => settleSkillDamageAction(initial, 1, [
    { key: "a", source: "original", hit: true, damage: Infinity },
  ]), RangeError);
  assert.equal(initial.remainingHealth, 100);
});

test("a mage skill and its equipped meteor follow-up share one HP and display settlement", () => {
  let build = upgradeSkill(createSkillBuild(), "法師", 100, "隕星術");
  build = equipActiveSkill(build, "法師", 100, 0, "隕星術");
  let combat = createMageCombat(build, 100);
  for (let index = 0; index < 10 && !combat.session.charge.ready.includes("隕星術"); index++) {
    combat = resolveMageTurn(combat, {
      skill: "normal", hits: [{ hit: true }], now: index * 100, ascended: new Set(), roll: () => 1,
    }).combat;
  }
  assert.ok(combat.session.charge.ready.includes("隕星術"));
  const cast = resolveMageTurn(combat, {
    skill: "隕星術", hits: [{ hit: true }], now: 1000, ascended: new Set(), roll: () => 0,
    equippedItems: [{ mythicId: "skill-mage-cataclysm-crown" }],
  });
  assert.ok(cast);
  assert.equal(cast.equipmentDamageEvents.length, 1);
  const ledger = createSkillDamageLedger("boss-1", "enemy-1", 1000);
  const segments = [
    { key: "original-1", source: "original", hit: true, damage: cast.damageSegmentPercents[0] },
    { key: "meteor-2", source: "equipment", hit: true, damage: cast.equipmentDamageEvents[0].percent },
  ];
  const settled = settleSkillDamageAction(ledger, 1, segments);
  assert.equal(settled.ledger.remainingHealth, 558);
  assert.deepEqual(settled.events.map((event) => event.damage), [260, 182]);
  assert.equal(settleSkillDamageAction(settled.ledger, 1, segments).appliedDamage, 0);
  assert.equal(cast.combat.session.usedDamageProcs.length, 1);
});

