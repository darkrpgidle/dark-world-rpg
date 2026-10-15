import assert from "node:assert/strict";
import test from "node:test";
import {
  SKILL_REWORK_CATALOG,
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
    assert.deepEqual(catalog.filter((skill) => skill.kind === "active").map((skill) => skill.unlockLevel), [1, 10, 20, 30, 40, 52, 66, 80]);
    assert.deepEqual(catalog.filter((skill) => skill.kind === "passive").map((skill) => skill.unlockLevel), [5, 12, 18, 24, 32, 38, 45, 50, 56, 62, 70, 76]);
    assert.equal(new Set(catalog.map((skill) => skill.name)).size, 20);
  }
  for (const catalog of Object.values(SKILL_REWORK_CATALOG)) {
    assert.equal(Math.min(...catalog.map((skill) => skill.unlockLevel)), 1);
    assert.equal(Math.max(...catalog.map((skill) => skill.unlockLevel)), 80);
  }
  assert.deepEqual([1, 2, 49, 50, 100].map(earnedSkillPoints), [0, 1, 24, 25, 50]);
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

test("old warrior stagger passive migrates to over-bleed without losing rank or slots", () => {
  const oldBuild = { ranks: { 戰慄重擊: 3, 裂地斬: 2 }, activeSlots: ["裂地斬", null, null] };
  assert.deepEqual(restoreSkillBuild(oldBuild, "戰士", 50), {
    ranks: { 過度失血: 3, 裂地斬: 2 }, activeSlots: ["裂地斬", null, null],
    legacyUnlockedSkillNames: ["過度失血"],
  });
});

test("GM test builds can hold all class skills at rank five with a server-set 100 point allowance", () => {
  for (const [characterClass, catalog] of Object.entries(SKILL_REWORK_CATALOG)) {
    const actives = catalog.filter((skill) => skill.kind === "active" && skill.category !== "ultimate");
    const build = {
      ranks: Object.fromEntries(catalog.map((skill) => [skill.name, 5])),
      activeSlots: actives.slice(0, 3).map((skill) => skill.name),
      adminPointLimit: 100,
    };
    assert.equal(spentSkillPoints(build), 100);
    assert.equal(isValidSkillBuild(build, characterClass, 100), true);
    assert.deepEqual(restoreSkillBuild(build, characterClass, 100), build);
    assert.equal(isValidSkillBuild({ ...build, adminPointLimit: 99 }, characterClass, 100), false);
    assert.equal(isValidSkillBuild({ ...build, adminPointLimit: 100 }, characterClass, 49), false);
  }
});

test("active and passive skills each enforce their own character-level unlock gate", () => {
  const empty = createSkillBuild();
  assert.equal(upgradeSkill(empty, "戰士", 1, "裂地斬"), null);
  assert.equal(upgradeSkill(empty, "戰士", 3, "鐵骨"), null);
  assert.equal(upgradeSkill(empty, "戰士", 2, "鐵骨"), null);
  assert.equal(upgradeSkill(empty, "戰士", 4, "鐵骨"), null);
  assert.equal(upgradeSkill(empty, "戰士", 5, "鐵骨")?.ranks["鐵骨"], 1);
  assert.equal(upgradeSkill(empty, "遊俠", 3, "迅捷手感"), null);
  assert.equal(upgradeSkill(empty, "法師", 3, "奧術感知"), null);
  assert.equal(upgradeSkill(empty, "法師", 4, "奧術感知"), null);
  assert.equal(upgradeSkill(empty, "法師", 5, "奧術感知")?.ranks["奧術感知"], 1);
});

test("existing learned skills remain available after their new unlock level moves later", () => {
  const saved = { ranks: { 血刃斬: 2 }, activeSlots: ["血刃斬", null, null] };
  const restored = restoreSkillBuild(saved, "戰士", 8);
  assert.equal(restored.ranks.血刃斬, 2);
  assert.deepEqual(restored.legacyUnlockedSkillNames, ["血刃斬"]);
  assert.equal(upgradeSkill(restored, "戰士", 8, "血刃斬")?.ranks.血刃斬, 3);
  assert.equal(upgradeSkill(createSkillBuild(), "戰士", 8, "血刃斬"), null);
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
