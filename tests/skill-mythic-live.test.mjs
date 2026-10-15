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


const { nextLiveSkill, advanceLiveCombatEvents } = await import('../app/skill-live-combat.ts');
const { applyEnemyDebuff } = await import('../app/skill-debuff-timer.ts');
const { splitMythicDamage } = await import('../app/skill-mythic-display.ts');
const { readFileSync } = await import('node:fs');

function readyBattle(cls, skill, id, ascensions = createSkillAscensions()) {
  const b = syncLiveCombat(null, 'mythic-audit', 'enemy-1', {
    ranks: { [skill]: 5 }, activeSlots: [skill, null, null],
  }, cls, 100, ascensions);
  for (let i = 0; i < 30 && nextLiveSkill(b, 1000) !== skill; i++) {
    resolveLiveCombatAttack(b, { ...opts, roll: () => 0.99, equippedItems: item(id) });
  }
  assert.equal(nextLiveSkill(b, 1000), skill);
  return b;
}
const hitOpts = { ...opts, roll: () => 0.99 };

test('Titan Axe arms only on a landed split and adds three normal hits plus one detonation', () => {
  const b = readyBattle('戰士', '裂地斬', 'skill-warrior-titan-axe');
  const cast = resolveLiveCombatAttack(b, { ...hitOpts, equippedItems: item('skill-warrior-titan-axe') });
  assert.equal(cast.equipmentHits.length, 0);
  const attacks = Array.from({ length: 3 }, () => resolveLiveCombatAttack(b,
    { ...hitOpts, equippedItems: item('skill-warrior-titan-axe') }));
  assert.deepEqual(attacks.map(a => a.equipmentHits.map(x => x.damagePercent)), [[30], [30], [30, 100]]);
  assert.deepEqual(attacks.map(a => a.damagePercent), [130, 130, 230]);
  assert.equal(b.fissureNormalsRemaining, 0);
  assert.ok(b.combat.session.usedDamageProcs.includes('skill-warrior-titan-axe'));
});

test('Titan Axe misses, unequipping and target changes cannot keep or duplicate old fissures', () => {
  const id = 'skill-warrior-titan-axe';
  const b = readyBattle('戰士', '裂地斬', id);
  resolveLiveCombatAttack(b, { ...hitOpts, hitChance: 0, equippedItems: item(id) });
  assert.equal(b.fissureNormalsRemaining, 0);
  b.fissureNormalsRemaining = 3;
  assert.equal(resolveLiveCombatAttack(b, { ...hitOpts, hitChance: 0, equippedItems: item(id) }).equipmentHits.length, 0);
  assert.equal(b.fissureNormalsRemaining, 2);
  resolveLiveCombatAttack(b, hitOpts);
  assert.equal(b.fissureNormalsRemaining, 0);
  b.fissureNormalsRemaining = 3;
  syncLiveCombat(b, b.owner, 'enemy-2', b.build, '戰士', 100, createSkillAscensions());
  assert.equal(b.fissureNormalsRemaining, 0);
});

test('Blood Heart uses seven empowered actions and spends health only on the final action', () => {
  const build = { ranks: { 鮮血怒吼: 5 }, activeSlots: ['鮮血怒吼', null, null] };
  const b = battle('戰士', build, 'heart');
  const plain = battle('戰士', build, 'plain-heart');
  const rows = Array.from({ length: 8 }, () => resolveLiveCombatAttack(b,
    { ...hitOpts, healthPercent: 30, equippedItems: item('skill-warrior-blood-heart') }));
  assert.deepEqual(rows.map(a => a.bloodRoarEmpowered), [true,true,true,true,true,true,true,false]);
  assert.equal(rows[0].bloodRoarActivated, true);
  assert.deepEqual(rows.map(a => a.currentHealthCostPercent), [0,0,0,0,0,0,10,0]);
  assert.equal(rows[6].damagePercent, 405);
  assert.equal(rows[6].equipmentHits[0].damagePercent, 250);
  const ordinary = Array.from({ length: 6 }, () => resolveLiveCombatAttack(plain, { ...hitOpts, healthPercent: 30 }));
  assert.equal(ordinary.filter(a => a.bloodRoarEmpowered).length, 5);
  assert.deepEqual(b.combat.session.charge, battleChargeAfterEightNormals());
  function battleChargeAfterEightNormals() {
    const control = battle('戰士', build, 'control-heart');
    for (let i = 0; i < 8; i++) resolveLiveCombatAttack(control, { ...hitOpts, healthPercent: 30 });
    return control.combat.session.charge;
  }
});

