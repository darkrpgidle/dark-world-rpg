import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });

const { syncLiveCombat, resolveLiveCombatAttack, resolveLiveEnemyAttack } =
  await import("../app/skill-live-combat.ts");
const { createSkillAscensions } = await import("../app/skill-ascensions.ts");
const { SKILL_MYTHICS } = await import("../app/mythic-data.ts");
const opts = { now: 1000, healthPercent: 90, attack: 100, hitChance: 100,
  criticalChance: 0, criticalDamage: 50, roll: () => 0 };

function battle(characterClass, build, key) {
  return syncLiveCombat(null, key, "enemy-1", build, characterClass, 100, createSkillAscensions());
}
function item(id) { return [{ mythicId: id }]; }

test("all five approved mythics point at skills in their new class catalog", async () => {
  const { SKILL_REWORK_CATALOG } = await import("../app/skill-rework.ts");
  const mappings = {
    "skill-warrior-fallen-city": "不屈戰意",
    "skill-warrior-executioner": "泰坦斷界斬",
    "skill-ranger-hunter-eye": "鷹眼",
    "skill-ranger-queen-contract": "獵殺標記",
    "skill-mage-akasha-pages": "奧術循環",
  };
  for (const [id, name] of Object.entries(mappings)) {
    const definition = SKILL_MYTHICS.find((equipment) => equipment.id === id);
    assert.equal(definition.skill, name);
    assert.ok(SKILL_REWORK_CATALOG[definition.className].some((skill) => skill.name === name));
  }
});

test("Fallen City saves block defense for exactly the next primary attack", () => {
  const build = { ranks: { 不屈戰意: 5 }, activeSlots: ["不屈戰意", null, null] };
  const equipped = battle("戰士", build, "fallen");
  const plain = battle("戰士", build, "plain");
  for (let i = 0; i < 5; i++) {
    const input = { healthPercent: 90, maxHealth: 1000, damage: 20, defense: 200, roll: () => 0 };
    resolveLiveEnemyAttack(equipped, { ...input, equippedItems: item("skill-warrior-fallen-city") });
    resolveLiveEnemyAttack(plain, input);
    if (equipped.fallenCityDamagePending) break;
  }
  assert.equal(equipped.fallenCityDamagePending, 300);
  const powered = resolveLiveCombatAttack(equipped, { ...opts, equippedItems: item("skill-warrior-fallen-city") });
  const ordinary = resolveLiveCombatAttack(plain, opts);
  assert.ok(powered.damagePercent > ordinary.damagePercent);
  assert.equal(equipped.fallenCityDamagePending, 0);
});

test("Executioner improves earned ultimate energy without an extra primary attack", () => {
  const build = { ranks: { 泰坦斷界斬: 1 }, activeSlots: [null, null, null] };
  const equipped = battle("戰士", build, "executioner");
  const plain = battle("戰士", build, "plain-executioner");
  for (let i = 0; i < 4; i++) {
    resolveLiveCombatAttack(equipped, { ...opts, now: 1000 + i * 100, equippedItems: item("skill-warrior-executioner") });
    resolveLiveCombatAttack(plain, { ...opts, now: 1000 + i * 100 });
  }
  assert.ok(equipped.combat.session.charge.ultimateEnergy > plain.combat.session.charge.ultimateEnergy);
});

test("Hunter Eye follow-up counts once and cannot trigger another follow-up", () => {
  const build = { ranks: { 鷹眼: 5 }, activeSlots: [null, null, null] };
  const equipped = battle("遊俠", build, "hunter-eye");
  const plain = battle("遊俠", build, "plain-eye");
  const enhanced = resolveLiveCombatAttack(equipped, {
    ...opts, criticalChance: 100, equippedItems: item("skill-ranger-hunter-eye"),
  });
  const ordinary = resolveLiveCombatAttack(plain, { ...opts, criticalChance: 100 });
  assert.ok(enhanced.damagePercent > ordinary.damagePercent);
  assert.equal(equipped.hunterEyeCritDamagePending, true);
  assert.equal(equipped.combat.session.usedDamageProcs.filter((id) => id === "skill-ranger-hunter-eye").length, 1);
});

test("Queen contract carries two critical hits only to the next marked target", () => {
  const build = { ranks: { 獵殺標記: 5, 追風箭: 5 }, activeSlots: ["獵殺標記", "追風箭", null] };
  const ascensions = { rebirthCount: 2, choices: ["追風箭", "獵殺標記", null, null, null], selectionOpen: false };
  const equipped = syncLiveCombat(null, "queen", "enemy-1", build, "遊俠", 100, ascensions);
  let exploded = false;
  for (let i = 0; i < 50; i++) {
    resolveLiveCombatAttack(equipped, {
      ...opts, now: 1000 + i * 200, criticalChance: 100,
      equippedItems: item("skill-ranger-queen-contract"),
    });
    if (equipped.queenCarryForNextTarget) { exploded = true; break; }
  }
  assert.ok(exploded);
  syncLiveCombat(equipped, "queen", "enemy-2", equipped.build, "遊俠", 100, ascensions);
  assert.equal(equipped.queenCarry, 2);
  for (let i = 0; i < 50; i++) {
    const cast = resolveLiveCombatAttack(equipped, {
      ...opts, now: 20000 + i * 200, criticalChance: 0,
      equippedItems: item("skill-ranger-queen-contract"),
    });
    if (cast.statuses.includes("hunterMark")) break;
  }
  assert.equal(equipped.combat.hunterMarkCriticalHits, 2);
  assert.equal(equipped.queenCarry, 0);
});

test("Akasha replay follows four successful active casts without charging another attack", () => {
  const build = { ranks: { 奧術循環: 5, 霜火新星: 5 }, activeSlots: ["霜火新星", null, null] };
  const equipped = battle("法師", build, "akasha");
  const plain = battle("法師", build, "plain-akasha");
  let replay = null;
  for (let i = 0; i < 100; i++) {
    const input = { ...opts, now: 1000 + i * 1000, roll: () => 0.99 };
    const enhanced = resolveLiveCombatAttack(equipped,
      { ...input, equippedItems: item("skill-mage-akasha-pages") });
    const ordinary = resolveLiveCombatAttack(plain, input);
    if (enhanced.name === "霜火新星" && enhanced.damagePercent > ordinary.damagePercent) {
      replay = enhanced;
      break;
    }
  }
  assert.ok(replay, "the fifth damaging cast must receive the 60% replay");
  assert.equal(equipped.akashaStacks, 0);
  assert.equal(equipped.akashaReady, false);
});
