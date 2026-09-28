import assert from "node:assert/strict";
import test from "node:test";
import {
  SKILL_REWORK_CATALOG,
  availableSkillPoints,
  createSkillBuild,
  earnedSkillPoints,
  enabledUltimate,
  equipActiveSkill,
  isValidSkillBuild,
  restoreSkillBuild,
  spentSkillPoints,
  upgradeSkill,
} from "../app/skill-rework.ts";

test("each class has the prescribed 8 active and 12 passive skills with unlocks", () => {
  for (const catalog of Object.values(SKILL_REWORK_CATALOG)) {
    assert.equal(catalog.length, 20);
    assert.deepEqual(catalog.filter((skill) => skill.kind === "active").map((skill) => skill.unlockLevel), [2, 6, 10, 16, 22, 28, 38, 50]);
    assert.deepEqual(catalog.filter((skill) => skill.kind === "passive").map((skill) => skill.unlockLevel), [4, 8, 12, 14, 18, 20, 24, 26, 30, 34, 42, 46]);
    assert.equal(new Set(catalog.map((skill) => skill.name)).size, 20);
  }
  assert.deepEqual([1, 2, 49, 50, 100].map(earnedSkillPoints), [0, 1, 24, 25, 50]);
});

test("GM full-skill configuration shows no negative available points", () => {
  const build = {
    ranks: Object.fromEntries(SKILL_REWORK_CATALOG["法師"].map(({ name }) => [name, 5])),
    activeSlots: ["霜火新星", "奧術飛彈", "魔力護盾"],
  };
  assert.equal(spentSkillPoints(build), 100);
  assert.equal(earnedSkillPoints(100), 50);
  assert.equal(availableSkillPoints(build, 100), 0);
  assert.equal(availableSkillPoints(createSkillBuild(), 100), 50);
});

test("optional rework save restores valid builds and isolates malformed or legacy saves", () => {
  assert.deepEqual(restoreSkillBuild(undefined, "法師", 50), createSkillBuild());
  assert.deepEqual(restoreSkillBuild({ ranks: { 裂地斬: 1 }, activeSlots: ["裂地斬", null, null] }, "法師", 50), createSkillBuild());
  assert.deepEqual(restoreSkillBuild({ ranks: { 霜火新星: 6 }, activeSlots: [null, null, null] }, "法師", 50), createSkillBuild());
  const saved = { ranks: { 霜火新星: 2 }, activeSlots: ["霜火新星", null, null] };
  const restored = restoreSkillBuild(saved, "法師", 50);
  assert.deepEqual(restored, saved);
  restored.ranks["霜火新星"] = 1;
  assert.equal(saved.ranks["霜火新星"], 2);
});

test("active and passive skills each enforce their own character-level unlock gate", () => {
  const empty = createSkillBuild();
  assert.equal(upgradeSkill(empty, "戰士", 1, "裂地斬"), null);
  assert.equal(upgradeSkill(empty, "戰士", 3, "鐵骨"), null);
  assert.equal(upgradeSkill(empty, "戰士", 2, "鐵骨"), null);
  assert.equal(upgradeSkill(empty, "戰士", 4, "鐵骨")?.ranks["鐵骨"], 1);
  assert.equal(upgradeSkill(empty, "遊俠", 5, "迅捷手感"), null);
  assert.equal(upgradeSkill(empty, "法師", 3, "奧術感知"), null);
  assert.equal(upgradeSkill(empty, "法師", 4, "奧術感知")?.ranks["奧術感知"], 1);
});

test("one point buys one rank, with level, class, point and rank caps", () => {
  const empty = createSkillBuild();
  assert.equal(upgradeSkill(empty, "戰士", 1, "裂地斬"), null);
  const first = upgradeSkill(empty, "戰士", 2, "裂地斬");
  assert.equal(first?.ranks["裂地斬"], 1);
  assert.deepEqual(empty, createSkillBuild());
  assert.equal(upgradeSkill(first, "戰士", 2, "裂地斬"), null);
  assert.equal(upgradeSkill(first, "遊俠", 2, "裂地斬"), null);
  let maxed = createSkillBuild();
  for (let rank = 0; rank < 5; rank++) maxed = upgradeSkill(maxed, "戰士", 100, "裂地斬");
  assert.equal(spentSkillPoints(maxed), 5);
  assert.equal(upgradeSkill(maxed, "戰士", 100, "裂地斬"), null);
  assert.equal(isValidSkillBuild({ ranks: { 裂地斬: 6 }, activeSlots: [null, null, null] }, "戰士", 100), false);
  assert.equal(isValidSkillBuild({ ranks: { 血刃斬: 1 }, activeSlots: [null, null, null] }, "戰士", 2), false);
});

test("exactly three ordinary slots; passives and the fixed ultimate cannot occupy them", () => {
  let build = createSkillBuild();
  for (const name of ["裂地斬", "血刃斬", "鮮血怒吼", "碎甲猛擊", "泰坦斷界斬", "鐵骨"]) {
    build = upgradeSkill(build, "戰士", 100, name);
  }
  build = equipActiveSkill(build, "戰士", 100, 0, "裂地斬");
  build = equipActiveSkill(build, "戰士", 100, 1, "血刃斬");
  build = equipActiveSkill(build, "戰士", 100, 2, "鮮血怒吼");
  assert.deepEqual(build.activeSlots, ["裂地斬", "血刃斬", "鮮血怒吼"]);
  assert.equal(equipActiveSkill(build, "戰士", 100, 2, "裂地斬"), null);
  assert.equal(equipActiveSkill(build, "戰士", 100, 1, "鐵骨"), null);
  assert.equal(equipActiveSkill(build, "戰士", 100, 1, "泰坦斷界斬"), null);
  assert.equal(enabledUltimate(build, "戰士", 100), "泰坦斷界斬");
  assert.equal(equipActiveSkill(build, "戰士", 100, 1, null)?.activeSlots[1], null);
  assert.equal(enabledUltimate(createSkillBuild(), "戰士", 100), null);
});
