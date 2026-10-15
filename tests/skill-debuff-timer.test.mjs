import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { advanceEnemyDebuffs, applyEnemyDebuff, calculateDebuffTickRawDamage, clearEnemyDebuffs } =
  await import("../app/skill-debuff-timer.ts");

test("five-second damage over time ticks at 1, 2 and 3 seconds, including after a delayed frame", () => {
  const applied = applyEnemyDebuff({}, { kind: "bleed" }, 0);
  assert.deepEqual(applied.ticks, []);
  assert.deepEqual(advanceEnemyDebuffs(applied.state, 999).ticks, []);
  const delayed = advanceEnemyDebuffs(applied.state, 5100);
  assert.deepEqual(delayed.ticks.map((tick) => tick.at), [1000, 2000, 3000, 4000, 5000]);
  assert.deepEqual(delayed.state, {});
  assert.deepEqual(advanceEnemyDebuffs(delayed.state, 5000).ticks, []);
});

test("refresh preserves next tick and settles missed ticks before extending expiry", () => {
  let state = applyEnemyDebuff({}, { kind: "burn" }, 0).state;
  const refreshed = applyEnemyDebuff(state, { kind: "burn" }, 2500);
  assert.deepEqual(refreshed.ticks.map((tick) => tick.at), [1000, 2000]);
  assert.equal(refreshed.state.burn.nextTickAt, 3000);
  assert.equal(refreshed.state.burn.expiresAt, 7500);
  state = advanceEnemyDebuffs(refreshed.state, 7500);
  assert.deepEqual(state.ticks.map((tick) => tick.at), [3000, 4000, 5000, 6000, 7000]);
  assert.deepEqual(state.state, {});
});

test("bleed stacks cap at three, or five when ascended, and share one tick", () => {
  let state = applyEnemyDebuff({}, { kind: "bleed" }, 0).state;
  state = applyEnemyDebuff(state, { kind: "bleed" }, 100).state;
  state = applyEnemyDebuff(state, { kind: "bleed" }, 200).state;
  assert.equal(state.bleed.stacks, 3);
  state = applyEnemyDebuff(state, { kind: "bleed", ascendedBleed: true }, 300).state;
  assert.equal(state.bleed.stacks, 4);
  assert.deepEqual(advanceEnemyDebuffs(state, 1000).ticks, [{ kind: "bleed", at: 1000, stacks: 4 }]);
});

test("armor break keeps stronger value; marks refresh without stacking or damage ticks", () => {
  let state = applyEnemyDebuff({}, { kind: "armorBreak", strength: 30 }, 0).state;
  state = applyEnemyDebuff(state, { kind: "armorBreak", strength: 15 }, 2000).state;
  assert.equal(state.armorBreak.strength, 30);
  assert.equal(state.armorBreak.expiresAt, 6000);
  state = applyEnemyDebuff(state, { kind: "hunterMark", level: 1 }, 2000).state;
  state = applyEnemyDebuff(state, { kind: "hunterMark", level: 5 }, 3000).state;
  assert.equal(state.hunterMark.stacks, 1);
  assert.equal(state.hunterMark.expiresAt, 15000);
  assert.deepEqual(advanceEnemyDebuffs(state, 15000).ticks, []);
});

test("skill supplied duration overrides defaults and blood brand lasts 6 to 12 seconds", () => {
  const fissure = applyEnemyDebuff({}, { kind: "armorBreak", strength: 50, durationSeconds: 5 }, 100);
  assert.equal(fissure.state.armorBreak.expiresAt, 5100);
  const brand = applyEnemyDebuff({}, { kind: "bloodBrand", level: 5, strength: 30 }, 0);
  assert.equal(brand.state.bloodBrand.expiresAt, 12000);
  assert.equal(applyEnemyDebuff({}, { kind: "bloodBrand", level: 1, strength: 15 }, 0).state.bloodBrand.expiresAt, 6000);
  assert.throws(() => applyEnemyDebuff({}, { kind: "bleed", durationSeconds: 0 }, 0), RangeError);
});

test("death clears status and reapplication after expiry starts a fresh tick clock", () => {
  const old = applyEnemyDebuff({}, { kind: "burn" }, 0).state;
  const fresh = applyEnemyDebuff(old, { kind: "burn" }, 5500);
  assert.deepEqual(fresh.ticks.map((tick) => tick.at), [1000, 2000, 3000, 4000, 5000]);
  assert.equal(fresh.state.burn.nextTickAt, 6500);
  assert.deepEqual(advanceEnemyDebuffs(clearEnemyDebuffs(), 10000).ticks, []);
});

test("ascended bleed bonus stays on one-second ticks, including settled ticks before refresh", () => {
  let state = applyEnemyDebuff({}, { kind: "bleed", bleedDamageBonusPercent: 20 }, 0).state;
  const refreshed = applyEnemyDebuff(state, { kind: "bleed" }, 1500);
  assert.deepEqual(refreshed.ticks, [
    { kind: "bleed", at: 1000, stacks: 1, bleedDamageBonusPercent: 20 },
  ]);
  assert.equal(refreshed.state.bleed.bleedDamageBonusPercent, 20);
  assert.equal(refreshed.state.bleed.nextTickAt, 2000);
  state = advanceEnemyDebuffs(refreshed.state, 6500);
  assert.deepEqual(state.ticks, [2000, 3000, 4000, 5000, 6000].map((at) => ({
    kind: "bleed", at, stacks: 2, bleedDamageBonusPercent: 20,
  })));
  assert.deepEqual(state.state, {});
  assert.throws(() => applyEnemyDebuff({}, { kind: "burn", bleedDamageBonusPercent: 20 }, 0), RangeError);
});

test("one tick uses the selected attack snapshot: bleed per stack 20%, burn 30%, ascended bleed +20%", () => {
  const attackAtApplication = 680;
  const bleed = { kind: "bleed", at: 1000, stacks: 1 };
  assert.equal(calculateDebuffTickRawDamage(bleed, attackAtApplication), 204);
  assert.equal(calculateDebuffTickRawDamage({ ...bleed, stacks: 2 }, attackAtApplication), 408);
  assert.equal(calculateDebuffTickRawDamage({
    ...bleed, stacks: 3, bleedDamageBonusPercent: 20,
  }, attackAtApplication), 734.4);
  assert.equal(calculateDebuffTickRawDamage({ kind: "burn", at: 1000, stacks: 1 }, attackAtApplication), 408);
  assert.throws(() => calculateDebuffTickRawDamage({ ...bleed, stacks: 6 }, attackAtApplication), RangeError);
  assert.throws(() => calculateDebuffTickRawDamage(bleed, Number.NaN), RangeError);
});

test("a live blood brand also increases damage-over-time ticks", () => {
  const ordinary = calculateDebuffTickRawDamage({ kind: "bleed", at: 1000, stacks: 1 }, 100);
  const exposed = calculateDebuffTickRawDamage({ kind: "bleed", at: 1000, stacks: 1,
    targetDamageTakenBonusPercent: 30 }, 100);
  assert.equal(exposed, ordinary * 1.3);
});
