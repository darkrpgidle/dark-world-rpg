import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { createSkillBuild, upgradeSkill, equipActiveSkill } = await import("../app/skill-rework.ts");
const { createRangerCombat, resolveRangerTurn, transitionRangerNormalKill } =
  await import("../app/skill-ranger-combat.ts");

const ascended = new Set(["獵殺標記"]);
function setup() {
  let build = createSkillBuild();
  for (const name of ["獵殺標記", "穿雲箭", "疾風連射"]) {
    build = upgradeSkill(build, "遊俠", 100, name);
  }
  for (const [index, name] of ["獵殺標記", "穿雲箭", "疾風連射"].entries()) {
    build = equipActiveSkill(build, "遊俠", 100, index, name);
  }
  let combat = createRangerCombat(build, 100);
  // Begin at a legitimate marked-skill ready state without precharging
  // higher-priority damage skills that would take the earlier turns.
  combat.session.charge.charges["獵殺標記"] = 5;
  combat.session.charge.ready = ["獵殺標記"];
  return turn(combat, "獵殺標記", 500).combat;
}
function turn(combat, skill, now, hits = [{ hit: true }], flags = ascended) {
  return resolveRangerTurn(combat, { skill, now, hits, ascended: flags });
}

test("three critical segments on a marked target arm only the NEXT skill", () => {
  let combat = setup();
  combat.session.charge.charges["疾風連射"] = 7;
  combat.session.charge.ready = ["疾風連射"];
  const volley = turn(combat, "疾風連射", 600, [
    { hit: true, critical: true }, { hit: false, critical: true },
    { hit: true, critical: true }, { hit: true, critical: true }, { hit: true },
  ]);
  assert.deepEqual(volley.hunterExplosionEvents, []);
  assert.equal(volley.combat.hunterExplosionPending, true);
  assert.equal(volley.combat.session.charge.charges["疾風連射"], 1);
  combat = volley.combat;
  combat.session.charge.ready = ["穿雲箭"];
  combat.session.charge.charges["穿雲箭"] = 4;
  const burst = turn(combat, "穿雲箭", 700);
  assert.deepEqual(burst.hunterExplosionEvents, [{ id: "死亡鎖定", percent: 120 }]);
  assert.equal(burst.combat.hunterExplosionPending, false);
  assert.equal(burst.combat.session.charge.charges["穿雲箭"], 1);
  assert.deepEqual(turn(burst.combat, "normal", 800).hunterExplosionEvents, []);
});

test("pending explosion waits through normal attacks, expires on a missed next skill", () => {
  let combat = setup();
  for (let i = 0; i < 3; i++) combat = turn(combat, "normal", 600 + i * 100,
    [{ hit: true, critical: true }]).combat;
  assert.equal(combat.hunterExplosionPending, true);
  // Keep this action ordinary to verify the pending effect; the charged
  // piercing arrow would otherwise be selected by the normal turn queue.
  combat.session.charge.ready = [];
  combat.session.charge.charges["穿雲箭"] = 0;
  combat = turn(combat, "normal", 900).combat;
  assert.equal(combat.hunterExplosionPending, true);
  combat.session.charge.ready = ["穿雲箭"];
  combat.session.charge.charges["穿雲箭"] = 4;
  const missed = turn(combat, "穿雲箭", 1000, [{ hit: false }]);
  assert.deepEqual(missed.hunterExplosionEvents, []);
  assert.equal(missed.combat.hunterExplosionPending, false);
});

test("mark expiry drops unfinished critical progress and a new enemy clears pending burst", () => {
  let combat = setup();
  combat = turn(combat, "normal", 600, [{ hit: true, critical: true }]).combat;
  assert.equal(combat.hunterMarkCriticalHits, 1);
  combat = turn(combat, "normal", 8000).combat;
  assert.equal(combat.hunterMarkCriticalHits, 0);
  assert.equal(combat.hunterExplosionPending, false);
  combat = setup();
  for (let i = 0; i < 3; i++) combat = turn(combat, "normal", 600 + i * 100,
    [{ hit: true, critical: true }]).combat;
  combat = transitionRangerNormalKill(combat);
  assert.equal(combat.hunterExplosionPending, false);
  assert.deepEqual(combat.session.enemy, {});
  assert.ok(combat.session.charge.charges["穿雲箭"] > 0);
});