test('Blood Heart final miss still consumes its action and health, without dealing burst damage', () => {
  const b = battle('戰士', { ranks: { 鮮血怒吼: 5 }, activeSlots: ['鮮血怒吼', null, null] }, 'miss-heart');
  for (let i = 0; i < 6; i++) resolveLiveCombatAttack(b, { ...hitOpts, healthPercent: 30, equippedItems: item('skill-warrior-blood-heart') });
  const missed = resolveLiveCombatAttack(b, { ...hitOpts, hitChance: 0, healthPercent: 30, equippedItems: item('skill-warrior-blood-heart') });
  assert.equal(missed.currentHealthCostPercent, 10);
  assert.equal(missed.damagePercent, 0);
  assert.deepEqual(missed.equipmentHits, []);
  assert.equal(b.combat.buffs.bloodRoarRemaining, 0);
});

test('Sky Piercer ignores 60% defense and empowers exactly the next attack, including a consumed miss', () => {
  const id = 'skill-ranger-sky-piercer';
  const b = readyBattle('遊俠', '穿雲箭', id);
  const cast = resolveLiveCombatAttack(b, { ...hitOpts, equippedItems: item(id) });
  assert.equal(cast.defenseIgnore, 60);
  assert.equal(resolveLiveCombatAttack(b, { ...hitOpts, equippedItems: item(id) }).damagePercent, 130);
  assert.equal(resolveLiveCombatAttack(b, { ...hitOpts, equippedItems: item(id) }).damagePercent, 100);
  b.skyPiercerNextAttack = true;
  assert.equal(resolveLiveCombatAttack(b, { ...hitOpts, hitChance: 0, equippedItems: item(id) }).damagePercent, 0);
  assert.equal(b.skyPiercerNextAttack, false);
});

test('Thousand Feathers rolls seven independent hits and guarantees only the last landed arrow critical', () => {
  const id = 'skill-ranger-thousand-feathers';
  const b = readyBattle('遊俠', '疾風連射', id);
  const a = resolveLiveCombatAttack(b, { ...hitOpts, equippedItems: item(id) });
  assert.equal(a.hits.length, 7);
  assert.deepEqual(a.hits.map(h => h.critical), [false,false,false,false,false,false,true]);
  assert.deepEqual(a.volleyArrows.map(h => h.damagePercent), [72,72,72,72,72,72,108]);
  assert.equal(a.damagePercent, 540); // five-arrow 420 ×1.2 + final-arrow crit 36
  const miss = readyBattle('遊俠', '疾風連射', id);
  const rolls = [0.1,0.99, 0.9, 0.1,0.99, 0.9, 0.1,0.99, 0.9, 0.9];
  const m = resolveLiveCombatAttack(miss, { ...opts, hitChance: 50, equippedItems: item(id), roll: () => rolls.shift() });
  assert.deepEqual(m.hits.map(h => h.hit), [true,false,true,false,true,false,false]);
  assert.equal(m.volleyArrows[6].critical, false);
  assert.equal(m.damagePercent, 216);
});

test('Thousand Feathers and ascension preserve the first-five-hit requirement and one primary charge event', () => {
  const ascensions = { rebirthCount: 4, choices: ['穿雲箭', '獵殺標記', '風行領域', '疾風連射', null], selectionOpen: false };
  const b = readyBattle('遊俠', '疾風連射', 'skill-ranger-thousand-feathers', ascensions);
  const a = resolveLiveCombatAttack(b, { ...hitOpts, equippedItems: item('skill-ranger-thousand-feathers') });
  assert.equal(a.volleyArrows.length, 8);
  assert.equal(a.volleyArrows.filter(h => h.sixth).length, 1);
  assert.equal(a.volleyArrows.at(-1).damagePercent, 90);
  const before = b.combat.session.charge;
  const displayed = splitMythicDamage(a, 10);
  assert.equal(displayed.remaining, 10);
  assert.equal(b.combat.session.charge, before);
});

