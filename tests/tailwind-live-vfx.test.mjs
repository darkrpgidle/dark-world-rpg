import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith("./") && !specifier.endsWith(".ts") ? `${specifier}.ts` : specifier, context);
} });
const { syncLiveCombat, resolveLiveCombatAttack } = await import("../app/skill-live-combat.ts");
const { createSkillAscensions } = await import("../app/skill-ascensions.ts");
function cast({ ascended = true, hitChance = 100, criticalChance = 100, rolls = [], constant = 0 } = {}) {
  const battle = syncLiveCombat(null, {}, "enemy", { ranks: { 追風箭: 1 }, activeSlots: ["追風箭", null, null] },
    "遊俠", 100, createSkillAscensions());
  battle.ascended = new Set(ascended ? ["追風箭"] : []);
  battle.combat.session.charge.charges["追風箭"] = 3;
  battle.combat.session.charge.ready = ["追風箭"];
  return resolveLiveCombatAttack(battle, { now: 1000, healthPercent: 100, attack: 100,
    hitChance, criticalChance, criticalDamage: 50, roll: () => rolls.shift() ?? constant });
}
test("critical tailwind reports the real charge recovery and a separately hit ascension arrow", () => {
  const action = cast();
  assert.equal(action.name, "追風箭");
  assert.equal(action.tailwindChargeRecovered, true);
  assert.deepEqual(action.tailwindEcho, { hit: true, critical: true, damagePercent: 90 });
  assert.equal(action.damagePercent, 307.5);
});
test("failed recovery chance does not suppress the independent ascension arrow", () => {
  const action = cast({ constant: .5 });
  assert.equal(action.tailwindChargeRecovered, false);
  assert.equal(action.tailwindEcho.hit, true);
  assert.equal(action.damagePercent, 307.5);
});
test("a separately missed follow-up still has a flight event but no damage or critical sparkle", () => {
  const action = cast({ hitChance: 50, rolls: [0, 0, .99, .99] });
  assert.equal(action.hits[0].hit, true);
  assert.deepEqual(action.tailwindEcho, { hit: false, critical: false, damagePercent: 0 });
  assert.equal(action.damagePercent, 217.5);
});
test("ordinary critical arrow can recover charge without generating an ascension arrow", () => {
  const action = cast({ ascended: false });
  assert.equal(action.tailwindChargeRecovered, true);
  assert.equal(action.tailwindEcho, null);
  assert.equal(action.damagePercent, 217.5);
});
test("noncritical or missed main arrows generate neither crit follow-up nor recovery cue", () => {
  const ordinary = cast({ criticalChance: 0 });
  assert.equal(ordinary.tailwindEcho, null);
  assert.equal(ordinary.tailwindChargeRecovered, false);
  assert.equal(ordinary.damagePercent, 145);
  const missed = cast({ hitChance: 0 });
  assert.equal(missed.tailwindEcho, null);
  assert.equal(missed.tailwindChargeRecovered, false);
  assert.equal(missed.damagePercent, 0);
});
