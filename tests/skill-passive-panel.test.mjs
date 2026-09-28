import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });

const { skillPassivePanelStats } = await import("../app/skill-passive-panel.ts");

test("unlearned passives leave every character-sheet bonus at zero", () => {
  const build = { ranks: {}, activeSlots: [null, null, null] };
  for (const characterClass of ["戰士", "遊俠", "法師"]) {
    assert.deepEqual(skillPassivePanelStats(build, characterClass, 100), {
      maxHealthBonusPercent: 0,
      attackSpeedBonusPercent: 0,
      criticalChancePoints: 0,
      dodgeChancePoints: 0,
      blockChancePoints: 0,
      lowHealthDamageReductionPercent: 0,
      initialShieldBonusPercent: 0,
    });
  }
});

test("warrior health, block and conditional low-health reduction are reported", () => {
  const build = { ranks: { 鐵骨: 5, 格擋精通: 5, 逆境鋼心: 5 }, activeSlots: [null, null, null] };
  assert.deepEqual(skillPassivePanelStats(build, "戰士", 100), {
    maxHealthBonusPercent: 12, attackSpeedBonusPercent: 0,
    criticalChancePoints: 0, dodgeChancePoints: 0, blockChancePoints: 11,
    lowHealthDamageReductionPercent: 0, initialShieldBonusPercent: 0,
  });
  assert.equal(skillPassivePanelStats(build, "戰士", 39).lowHealthDamageReductionPercent, 12);
});

test("ranger speed, critical and dodge passives return their sheet bonuses", () => {
  const build = { ranks: { 迅捷手感: 5, 鷹眼: 5, 影步反射: 5 }, activeSlots: [null, null, null] };
  assert.deepEqual(skillPassivePanelStats(build, "遊俠", 100), {
    maxHealthBonusPercent: 0, attackSpeedBonusPercent: 12,
    criticalChancePoints: 7, dodgeChancePoints: 7,
    blockChancePoints: 0, lowHealthDamageReductionPercent: 0, initialShieldBonusPercent: 0,
  });
});

test("mage health and initial shield passives return their sheet bonuses", () => {
  const build = { ranks: { 星界護體: 5, 屏障續航: 5 }, activeSlots: [null, null, null] };
  assert.deepEqual(skillPassivePanelStats(build, "法師", 100), {
    maxHealthBonusPercent: 12, attackSpeedBonusPercent: 0,
    criticalChancePoints: 0, dodgeChancePoints: 0,
    blockChancePoints: 0, lowHealthDamageReductionPercent: 0,
    initialShieldBonusPercent: 12,
  });
});
