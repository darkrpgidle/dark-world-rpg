import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

// Node runs the TypeScript source directly; the app's bundler resolves these
// extensionless imports normally. Keep the test on the same production modules.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
    return nextResolve(specifier, context);
  },
});
const { createSkillBuild, upgradeSkill, equipActiveSkill } = await import("../app/skill-rework.ts");
const {
  advanceCombatSession, createSkillCombatSession, resolveSkillAction,
  takeReadySkill, transitionCombatSession, trySkillProc,
} = await import("../app/skill-combat-session.ts");

function mageSession() {
  let build = createSkillBuild();
  for (const name of ["霜火新星", "閃電鏈", "星界寂滅"]) build = upgradeSkill(build, "法師", 100, name);
  build = equipActiveSkill(build, "法師", 100, 0, "霜火新星");
  build = equipActiveSkill(build, "法師", 100, 1, "閃電鏈");
  return createSkillCombatSession(build, "法師", 100);
}

test("one cast charges once, applies each status once and yields scheduled damage", () => {
  let state = mageSession();
  for (let i = 0; i < 3; i++) state = resolveSkillAction(state, { kind: "normal", hits: [{ hit: true }] }, i * 100).session;
  assert.equal(state.charge.ready[0], "閃電鏈");
  const selected = takeReadySkill(state, true);
  assert.equal(selected.skill, "閃電鏈");
  const result = resolveSkillAction(selected.session, {
    kind: "skill", hits: [{ hit: true, critical: true }, { hit: true, critical: true }, { hit: false }],
    successfulStatuses: [{ kind: "burn" }, { kind: "burn" }],
  }, 500);
  assert.equal(result.session.charge.charges["閃電鏈"], 1);
  assert.equal(result.session.charge.ultimateEnergy, 30); // three normal hits, one critical, one status
  assert.equal(result.session.enemy.burn.stacks, 1);
  assert.deepEqual(advanceCombatSession(result.session, 1500).ticks, [{ kind: "burn", at: 1500, stacks: 1 }]);
});

test("active enemy status blocks its ready skill until the status expires", () => {
  let build = createSkillBuild();
  build = upgradeSkill(build, "戰士", 100, "血戰烙印");
  build = equipActiveSkill(build, "戰士", 100, 0, "血戰烙印");
  let state = createSkillCombatSession(build, "戰士", 100);
  state = resolveSkillAction(state, { kind: "normal", hits: [{ hit: true }], successfulStatuses: [{ kind: "bloodBrand" }] }, 0).session;
  for (let i = 1; i < 5; i++) state = resolveSkillAction(state, { kind: "normal", hits: [{ hit: true }] }, i * 100).session;
  assert.deepEqual(state.charge.ready, ["血戰烙印"]);
  assert.equal(takeReadySkill(state, true), null);
  state = advanceCombatSession(state, 6000).session;
  assert.equal(takeReadySkill(state, true)?.skill, "血戰烙印");
});

test("secondary and damage-over-time events cannot reenter passive attack procs or charge", () => {
  const initial = mageSession();
  const passive = trySkillProc(initial, { id: "passive-1", kind: "damage", family: "passive", source: "primary" });
  const equipment = trySkillProc(passive.session, { id: "equipment-1", kind: "damage", family: "equipment", source: "secondary" });
  assert.equal(passive.allowed, true);
  assert.equal(equipment.allowed, true);
  assert.equal(trySkillProc(equipment.session, { id: "equipment-2", kind: "damage", family: "equipment", source: "primary" }).allowed, false);
  assert.equal(trySkillProc(initial, { id: "passive-2", kind: "damage", family: "passive", source: "secondary" }).allowed, false);
  assert.equal(trySkillProc(initial, { id: "equipment-2", kind: "damage", family: "equipment", source: "proc" }).allowed, false);
  assert.equal(trySkillProc(initial, { id: "equipment-2", kind: "damage", family: "equipment", source: "dot" }).allowed, false);
  assert.equal(trySkillProc(passive.session, { id: "passive-1", kind: "damage", family: "passive", source: "primary" }).allowed, false);
  assert.equal(trySkillProc(equipment.session, { id: "buff", kind: "buff", family: "passive", source: "primary" }).allowed, true);
  assert.equal(equipment.session.charge.ultimateEnergy, 0);
});

test("cross-monster transition keeps charge but clears target states and proc budget", () => {
  let state = mageSession();
  state = resolveSkillAction(state, { kind: "normal", hits: [{ hit: true }], successfulStatuses: [{ kind: "burn" }] }, 0).session;
  state = trySkillProc(state, { id: "extra", kind: "damage", family: "equipment", source: "primary" }).session;
  const nextMonster = transitionCombatSession(state, "normal-kill");
  assert.equal(nextMonster.charge.charges["霜火新星"], 1);
  assert.equal(nextMonster.charge.ultimateEnergy, 11);
  assert.deepEqual(nextMonster.enemy, {});
  assert.deepEqual(nextMonster.usedDamageProcs, []);
  const death = transitionCombatSession(state, "death");
  assert.equal(death.charge.charges["霜火新星"], 0);
  assert.equal(death.charge.ultimateEnergy, 0);
  assert.deepEqual(death.enemy, {});
});

