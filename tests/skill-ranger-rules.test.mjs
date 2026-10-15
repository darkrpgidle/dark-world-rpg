import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith("./") && !specifier.endsWith(".ts") ? `${specifier}.ts` : specifier, context);
} });
const {
  RANGER_ACTIVE_RULES, RANGER_PASSIVE_RULES, rangerSkillRankValue,
  createRangerWindDomain, activateRangerWindDomain, consumeRangerWindDomain,
} = await import("../app/skill-ranger-rules.ts");
import { SKILL_REWORK_CATALOG } from "../app/skill-rework.ts";

test("ranger has eight active and twelve passive skills with exact unlock order", () => {
  const catalog = SKILL_REWORK_CATALOG.遊俠;
  assert.deepEqual(Object.keys(RANGER_ACTIVE_RULES), catalog.filter((skill) => skill.kind === "active").map((skill) => skill.name));
  assert.deepEqual(Object.keys(RANGER_PASSIVE_RULES), catalog.filter((skill) => skill.kind === "passive").map((skill) => skill.name));
  assert.deepEqual(catalog.filter((skill) => skill.kind === "active").map((skill) => skill.unlockLevel),
    [1, 10, 20, 30, 40, 52, 66, 80]);
  for (const rule of [...Object.values(RANGER_ACTIVE_RULES), ...Object.values(RANGER_PASSIVE_RULES)]) {
    for (const entry of Object.values(rule)) {
      if (Array.isArray(entry)) assert.equal(entry.length, 5);
    }
  }
});

test("representative Lv1 and Lv5 damage, chance and segment values match the rework", () => {
  assert.equal(rangerSkillRankValue(RANGER_ACTIVE_RULES.穿雲箭.damage, 1), 165);
  assert.equal(rangerSkillRankValue(RANGER_ACTIVE_RULES.穿雲箭.ignoreDefense, 5), 35);
  assert.equal(rangerSkillRankValue(RANGER_ACTIVE_RULES.疾風連射.damagePerArrow, 5), 84);
  assert.equal(RANGER_ACTIVE_RULES.疾風連射.arrows, 5);
  assert.equal(RANGER_ACTIVE_RULES.疾風連射.sixthArrowDamage, 90);
  assert.equal(rangerSkillRankValue(RANGER_ACTIVE_RULES.蒼穹箭雨.totalDamage, 5), 630);
  assert.equal(RANGER_ACTIVE_RULES.蒼穹箭雨.rainArrows, 8);
  assert.equal(RANGER_ACTIVE_RULES.蒼穹箭雨.skyMarksMax, 8);
  assert.deepEqual(RANGER_PASSIVE_RULES.鷹眼.criticalChancePoints, [3, 6, 9, 12, 15]);
  assert.deepEqual(RANGER_PASSIVE_RULES.精準連射.multihitSkillSegmentDamageBonus, [4, 6, 8, 10, 12]);
  assert.deepEqual(RANGER_PASSIVE_RULES.風之積蓄.speedPerStack, [2, 3, 3.5, 4.5, 5]);
  assert.deepEqual(RANGER_PASSIVE_RULES.要害穿透.extraCriticalDirectDamage, [5, 9, 13, 17, 20]);
  assert.equal(rangerSkillRankValue(RANGER_PASSIVE_RULES.風之積蓄.speedPerStack, 2), 3);
  assert.equal(rangerSkillRankValue(RANGER_PASSIVE_RULES.星痕蓄力.nextBurstDamagePerStack, 5), 8);
  assert.throws(() => rangerSkillRankValue(RANGER_ACTIVE_RULES.穿雲箭.damage, 0), RangeError);
  assert.throws(() => rangerSkillRankValue(RANGER_ACTIVE_RULES.穿雲箭.damage, 6), RangeError);
});

test("wind domain begins after casting and lasts eight primary actions, even on misses", () => {
  let state = activateRangerWindDomain(1, false);
  for (let index = 0; index < 8; index++) {
    const result = consumeRangerWindDomain(state, {
      kind: index % 2 ? "skill" : "normal", hits: [{ hit: false }],
    });
    assert.equal(result.attackSpeedBonusPercent, 12);
    assert.equal(result.normalDamagePenaltyPercent, index % 2 ? 0 : 10);
    assert.equal(result.state.remainingActions, 7 - index);
    state = result.state;
  }
  assert.deepEqual(state, createRangerWindDomain());
  assert.equal(consumeRangerWindDomain(state, { kind: "normal", hits: [{ hit: true }] }).attackSpeedBonusPercent, 0);
});

test("ascended wind domain gains one gale stack per critical primary cast, capped at five", () => {
  let state = activateRangerWindDomain(5, true);
  for (let index = 0; index < 6; index++) {
    const result = consumeRangerWindDomain(state, {
      kind: "skill", hits: [{ hit: true, critical: true }, { hit: true, critical: true }],
    });
    assert.equal(result.attackSpeedBonusPercent, 30 + Math.min(index, 5) * 3);
    assert.equal(result.state.galeStacks,  Math.min(index + 1, 5));
    state = result.state;
  }
  const miss = consumeRangerWindDomain(state, { kind: "normal", hits: [{ hit: false, critical: true }] });
  assert.equal(miss.attackSpeedBonusPercent, 45);
  assert.equal(miss.state.galeStacks, 5);
  assert.deepEqual(consumeRangerWindDomain(miss.state, { kind: "normal", hits: [{ hit: true }] }).state,
    createRangerWindDomain());
});
