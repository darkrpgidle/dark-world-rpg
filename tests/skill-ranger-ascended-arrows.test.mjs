import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { createSkillBuild, upgradeSkill, equipActiveSkill } = await import("../app/skill-rework.ts");
const { createRangerCombat, resolveRangerTurn } = await import("../app/skill-ranger-combat.ts");

function ranger(names, slots) {
  let build = createSkillBuild();
  for (const name of names) build = upgradeSkill(build, "遊俠", 100, name);
  for (const [index, name] of slots.entries()) build = equipActiveSkill(build, "遊俠", 100, index, name);
  return createRangerCombat(build, 100);
}
function turn(combat, skill, now, critical = false, ascended = new Set()) {
  return resolveRangerTurn(combat, {
    skill, now, hits: [{ hit: true, critical }], ascended, roll: () => 1,
  });
}

test("ascended tailwind critical produces one 60 percent arrow without an extra attack or energy", () => {
  let combat = ranger(["追風箭", "蒼穹箭雨"], ["追風箭"]);
  for (let i = 0; i < 3; i++) combat = turn(combat, "normal", i * 100).combat;
  assert.equal(combat.session.charge.ultimateEnergy, 24);
  const cast = turn(combat, "追風箭", 300, true, new Set(["追風箭"]));
  assert.deepEqual(cast.additionalArrowEvents, [{ id: "風痕追獵", percent: 60 }]);
  assert.equal(cast.additionalArrowPercent, 60);
  assert.equal(cast.combat.session.charge.charges["追風箭"], 1);
  assert.equal(cast.combat.session.charge.ultimateEnergy, 27);
  assert.deepEqual(turn(combat, "追風箭", 300, false, new Set(["追風箭"])).additionalArrowEvents, []);
});

test("ascended snipe critical recovers two charges after its one primary attack, without charging wind domain", () => {
  const combat = ranger(["破星狙擊", "穿雲箭", "風行領域"],
    ["破星狙擊", "穿雲箭", "風行領域"]);
  combat.session.charge.ready = ["破星狙擊"];
  combat.session.charge.charges["破星狙擊"] = 9;
  combat.session.charge.charges["穿雲箭"] = 2;
  combat.session.charge.charges["風行領域"] = 6;
  const cast = turn(combat, "破星狙擊", 0, true, new Set(["破星狙擊"]));
  assert.equal(cast.attackChargeRecovered, 2);
  assert.equal(cast.combat.session.charge.charges["破星狙擊"], 3);
  assert.equal(cast.combat.session.charge.charges["穿雲箭"], 4);
  assert.equal(cast.combat.session.charge.charges["風行領域"], 7);
  assert.deepEqual(cast.combat.session.charge.ready, ["穿雲箭"]);
  const unascended = turn(combat, "破星狙擊", 0, true);
  assert.equal(unascended.attackChargeRecovered, 0);
  assert.equal(unascended.combat.session.charge.charges["穿雲箭"], 3);
});
