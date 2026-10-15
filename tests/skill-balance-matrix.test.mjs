import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });

const { skillBalanceScenarios, summarizeSkillBalance } = await import("../app/skill-balance-matrix.ts");
const observed = {
  characterClass: "法師", level: 100, equipment: "神話", encounter: "世界首領60秒",
  elapsedSeconds: 50, damageDealt: 2500, maximumHealth: 1000,
  remainingHealth: 200, skillCasts: { 霜火新星: 2, 隕星術: 1 },
};

test("all class, level, equipment and encounter combinations require real measurements", () => {
  const empty = summarizeSkillBalance([]);
  assert.equal(empty.total, 54);
  assert.equal(empty.measured, 0);
  assert.equal(empty.missing.length, 54);
  assert.deepEqual(empty.rows.map((row) => row.scenario), skillBalanceScenarios());
  assert.ok(empty.rows.every((row) => row.metrics === null));

  const partial = summarizeSkillBalance([observed]);
  assert.equal(partial.measured, 1);
  assert.equal(partial.missing.length, 53);
  const measured = partial.rows.find((row) => row.scenario.characterClass === "法師"
    && row.scenario.level === 100 && row.scenario.equipment === "神話"
    && row.scenario.encounter === "世界首領60秒");
  assert.deepEqual(measured.metrics, {
    damagePerSecond: 50, remainingHealthPercent: 20, survived: true,
    skillCastsPerMinute: 3.6, skillCasts: { 霜火新星: 2, 隕星術: 1 },
  });
});

test("duplicates, fabricated scenario labels and impossible battle measurements fail the audit", () => {
  assert.throws(() => summarizeSkillBalance([observed, observed]), RangeError);
  assert.throws(() => summarizeSkillBalance([{ ...observed, encounter: "世界首領" }]), RangeError);
  for (const change of [
    { elapsedSeconds: 61 }, { elapsedSeconds: 0 }, { damageDealt: -1 },
    { maximumHealth: 0 }, { remainingHealth: 1001 }, { skillCasts: { 隕星術: 1.5 } },
    { skillCasts: { "泰坦斷界斬": 1 } }, { skillCasts: { "焰脈": 1 } },
  ]) assert.throws(() => summarizeSkillBalance([{ ...observed, ...change }]), RangeError);
});

