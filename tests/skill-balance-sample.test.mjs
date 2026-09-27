import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("../scripts/skill-balance-sample.mjs", import.meta.url));
const run = () => JSON.parse(execFileSync(process.execPath, [script, "--json"], { encoding: "utf8" }));

test("54 fixed combat samples are reproducible, bounded and distinct from live acceptance", () => {
  const output = run();
  assert.deepEqual(output, run());
  assert.equal(output.samples.length, 54);
  assert.equal(output.metrics.length, 54);
  assert.match(output.assumptions.excluded, /模擬不計為正式帳號實戰驗收/);
  const cases = new Set(output.samples.map(s =>
    [s.characterClass, s.level, s.equipment, s.encounter].join("|")));
  assert.equal(cases.size, 54);
  for (const s of output.samples) {
    assert.ok(s.elapsedSeconds > 0 && s.elapsedSeconds <= (s.encounter === "世界首領60秒" ? 60 : 120));
    // Percent HP is rounded for each displayed hit, so permit up to one HP drift.
    assert.ok(s.damageDealt >= 0 && s.damageDealt <= s.enemyMaximumHealth + 1);
    assert.ok(s.remainingHealth >= 0 && s.remainingHealth <= s.maximumHealth);
    if (s.encounter === "世界首領60秒" && !s.defeatedEnemy)
      assert.equal(s.remainingHealth, 0, "60-second finisher resolves the fight");
  }
});
