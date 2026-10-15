import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith("./") && !specifier.endsWith(".ts") ? `${specifier}.ts` : specifier, context);
} });
const { syncLiveCombat, resolveLiveEnemyAttack, resolveLiveCombatAttack } = await import("../app/skill-live-combat.ts");
const { createSkillAscensions } = await import("../app/skill-ascensions.ts");
const { phantomStepVisualState } = await import("../app/ranger-phantom-state.ts");
function battle(ascended = false) {
  const b = syncLiveCombat(null, {}, "enemy", { ranks: { 幻影步: 1, 穿雲箭: 1 },
    activeSlots: ["幻影步", "穿雲箭", null] }, "遊俠", 100, createSkillAscensions());
  b.ascended = new Set(ascended ? ["幻影步"] : []); return b;
}
const incoming = (b, roll = .99, healthPercent = 100) => resolveLiveEnemyAttack(b,
  { healthPercent, maxHealth: 100, damage: 10, roll: () => roll });
const outgoing = (b, hitChance = 100) => resolveLiveCombatAttack(b, { now: 1000,
  healthPercent: 100, attack: 100, hitChance, criticalChance: 0, criticalDamage: 50, roll: () => .5 });
test("fifth enemy attack activates phantom without fabricating a successful dodge", () => {
  const b = battle();
  for (let i = 0; i < 4; i++) assert.equal(incoming(b).phantomStep.activated, false);
  const result = incoming(b);
  assert.deepEqual(result.phantomStep, { activated: true, dodged: false, guaranteedConsumed: false });
  assert.equal(result.damage, 10);
  const v = phantomStepVisualState(b.combat.defense, null, 5, result.phantomStep);
  assert.equal(v.active, true); assert.equal(v.burst, "activate"); assert.equal(v.nextHitReady, false);
});
test("low HP activation with confirmed ordinary dodge grants only the real next-hit cue", () => {
  const b = battle(), result = incoming(b, 0, 54);
  assert.deepEqual(result.phantomStep, { activated: true, dodged: true, guaranteedConsumed: false });
  const v = phantomStepVisualState(b.combat.defense, null, 1, result.phantomStep);
  assert.equal(v.burst, "dodge"); assert.equal(v.nextHitReady, true); assert.equal(v.nextSkillReady, false);
});
test("ascension guaranteed dodge creates shatter and consumes guarantee exactly once", () => {
  const b = battle(true), result = incoming(b, .99, 54);
  assert.equal(result.dodged, true); assert.equal(result.damage, 0);
  assert.equal(result.phantomStep.guaranteedConsumed, true);
  const v = phantomStepVisualState(b.combat.defense, null, 1, result.phantomStep);
  assert.equal(v.burst, "shatter"); assert.equal(v.nextSkillReady, true);
  const second = incoming(b); assert.equal(second.dodged, false);
  assert.equal(second.phantomStep.guaranteedConsumed, false);
});
test("three enemy events end persistent phantom; unconsumed crit cues remain", () => {
  const b = battle(true); incoming(b, .99, 54); incoming(b); incoming(b);
  const v = phantomStepVisualState(b.combat.defense, null, 3);
  assert.equal(v.active, false); assert.equal(v.nextHitReady, true); assert.equal(v.nextSkillReady, true);
  assert.equal(v.burst, null);
});
test("successful normal attack consumes next-hit cue; active skill consumes ascension cue", () => {
  const b = battle(true); incoming(b, .99, 54);
  outgoing(b);
  assert.equal(b.combat.defense.nextHitCriticalChancePoints, 0);
  assert.equal(b.combat.defense.nextSkillCriticalDamagePending, true);
  b.combat.session.charge.ready = ["穿雲箭"];
  b.combat.session.charge.charges["穿雲箭"] = 5;
  assert.equal(outgoing(b).name, "穿雲箭");
  assert.equal(b.combat.defense.nextSkillCriticalDamagePending, false);
});
test("miss keeps next-hit cue while ordinary passive dodge does not produce phantom burst", () => {
  const b = battle(true); incoming(b, .99, 54); outgoing(b, 0);
  assert.equal(b.combat.defense.nextHitCriticalChancePoints, 10);
  const fresh = battle(); const result = resolveLiveEnemyAttack(fresh,
    { healthPercent: 100, maxHealth: 100, damage: 10, baseDodgeChance: 100, roll: () => 0 });
  assert.equal(result.dodged, true); assert.equal(result.phantomStep.dodged, false);
  assert.equal(phantomStepVisualState(fresh.combat.defense, null, 1, result.phantomStep), null);
});
test("normal kill preserves actual pending buffs; a new battle clears them", () => {
  const b = battle(true); incoming(b, .99, 54);
  const reset = syncLiveCombat(b, b.owner, "next-enemy", b.combat.build, "遊俠", 100, createSkillAscensions());
  assert.equal(phantomStepVisualState(reset.combat.defense, null, 2).nextSkillReady, true);
  const fresh = syncLiveCombat(reset, {}, "next-enemy", reset.combat.build, "遊俠", 100, createSkillAscensions());
  assert.equal(phantomStepVisualState(fresh.combat.defense, null, 3), null);
});
test("new defense burst replaces older key; player action preserves pending burst", () => {
  const b = battle(); const first = incoming(b, .99, 54);
  const v = phantomStepVisualState(b.combat.defense, null, 1, first.phantomStep);
  const action = phantomStepVisualState(b.combat.defense, v, 2);
  assert.equal(action.eventKey, 1); assert.equal(action.burst, "activate");
  const dodge = incoming(b, 0);
  assert.equal(phantomStepVisualState(b.combat.defense, action, 3, dodge.phantomStep).eventKey, 3);
});