test('Polar Staff settles due burn once, consumes only remaining ticks and preserves the old attack snapshot', () => {
  const b = readyBattle('法師', '霜火新星', 'skill-mage-polar-staff');
  b.combat.session.enemy = applyEnemyDebuff({}, { kind: 'burn', effectMultiplier: 1.4 }, 1000).state;
  b.dotAttack.burn = 100;
  const a = resolveLiveCombatAttack(b, { ...hitOpts, now: 2500, attack: 200, equippedItems: item('skill-mage-polar-staff') });
  assert.equal(a.ticks.reduce((sum, x) => sum + x.damage, 0), 84);
  assert.equal(a.equipmentHits[0].damagePercent, 252); // 4 ×84 ×1.5 =504 / current attack 200
  assert.equal(b.combat.session.enemy.burn, undefined);
  assert.deepEqual(advanceLiveCombatEvents(b, 7000), []);
});

test('Polar Staff miss does not consume burn; a new burn is not exploded on the same cast', () => {
  const b = readyBattle('法師', '霜火新星', 'skill-mage-polar-staff');
  b.combat.session.enemy = applyEnemyDebuff({}, { kind: 'burn' }, 1000).state;
  b.dotAttack.burn = 100;
  const miss = resolveLiveCombatAttack(b, { ...hitOpts, now: 2500, hitChance: 0, equippedItems: item('skill-mage-polar-staff') });
  assert.deepEqual(miss.equipmentHits, []);
  assert.ok(b.combat.session.enemy.burn);
  const fresh = readyBattle('法師', '霜火新星', 'skill-mage-polar-staff');
  const cast = resolveLiveCombatAttack(fresh, { ...opts, equippedItems: item('skill-mage-polar-staff') });
  assert.deepEqual(cast.equipmentHits, []);
  assert.ok(fresh.combat.session.enemy.burn);
});

test('Eternal Core explodes on an actual shield break once, not elapsed attacks or a dodge', () => {
  const b = battle('法師', { ranks: { 魔力護盾: 5 }, activeSlots: ['魔力護盾', null, null] }, 'core');
  b.combat.shield = { ...b.combat.shield, used: true, value: 100, initialValue: 100 };
  const input = { healthPercent: 90, maxHealth: 1000, damage: 50, equippedItems: item('skill-mage-eternal-core'), roll: () => 0.99 };
  assert.equal(resolveLiveEnemyAttack(b, input).equipmentDamage, 0);
  const broken = resolveLiveEnemyAttack(b, input);
  assert.equal(broken.equipmentDamage, 150);
  assert.equal(broken.manaShield.broke, true);
  assert.equal(resolveLiveEnemyAttack(b, input).equipmentDamage, 0);
  b.combat.shield.value = 20;
  const dodged = resolveLiveEnemyAttack(b, { ...input, baseDodgeChance: 100 });
  assert.equal(dodged.dodged, true);
  assert.equal(b.combat.shield.value, 20);
  assert.equal(resolveLiveEnemyAttack(b, { ...input, equippedItems: [] }).equipmentDamage, 0);
});

test('equipment display split preserves settled total including lethal overkill without mutating combat', () => {
  const action = { damagePercent: 230, equipmentHits: [{ label: '追加', damagePercent: 30, critical: false }, { label: '爆破', damagePercent: 100, critical: false }] };
  for (const total of [0,1,7,100,230,1000]) {
    const result = splitMythicDamage(action, total);
    assert.equal(result.remaining + result.hits.reduce((sum, h) => sum + h.damage, 0), total);
  }
  assert.equal(action.damagePercent, 230);
});

test('tower and boss wire equipment hits to settled floats, shield break damage and a single blood cost', () => {
  const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.equal((page.match(/showMythicDamage\(mythicDisplay.hits\)/g) ?? []).length, 2);
  assert.equal((page.match(/liveDefense.equipmentDamage \? "過載爆炸"/g) ?? []).length, 2);
  assert.match(page, /defense.equipmentDamage \? "過載爆炸"/);
  assert.match(page, /const bloodRoarWasActive = !liveAction &&/);
  assert.match(page, /if \(liveAction\?\.currentHealthCostPercent\) setPlayerHp/);
  assert.match(page, /if \(playerActs && liveAction\?\.currentHealthCostPercent\) setBossPlayerHp/);
});
