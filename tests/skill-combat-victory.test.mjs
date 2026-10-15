import assert from "node:assert/strict";
import test from "node:test";
import { createCombatVictoryGuard } from "../app/skill-combat-victory.ts";

test("an attack and burn tick can only award the same monster once", () => {
  const guard = createCombatVictoryGuard();
  assert.equal(guard.claim("run-1:map-1:wave-5"), true);
  assert.equal(guard.has("run-1:map-1:wave-5"), true);
  assert.equal(guard.claim("run-1:map-1:wave-5"), false);
  assert.equal(guard.claim("run-1:map-1:wave-6"), true);
  assert.equal(guard.claim("run-1:map-1:wave-5"), false);
  assert.equal(guard.claim("run-2:map-1:wave-5"), true);
  assert.equal(guard.has("run-2:map-1:wave-6"), false);
});

test("the guard keeps a bounded number of defeated targets", () => {
  const guard = createCombatVictoryGuard();
  for (let wave = 1; wave <= 90; wave++) assert.equal(guard.claim(`run-${wave}`), true);
  assert.equal(guard.claim("run-90"), false);
  assert.equal(guard.claim("run-40"), false);
  assert.throws(() => guard.claim(""), RangeError);
});

