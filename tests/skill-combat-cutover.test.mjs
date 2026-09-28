import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });

const { beginSkillBattleCutover, settleCutoverAction } = await import("../app/skill-combat-cutover.ts");
const { createSkillDamageLedger } = await import("../app/skill-damage-settlement.ts");

const segments = [
  { key: "primary", source: "original", hit: true, damage: 30 },
  { key: "follow-up", source: "equipment", hit: true, damage: 20 },
];

test("each battle type chooses legacy until both the switch and readiness are true", () => {
  for (const encounter of ["tower", "personal-boss", "world-boss"]) {
    const battleId = `battle-${encounter}`;
    for (const [enableRework, reworkReady] of [[false, false], [true, false], [false, true]]) {
      assert.equal(beginSkillBattleCutover({ battleId, encounter, enableRework, reworkReady }).mode, "legacy");
    }
    const route = beginSkillBattleCutover({ battleId, encounter, enableRework: true, reworkReady: true });
    assert.deepEqual(route, { battleId, encounter, mode: "rework" });
    assert.throws(() => { route.mode = "legacy"; }, TypeError);
  }
});

test("legacy action only returns its old damage and never spends the new ledger", () => {
  const route = beginSkillBattleCutover({ battleId: "run-1", encounter: "tower", enableRework: false, reworkReady: true });
  const ledger = createSkillDamageLedger("run-1", "enemy-1", 100);
  const result = settleCutoverAction(route, {
    battleId: "run-1", sequence: 1, legacyDamage: 9, rework: { ledger, segments },
  });
  assert.deepEqual(result, { mode: "legacy", damage: 9 });
  assert.equal(ledger.remainingHealth, 100);
  assert.equal(ledger.lastActionSequence, 0);
});

test("reworked action ignores the old damage and applies the original plus follow-up once", () => {
  const route = beginSkillBattleCutover({ battleId: "boss-1", encounter: "personal-boss", enableRework: true, reworkReady: true });
  const ledger = createSkillDamageLedger("boss-1", "enemy-1", 100);
  const first = settleCutoverAction(route, {
    battleId: "boss-1", sequence: 1, legacyDamage: 900, rework: { ledger, segments },
  });
  assert.equal(first.mode, "rework");
  assert.equal(first.damage, 50);
  assert.equal(first.ledger.remainingHealth, 50);
  assert.deepEqual(first.events.map(event => event.damage), [30, 20]);
  const replay = settleCutoverAction(route, {
    battleId: "boss-1", sequence: 1, legacyDamage: 900, rework: { ledger: first.ledger, segments },
  });
  assert.equal(replay.damage, 0);
  assert.equal(replay.duplicate, true);
  assert.deepEqual(replay.events, []);
});

test("a reworked battle cannot silently switch back to legacy on missing or mismatched data", () => {
  const route = beginSkillBattleCutover({ battleId: "world-1", encounter: "world-boss", enableRework: true, reworkReady: true });
  const otherLedger = createSkillDamageLedger("world-2", "enemy-1", 100);
  assert.throws(() => settleCutoverAction(route, { battleId: "world-1", sequence: 1, legacyDamage: 50 }), RangeError);
  assert.throws(() => settleCutoverAction(route, {
    battleId: "world-1", sequence: 1, legacyDamage: 50, rework: { ledger: otherLedger, segments },
  }), RangeError);
  assert.throws(() => settleCutoverAction(route, {
    battleId: "world-2", sequence: 1, legacyDamage: 50, rework: { ledger: otherLedger, segments },
  }), RangeError);
  assert.equal(otherLedger.remainingHealth, 100);
});
