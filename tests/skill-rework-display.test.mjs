import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { skillDisplay } = await import("../app/skill-rework-display.ts");
const { SKILL_REWORK_CATALOG } = await import("../app/skill-rework.ts");
const { WARRIOR_ACTIVE_RULES, WARRIOR_PASSIVE_RULES } = await import("../app/skill-warrior-rules.ts");
const { RANGER_ACTIVE_RULES, RANGER_PASSIVE_RULES } = await import("../app/skill-ranger-rules.ts");
const { MAGE_ACTIVE_RULES, MAGE_PASSIVE_RULES } = await import("../app/skill-mage-rules.ts");

test("all sixty skills show their exact five source ranks and every active has an ascension preview", () => {
  const sources = {
    戰士: { ...WARRIOR_ACTIVE_RULES, ...WARRIOR_PASSIVE_RULES },
    遊俠: { ...RANGER_ACTIVE_RULES, ...RANGER_PASSIVE_RULES },
    法師: { ...MAGE_ACTIVE_RULES, ...MAGE_PASSIVE_RULES },
  };
  for (const [characterClass, catalog] of Object.entries(SKILL_REWORK_CATALOG)) {
    for (const skill of catalog) {
      const source = sources[characterClass][skill.name];
      const display = skillDisplay(characterClass, skill.name);
      assert.ok(source && display, `${characterClass} ${skill.name}`);
      const arrays = Object.values(source).filter((value) => Array.isArray(value) && value.length === 5);
      assert.equal(display.ranks.length, arrays.length, skill.name);
      assert.deepEqual(display.ranks.map((row) => row.values.map((value) => Number.parseFloat(value))), arrays, skill.name);
      assert.ok(display.ranks.every((row) => row.label && !row.label.includes("undefined")), skill.name);
      if (skill.kind === "active") {
        assert.equal(display.ascensionName, source.ascension);
        assert.ok(display.ascensionEffect, skill.name);
      } else {
        assert.equal(display.ascensionName, null);
      }
    }
  }
  assert.equal(skillDisplay("戰士", "不存在"), null);
});

test("the skill page reads current damage-over-time ratios and shield limit", async () => {
  const { balanceConfig } = await import("../app/balance-config.ts");
  const dot = balanceConfig.skillRework.dot;
  assert.ok(skillDisplay("戰士", "血刃斬").fixed
    .some((text) => text.includes(`${dot.bleedPerStackAttackPercent}%`)));
  assert.ok(skillDisplay("戰士", "裂傷本能").fixed
    .some((text) => text.includes(`${dot.bleedPerStackAttackPercent}%`)));
  for (const name of ["霜火新星", "隕星術", "焰脈"]) {
    assert.ok(skillDisplay("法師", name).fixed
      .some((text) => text.includes(`${dot.burnAttackPercent}%`)), name);
  }
  assert.ok(skillDisplay("法師", "魔力護盾").fixed
    .some((text) => text.includes("每場戰鬥最多生成一次")));
});
