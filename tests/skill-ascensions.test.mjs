import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const {
  ascensionOptions, beginSkillRebirth, confirmSkillAscensions, createSkillAscensions,
  enabledAscensions, isValidSkillAscensions, restoreSkillAscensions, selectSkillAscension,
} = await import("../app/skill-ascensions.ts");
const { createSkillBuild } = await import("../app/skill-rework.ts");

const classes = ["戰士", "遊俠", "法師"];

test("each class gets two basic, three defensive/status/mechanic, two burst and one ultimate options", () => {
  for (const characterClass of classes) {
    assert.deepEqual([1, 2, 3, 4, 5].map((tier) => ascensionOptions(characterClass, tier).length), [2, 3, 3, 2, 1]);
    assert.deepEqual(ascensionOptions(characterClass, 0), []);
    assert.deepEqual(ascensionOptions(characterClass, 6), []);
  }
});

test("legacy saves start at zero; malformed or foreign choices cannot unlock ascensions", () => {
  assert.deepEqual(restoreSkillAscensions(undefined, "戰士"), createSkillAscensions());
  assert.deepEqual(restoreSkillAscensions({ rebirthCount: 10, choices: ["裂地斬"], selectionOpen: false }, "戰士"), createSkillAscensions());
  assert.equal(isValidSkillAscensions({ rebirthCount: 1, choices: ["穿雲箭", null, null, null, null], selectionOpen: false }, "戰士"), false);
  const save = { rebirthCount: 1, choices: ["裂地斬", null, null, null, null], selectionOpen: false };
  const restored = restoreSkillAscensions(save, "戰士");
  restored.choices[0] = null;
  assert.equal(save.choices[0], "裂地斬");
});

test("rebirth clears skill allocation, opens free ascension reallocation, then locks chosen tiers", () => {
  let state = createSkillAscensions();
  assert.equal(beginSkillRebirth(state, "戰士", 99), null);
  let result = beginSkillRebirth(state, "戰士", 100);
  assert.deepEqual(result.build, createSkillBuild());
  state = result.ascensions;
  assert.equal(state.selectionOpen, true);
  assert.deepEqual(enabledAscensions(state, "戰士"), []);
  assert.equal(beginSkillRebirth(state, "戰士", 100), null);
  assert.equal(confirmSkillAscensions(state, "戰士"), null);
  state = selectSkillAscension(state, "戰士", 1, "裂地斬");
  state = confirmSkillAscensions(state, "戰士");
  assert.deepEqual(enabledAscensions(state, "戰士"), ["裂地斬"]);
  assert.equal(selectSkillAscension(state, "戰士", 1, "血刃斬"), null);
  result = beginSkillRebirth(state, "戰士", 100);
  assert.equal(result.ascensions.choices[0], "裂地斬");
  assert.equal(selectSkillAscension(result.ascensions, "戰士", 1, "血刃斬").choices[0], "血刃斬");
});

test("second and third rebirth choices cannot repeat; fifth is the fixed ultimate", () => {
  for (const characterClass of classes) {
    let state = createSkillAscensions();
    for (let tier = 1; tier <= 5; tier++) {
      state = beginSkillRebirth(state, characterClass, 100).ascensions;
      if (tier < 5) {
        const options = ascensionOptions(characterClass, tier);
        assert.equal(selectSkillAscension(state, characterClass, tier, "不存在"), null);
        // Previous options stay editable during this rebirth's free allocation window.
        const name = tier === 3 ? options[1] : options[0];
        if (tier === 3) assert.equal(selectSkillAscension(state, characterClass, 3, options[0]), null);
        state = selectSkillAscension(state, characterClass, tier, name);
        assert.ok(state);
      } else {
        assert.equal(state.choices[4], ascensionOptions(characterClass, 5)[0]);
        assert.equal(selectSkillAscension(state, characterClass, 5, state.choices[4]), null);
      }
      state = confirmSkillAscensions(state, characterClass);
      assert.ok(state);
      assert.equal(enabledAscensions(state, characterClass).length, tier);
    }
    assert.equal(beginSkillRebirth(state, characterClass, 100), null);
  }
});
