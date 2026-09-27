import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });

const { syncLiveCombat, resolveLiveCombatAttack, advanceLiveCombat, resolveLiveEnemyAttack } =
  await import("../app/skill-live-combat.ts");
const { createSkillAscensions } = await import("../app/skill-ascensions.ts");

const sets = {
  戰士: ["裂地斬", "血刃斬", "血戰烙印", "狂戰姿態", "碎甲猛擊", "泰坦斷界斬"],
  遊俠: ["穿雲箭", "追風箭", "獵殺標記", "疾風連射", "風行領域", "破星狙擊", "蒼穹箭雨"],
  法師: ["霜火新星", "奧術飛彈", "元素蝕印", "隕星術", "奧術超載", "虛空崩解", "星界寂滅"],
};
const ultimate = new Set(["泰坦斷界斬", "蒼穹箭雨", "星界寂滅"]);
const opts = { now: 1000, healthPercent: 90, attack: 100, hitChance: 100,
  criticalChance: 0, criticalDamage: 50, roll: () => 0.25 };

for (const [characterClass, names] of Object.entries(sets)) {
  test(`${characterClass} all direct, status, mechanic, and ultimate skills execute from a live queue`, () => {
    for (const name of names) {
      const slots = ultimate.has(name) ? [null, null, null] : name === "奧術超載"
        ? ["霜火新星", "奧術超載", null] : [name, null, null];
      const ranks = name === "奧術超載" ? { [name]: 1, 霜火新星: 1 } : { [name]: 1 };
      const battle = syncLiveCombat(null, `tower-${name}`, "enemy-1",
        { ranks, activeSlots: slots }, characterClass, 100, createSkillAscensions());
      let cast = null;
      for (let action = 0; action < 50; action++) {
        const outcome = resolveLiveCombatAttack(battle, { ...opts, now: opts.now + action * 100 });
        assert.ok(Number.isFinite(outcome.damagePercent) && outcome.damagePercent >= 0);
        if (outcome.name === name) { cast = outcome; break; }
      }
      assert.ok(cast, `${name} never cast`);
      if (!["血戰烙印", "狂戰姿態", "獵殺標記", "風行領域", "元素蝕印", "奧術超載"].includes(name))
        assert.ok(cast.damagePercent > 0, `${name} did not damage`);
    }
  });
}

test("bleed and burn tick on the existing target, then clear on normal kill", () => {
  const battle = syncLiveCombat(null, "tower-1", "enemy-1", {
    ranks: { 血刃斬: 5 }, activeSlots: ["血刃斬", null, null],
  }, "戰士", 100, createSkillAscensions());
  let cast;
  for (let i = 0; i < 4; i++) cast = resolveLiveCombatAttack(battle,
    { ...opts, now: 1000 + i * 100, roll: () => 0 });
  assert.equal(cast.name, "血刃斬");
  assert.ok(cast.statuses.includes("bleed"));
  assert.ok(advanceLiveCombat(battle, 2300).some((damage) => damage > 0));
  syncLiveCombat(battle, "tower-1", "enemy-2", battle.build, "戰士", 100, createSkillAscensions());
  assert.deepEqual(advanceLiveCombat(battle, 4000), []);
});

test("equipped defensive skills absorb or avoid an actual enemy attack", () => {
  for (const [characterClass, name] of [["戰士", "不屈戰意"], ["遊俠", "幻影步"], ["法師", "魔力護盾"]]) {
    const battle = syncLiveCombat(null, name, "boss", { ranks: { [name]: 5 },
      activeSlots: [name, null, null] }, characterClass, 100, createSkillAscensions());
    const outcomes = Array.from({ length: 5 }, () => resolveLiveEnemyAttack(battle,
      { healthPercent: 30, maxHealth: 100, damage: 20, roll: () => 0 }));
    assert.ok(outcomes.some((outcome) => outcome.damage < 20 || outcome.blocked || outcome.dodged), name);
  }
});
