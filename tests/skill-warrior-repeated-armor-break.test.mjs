import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { createSkillBuild, upgradeSkill, equipActiveSkill } = await import("../app/skill-rework.ts");
const { createWarriorCombat, resolveWarriorTurn } = await import("../app/skill-warrior-combat.ts");
const { warriorRepeatedArmorBreakBonus } = await import("../app/skill-warrior-rules.ts");
const { skillDisplay } = await import("../app/skill-rework-display.ts");

function combat(rank, existingStrength = 30, expiresAt = 4000) {
  let build = createSkillBuild();
  for (let i = 0; i < rank; i++) build = upgradeSkill(build, "戰士", 100, "碎甲猛擊");
  build = equipActiveSkill(build, "戰士", 100, 0, "碎甲猛擊");
  const state = createWarriorCombat(build, 100);
  state.session.charge.charges["碎甲猛擊"] = 8;
  state.session.charge.ready = ["碎甲猛擊"];
  if (existingStrength !== null) state.session.enemy.armorBreak = {
    kind: "armorBreak", expiresAt, stacks: 1, strength: existingStrength,
  };
  return state;
}

function cast(state, options = {}) {
  return resolveWarriorTurn(state, {
    skill: "碎甲猛擊", hits: [{ hit: true }], healthPercent: 100, now: 500,
    ascended: new Set(["碎甲猛擊"]), ...options,
  });
}

test("all five ranks convert twice the new break rate, capped at 60% of base skill multiplier", () => {
  const base = [240, 265, 290, 320, 350];
  const bonuses = [40, 48, 56, 60, 60];
  for (let rank = 1; rank <= 5; rank++) {
    const result = cast(combat(rank));
    assert.equal(warriorRepeatedArmorBreakBonus(rank), bonuses[rank - 1]);
    assert.equal(result.baseDamagePercent, base[rank - 1]);
    assert.equal(result.repeatedArmorBreakBonusPercent, bonuses[rank - 1]);
    assert.equal(result.effectiveBaseDamagePercent, base[rank - 1] * (1 + bonuses[rank - 1] / 100));
    assert.equal(result.repeatedArmorBreakBonusCapPercent, 60);
    assert.equal(result.combat.session.enemy.armorBreak.stacks, 1);
    assert.equal(result.combat.session.enemy.armorBreak.expiresAt, 4500);
  }
  assert.throws(() => warriorRepeatedArmorBreakBonus(0), RangeError);
});

test("old break strength does not replace the current skill rank or stack its reduction", () => {
  const stronger = cast(combat(1, 36));
  const weaker = cast(combat(1, 5));
  assert.equal(stronger.repeatedArmorBreakBonusPercent, 40);
  assert.equal(weaker.repeatedArmorBreakBonusPercent, 40);
  assert.equal(stronger.combat.session.enemy.armorBreak.strength, 36);
  assert.equal(weaker.combat.session.enemy.armorBreak.strength, 20);
  assert.equal(stronger.combat.session.charge.charges["碎甲猛擊"], 1);
});

test("new target, expired break, missed attack and ordinary skill cannot convert break", () => {
  for (const state of [combat(5, null), combat(5, 36, 500)]) {
    const first = cast(state);
    assert.equal(first.repeatedArmorBreakBonusPercent, 0);
    assert.equal(first.effectiveBaseDamagePercent, first.baseDamagePercent);
  }
  const missed = cast(combat(5), { hits: [{ hit: false }] });
  assert.equal(missed.repeatedArmorBreakBonusPercent, 0);
  assert.equal(missed.statusApplications.length, 0);
  const normal = cast(combat(5), { ascended: new Set() });
  assert.equal(normal.repeatedArmorBreakBonusPercent, 0);
  assert.equal(normal.combat.session.enemy.armorBreak.strength, 36);
});

test("conversion remains separate from passive damage and refreshes the known skill preview", () => {
  const state = combat(1);
  state.build.ranks["破鎧追擊"] = 1;
  state.build.ranks["戰慄重擊"] = 1;
  const result = cast(state);
  assert.equal(result.repeatedArmorBreakBonusPercent, 40);
  assert.equal(result.bonusDamagePercent, 14);
  assert.equal(result.effectiveBaseDamagePercent, 336);
  assert.match(skillDisplay("戰士", "碎甲猛擊").ascensionEffect, /破防率 ×2.*\+60%/);
});
