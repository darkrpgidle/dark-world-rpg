import assert from "node:assert/strict";
import test from "node:test";
import {
  WARRIOR_ACTIVE_RULES, WARRIOR_PASSIVE_RULES, createWarriorBuffState,
  consumeWarriorPrimaryAttack, recordWarriorSkillHit,
  triggerWarriorBloodRoar, triggerWarriorStance, warriorSkillRankValue,
} from "../app/skill-warrior-rules.ts";

test("all warrior skill levels and ascensions match the rework table", () => {
  assert.equal(Object.keys(WARRIOR_ACTIVE_RULES).length, 8);
  assert.equal(Object.keys(WARRIOR_PASSIVE_RULES).length, 12);
  assert.deepEqual(WARRIOR_ACTIVE_RULES.裂地斬.damage, [150, 160, 170, 185, 200]);
  assert.deepEqual(WARRIOR_ACTIVE_RULES.泰坦斷界斬.damage, [400, 450, 500, 560, 630]);
  assert.deepEqual(WARRIOR_ACTIVE_RULES.血戰烙印.durationSeconds, [6, 7, 8, 9, 10]);
  assert.deepEqual(WARRIOR_PASSIVE_RULES.格擋精通.blockChancePoints, [3, 5, 7, 9, 11]);
  for (const skill of Object.values(WARRIOR_ACTIVE_RULES)) {
    assert.equal(typeof skill.ascension, "string");
    for (const value of Object.values(skill)) if (Array.isArray(value)) assert.equal(value.length, 5);
  }
  for (const skill of Object.values(WARRIOR_PASSIVE_RULES)) {
    for (const value of Object.values(skill)) if (Array.isArray(value)) assert.equal(value.length, 5);
  }
  assert.throws(() => warriorSkillRankValue(WARRIOR_ACTIVE_RULES.裂地斬.damage, 0), RangeError);
});

test("blood roar triggers once below 40 percent for five attacks, with ascended finisher", () => {
  const empty = createWarriorBuffState();
  assert.equal(triggerWarriorBloodRoar(empty, 5, 40, true), null);
  let state = triggerWarriorBloodRoar(empty, 5, 39.9, true);
  assert.equal(triggerWarriorBloodRoar(state, 5, 10, true), null);
  for (let i = 0; i < 4; i++) {
    const attack = consumeWarriorPrimaryAttack(state, false);
    assert.equal(attack.damageBonusPercent, 55);
    assert.equal(attack.lifestealPercent, 30);
    assert.deepEqual(attack.extraDamagePercents, []);
    state = attack.state;
  }
  const fifth = consumeWarriorPrimaryAttack(state, false);
  assert.deepEqual(fifth.extraDamagePercents, [180]);
  assert.equal(fifth.state.bloodRoarRemaining, 0);
  assert.equal(consumeWarriorPrimaryAttack(fifth.state, false).damageBonusPercent, 0);
});

test("stance lasts eight attacks and status applications can extend it at most three times", () => {
  let state = triggerWarriorStance(createWarriorBuffState(), 3, true);
  for (let i = 0; i < 11; i++) {
    const attack = consumeWarriorPrimaryAttack(state, true);
    assert.equal(attack.attackSpeedBonusPercent, 18);
    assert.equal(attack.damageBonusPercent, 14);
    assert.equal(attack.defensePenaltyPercent, 15);
    state = attack.state;
  }
  assert.equal(state.stanceRemaining, 0);
  assert.equal(state.stanceExtensions, 3);
});

test("ground shock and titan slashes attach only to later primary attacks", () => {
  let state = createWarriorBuffState();
  assert.equal(recordWarriorSkillHit(state, "裂地斬", false, true).groundShockPending, false);
  state = recordWarriorSkillHit(state, "裂地斬", true, true);
  state = recordWarriorSkillHit(state, "泰坦斷界斬", false, true);
  const first = consumeWarriorPrimaryAttack(state, false);
  assert.deepEqual(first.extraDamagePercents, [60, 70]);
  const second = consumeWarriorPrimaryAttack(first.state, false);
  assert.deepEqual(second.extraDamagePercents, [70]);
  const third = consumeWarriorPrimaryAttack(second.state, false);
  assert.deepEqual(third.extraDamagePercents, [70]);
  assert.deepEqual(consumeWarriorPrimaryAttack(third.state, false).extraDamagePercents, []);
});
