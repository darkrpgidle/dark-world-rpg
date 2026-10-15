import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });

const { settleCombatHealth } = await import("../app/skill-health-settlement.ts");

test("a hit converts real HP to the single health bar loss used by every encounter", () => {
  assert.deepEqual(settleCombatHealth(40, 200, 25), {
    actualDamage: 25, percentDamage: 12.5, remainingPercent: 27.5, defeated: false,
  });
});

test("overkill shows only remaining HP and reaches zero once", () => {
  const hit = settleCombatHealth(20, 1000, 500);
  assert.deepEqual(hit, { actualDamage: 200, percentDamage: 20, remainingPercent: 0, defeated: true });
  const afterDeath = settleCombatHealth(hit.remainingPercent, 1000, 500);
  assert.equal(afterDeath.actualDamage, 0);
  assert.equal(afterDeath.remainingPercent, 0);
});

test("a final displayed HP cannot remain alive due to percentage rounding", () => {
  const lastHit = settleCombatHealth(33.333, 100, 33);
  assert.equal(lastHit.actualDamage, 33);
  assert.equal(lastHit.percentDamage, 33.333);
  assert.equal(lastHit.remainingPercent, 0);
  assert.equal(lastHit.defeated, true);
});

test("misses, chip damage and corrupt numerical inputs cannot create free damage", () => {
  assert.equal(settleCombatHealth(100, 100, 0).remainingPercent, 100);
  assert.equal(settleCombatHealth(100, 100, 0.5).remainingPercent, 99.5);
  assert.throws(() => settleCombatHealth(NaN, 100, 1), RangeError);
  assert.throws(() => settleCombatHealth(100, 0, 1), RangeError);
  assert.throws(() => settleCombatHealth(100, 100, Infinity), RangeError);
  assert.throws(() => settleCombatHealth(100, 100, -1), RangeError);
});

