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
const { settleCombatHealth } = await import("../app/skill-health-settlement.ts");
const { beginSkillBattleCutover, settleCutoverAction } = await import("../app/skill-combat-cutover.ts");
const { createSkillBuild, earnedSkillPoints } = await import("../app/skill-rework.ts");

test("new characters without unlocked skills can damage the first monster and earn their first skill point", () => {
  for (const characterClass of ["戰士", "遊俠", "法師"]) {
    const battle = syncLiveCombat(null, `new-${characterClass}`, "map-1-floor-1",
      createSkillBuild(), characterClass, 1, createSkillAscensions());
    const action = resolveLiveCombatAttack(battle, {
      now: 1000, healthPercent: 100, attack: 54,
      hitChance: 100, criticalChance: 0, criticalDamage: 50, roll: () => 0,
    });
    assert.equal(action.name, null);
    assert.ok(action.damagePercent > 0, `${characterClass} cannot attack without learned skills`);
    assert.ok(settleCombatHealth(100, 309, 54 * action.damagePercent / 100).remainingPercent < 100);
  }
  assert.equal(earnedSkillPoints(1), 0);
  assert.equal(earnedSkillPoints(2), 1);
});

const sets = {
  戰士: ["裂地斬", "血刃斬", "血戰烙印", "狂戰姿態", "碎甲猛擊", "泰坦斷界斬"],
  遊俠: ["穿雲箭", "追風箭", "獵殺標記", "疾風連射", "風行領域", "破星狙擊", "蒼穹箭雨"],
  法師: ["霜火新星", "閃電鏈", "元素蝕印", "隕星術", "奧術超載", "虛空崩解", "星界寂滅"],
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


test("over-bleed boosts active bleed ticks while refresh keeps the earlier attack snapshot", () => {
  const battle = syncLiveCombat(null, "tower-snapshot", "enemy-1", {
    ranks: { 裂傷本能: 5, 過度失血: 5 }, activeSlots: [null, null, null],
  }, "戰士", 100, createSkillAscensions());
  const first = resolveLiveCombatAttack(battle,
    { ...opts, now: 1000, attack: 100, roll: () => 0 });
  assert.ok(first.statuses.includes("bleed"));
  const refresh = resolveLiveCombatAttack(battle,
    { ...opts, now: 2000, attack: 200, roll: () => 0 });
  assert.equal(refresh.name, null);
  assert.ok(refresh.statuses.includes("bleed"));
  assert.deepEqual(refresh.ticks, [{ kind: "bleed", damage: 48 }]);
  assert.equal(battle.dotAttack.bleed, 200);
  assert.deepEqual(advanceLiveCombat(battle, 3000), [192]);
});

test("blood brand increases all direct warrior attack damage against the marked target", () => {
  const battle = syncLiveCombat(null, "blood-brand-vulnerability", "enemy-1",
    createSkillBuild(), "戰士", 100, createSkillAscensions());
  battle.combat.session.enemy.bloodBrand = {
    kind: "bloodBrand", expiresAt: 5000, stacks: 1, strength: 30,
  };
  const action = resolveLiveCombatAttack(battle, { ...opts, now: 1000, roll: () => 0.5 });
  assert.equal(action.damagePercent, 130);
});

test("live blood brand reports its applied expiry and ascension burst event", () => {
  const ascensions = { rebirthCount: 2, choices: ["裂地斬", "血戰烙印", null, null, null], selectionOpen: false };
  const battle = syncLiveCombat(null, "blood-brand-vfx-events", "enemy-1", {
    ranks: { 血戰烙印: 5, 血刃斬: 5 }, activeSlots: ["血戰烙印", "血刃斬", null],
  }, "戰士", 100, ascensions);
  let brandApplied = false;
  let ascensionBurst = false;
  for (let i = 0; i < 100; i += 1) {
    const action = resolveLiveCombatAttack(battle, {
      ...opts, now: opts.now + i * 100, roll: () => 0,
    });
    if (action.name === "血戰烙印" && action.statuses.includes("bloodBrand")) {
      brandApplied = true;
      assert.ok(action.bloodBrandExpiresAt > opts.now + i * 100);
    }
    if (action.bloodBrandBurst) ascensionBurst = true;
  }
  assert.equal(brandApplied, true);
  assert.equal(ascensionBurst, true);
});

test("live armor-smash reports the ascended repeated-break visual only when its bonus actually triggers", () => {
  const ascensions = { rebirthCount: 4,
    choices: ["裂地斬", "不屈戰意", "血戰烙印", "碎甲猛擊", null], selectionOpen: false };
  const battle = syncLiveCombat(null, "armor-smash-vfx", "enemy-1", {
    ranks: { 碎甲猛擊: 1 }, activeSlots: ["碎甲猛擊", null, null],
  }, "戰士", 100, ascensions);
  battle.combat.session.charge.charges["碎甲猛擊"] = 8;
  battle.combat.session.charge.ready = ["碎甲猛擊"];
  battle.combat.session.enemy.armorBreak = { kind: "armorBreak", expiresAt: 5000, stacks: 1, strength: 20 };
  const empowered = resolveLiveCombatAttack(battle, { ...opts, now: 1000, roll: () => 0 });
  assert.equal(empowered.name, "碎甲猛擊");
  assert.equal(empowered.repeatedArmorBreakBonusPercent, 40);

  const unascended = syncLiveCombat(null, "armor-smash-vfx-normal", "enemy-1", {
    ranks: { 碎甲猛擊: 1 }, activeSlots: ["碎甲猛擊", null, null],
  }, "戰士", 100, createSkillAscensions());
  unascended.combat.session.charge.charges["碎甲猛擊"] = 8;
  unascended.combat.session.charge.ready = ["碎甲猛擊"];
  unascended.combat.session.enemy.armorBreak = { kind: "armorBreak", expiresAt: 5000, stacks: 1, strength: 20 };
  const ordinary = resolveLiveCombatAttack(unascended, { ...opts, now: 1000, roll: () => 0 });
  assert.equal(ordinary.repeatedArmorBreakBonusPercent, 0);
});

test("live titan rift reports only follow-up slashes that dealt their separate damage", () => {
  const ascensions = { rebirthCount: 5,
    choices: ["裂地斬", "不屈戰意", "血戰烙印", "碎甲猛擊", "泰坦斷界斬"], selectionOpen: false };
  const battle = syncLiveCombat(null, "titan-rift-vfx", "enemy-1", {
    ranks: { 泰坦斷界斬: 1 }, activeSlots: [null, null, null],
  }, "戰士", 100, ascensions);
  battle.combat.session.charge.ultimateEnergy = 100;
  battle.combat.session.charge.ready = ["泰坦斷界斬"];
  const ultimate = resolveLiveCombatAttack(battle, { ...opts, now: 1000, roll: () => 0 });
  assert.equal(ultimate.name, "泰坦斷界斬");
  assert.equal(ultimate.titanSlashHits, 0);
  for (let index = 1; index <= 3; index += 1) {
    const followUp = resolveLiveCombatAttack(battle, { ...opts, now: 1000 + index * 100, roll: () => 0 });
    assert.equal(followUp.titanSlashHits, 1);
    assert.equal(followUp.titanSlashIndex, index);
  }

  const missed = syncLiveCombat(null, "titan-rift-vfx-miss", "enemy-1", {
    ranks: { 泰坦斷界斬: 1 }, activeSlots: [null, null, null],
  }, "戰士", 100, ascensions);
  missed.combat.session.charge.ultimateEnergy = 100;
  missed.combat.session.charge.ready = ["泰坦斷界斬"];
  resolveLiveCombatAttack(missed, { ...opts, now: 1000, hitChance: 0, roll: () => 0 });
  const missedFollowUp = resolveLiveCombatAttack(missed,
    { ...opts, now: 1100, hitChance: 0, roll: () => 0 });
  assert.equal(missedFollowUp.titanSlashHits, 0);
  assert.equal(missedFollowUp.titanSlashIndex, null);
});

test("ground shock visual metadata follows only the separately hit ascension damage and preserves totals", () => {
  function battle(id) {
    const result = syncLiveCombat(null, id, "enemy-1", {
      ranks: { 裂地斬: 1 }, activeSlots: ["裂地斬", null, null],
    }, "戰士", 100, createSkillAscensions());
    result.combat.buffs.groundShockPending = true;
    return result;
  }
  const hit = resolveLiveCombatAttack(battle("ground-shock-hit"), { ...opts, roll: () => 0 });
  assert.equal(hit.groundShockDamagePercent, 60);
  assert.equal(hit.damagePercent, 160);
  const missed = resolveLiveCombatAttack(battle("ground-shock-miss"), { ...opts, hitChance: 0, roll: () => 0.5 });
  assert.equal(missed.groundShockDamagePercent, 0);
  assert.equal(missed.damagePercent, 0);
  const rolls = [0, .99, .99];
  const extraMissed = resolveLiveCombatAttack(battle("ground-extra-miss"),
    { ...opts, hitChance: 50, roll: () => rolls.shift() ?? .99 });
  assert.equal(extraMissed.hits[0].hit, true);
  assert.equal(extraMissed.groundShockDamagePercent, 0);
  assert.equal(extraMissed.damagePercent, 100);
  const ordinary = syncLiveCombat(null, "ground-ordinary", "enemy-1", {
    ranks: { 裂地斬: 1 }, activeSlots: ["裂地斬", null, null],
  }, "戰士", 100, createSkillAscensions());
  assert.equal(resolveLiveCombatAttack(ordinary, { ...opts, roll: () => 0 }).groundShockDamagePercent, 0);
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

test("astral body grants a next-hit shield after the triggering live attack", () => {
  const battle = syncLiveCombat(null, "astral-body", "boss",
    { ranks: { 星界護體: 5 }, activeSlots: [null, null, null] },
    "法師", 100, createSkillAscensions());
  const first = resolveLiveEnemyAttack(battle,
    { healthPercent: 100, maxHealth: 1000, damage: 40, roll: () => 0.049 });
  assert.equal(first.damage, 40);
  assert.equal((battle.combat).shield.value, 100);

  const second = resolveLiveEnemyAttack(battle,
    { healthPercent: 96, maxHealth: 1000, damage: 150, roll: () => 0.049 });
  assert.equal(second.damage, 50);
  assert.equal((battle.combat).shield.value, 100);
});

test("unyielding will reports its exact activation and three-attack duration", () => {
  const battle = syncLiveCombat(null, "unyielding-timeline", "boss", {
    ranks: { 不屈戰意: 1 }, activeSlots: ["不屈戰意", null, null],
  }, "戰士", 100, createSkillAscensions());
  const attack = () => resolveLiveEnemyAttack(battle, {
    healthPercent: 100, maxHealth: 100, damage: 10, roll: () => 0.99,
  }).unyielding;
  for (let hit = 0; hit < 3; hit += 1) {
    const outcome = attack();
    assert.equal(outcome?.active, false);
    assert.equal(outcome?.activated, false);
  }
  const activation = attack();
  assert.equal(activation?.activated, true);
  assert.equal(activation?.active, true);
  assert.equal(activation?.remainingEnemyAttacks, 3);
  assert.equal(attack()?.remainingEnemyAttacks, 2);
  assert.equal(attack()?.remainingEnemyAttacks, 1);
  const expired = attack();
  assert.equal(expired?.active, false);
  assert.equal(expired?.remainingEnemyAttacks, 0);
});

test("equipped mage mythics affect only their live skill events", () => {
  const cast = (name, equippedItems, withShield = false) => {
    const battle = syncLiveCombat(null, `${name}-${equippedItems.length}`, "boss", {
      ranks: { [name]: 5, ...(withShield ? { 魔力護盾: 5 } : {}) },
      activeSlots: [name, withShield ? "魔力護盾" : null, null],
    }, "法師", 100, createSkillAscensions());
    if (withShield) resolveLiveEnemyAttack(battle,
      { healthPercent: 30, maxHealth: 100, damage: 1, roll: () => 0.99 });
    for (let action = 0; action < 50; action++) {
      const result = resolveLiveCombatAttack(battle, {
        ...opts, now: 1000 + action * 100, roll: () => 0.25, equippedItems,
      });
      if (result.name === name) return result.damagePercent;
    }
    throw new Error(`${name} never cast`);
  };
  const meteor = cast("隕星術", []);
  const extraMeteor = cast("隕星術", [{ mythicId: "skill-mage-cataclysm-crown" }]);
  assert.ok(extraMeteor > meteor, "the second meteor must add real damage");
  const frostfire = cast("霜火新星", [], true);
  const shieldCore = cast("霜火新星", [{ mythicId: "skill-mage-eternal-core" }], true);
  assert.ok(shieldCore > frostfire, "an active shield must increase direct skill damage");
});

test("direct skill damage reaches the shared HP and victory calculation once in every encounter", () => {
  for (const [characterClass, name] of [["戰士", "裂地斬"], ["遊俠", "穿雲箭"], ["法師", "霜火新星"]]) {
    for (const encounter of ["tower", "personal-boss", "world-boss"]) {
      const id = `${encounter}-${name}`;
      const battle = syncLiveCombat(null, id, id, { ranks: { [name]: 5 },
        activeSlots: [name, null, null] }, characterClass, 100, createSkillAscensions());
      let cast;
      for (let i = 0; i < 5; i++) cast = resolveLiveCombatAttack(battle, { ...opts, now: i * 100 + 1000 });
      assert.equal(cast.name, name);
      const route = beginSkillBattleCutover({ battleId: id, encounter, enableRework: false, reworkReady: false });
      const directDamage = Math.round(100 * cast.damagePercent / 100);
      const settled = settleCutoverAction(route, { battleId: id, sequence: 1, legacyDamage: directDamage });
      assert.equal(settled.damage, directDamage);
      const health = settleCombatHealth(100, 100, settled.damage);
      assert.equal(health.remainingPercent, 0);
      assert.equal(health.defeated, true);
    }
  }
});

test("every arrow and missile rolls hit or evasion independently", () => {
  const cases = [
    ["遊俠", "疾風連射", [true, false, true, false, true]],
    ["遊俠", "蒼穹箭雨", [true, false, true, false, true, false, true, false, true]],
    ["法師", "閃電鏈", [true, false, true]],
    ["法師", "星界寂滅", [true, false, true, false, true, false, true]],
  ];
  for (const [characterClass, name, pattern] of cases) {
    const cast = (outcomes) => {
      const battle = syncLiveCombat(null, `segment-hit:${name}`, "enemy", {
        ranks: { [name]: 1 }, activeSlots: ultimate.has(name) ? [null, null, null] : [name, null, null],
      }, characterClass, 100, createSkillAscensions());
      battle.combat.session.charge.ready = [name];
      if (ultimate.has(name)) battle.combat.session.charge.ultimateEnergy = 100;
      const rolls = outcomes.flatMap((hit) => hit ? [0.1, 0.9] : [0.9]);
      let index = 0;
      const result = resolveLiveCombatAttack(battle, { ...opts, hitChance: 50, roll: () => rolls[index++] ?? 0.9 });
      assert.equal(result.name, name);
      assert.deepEqual(result.hits.map((segment) => segment.hit), outcomes, name);
      assert.equal(result.hits.length, outcomes.length, name);
      return result.damagePercent;
    };
    const mixed = cast(pattern);
    const full = cast(pattern.map(() => true));
    const missed = cast(pattern.map(() => false));
    assert.ok(mixed > 0 && mixed < full, `${name} must count only connected segments`);
    assert.equal(missed, 0, `${name} must deal no damage when every segment is evaded`);
  }
});

test("astral collapse empowers only a landed final shockwave", () => {
  const cast = (outcomes) => {
    const battle = syncLiveCombat(null, "astral-ascended", "enemy", {
      ranks: { 星界寂滅: 1 }, activeSlots: [null, null, null],
    }, "法師", 100, createSkillAscensions());
    battle.ascended = new Set(["星界寂滅"]);
    battle.combat.session.charge.ready = ["星界寂滅"];
    battle.combat.session.charge.ultimateEnergy = 100;
    const rolls = outcomes.flatMap((hit) => hit ? [0.1, 0.9] : [0.9]);
    let index = 0;
    return resolveLiveCombatAttack(battle, { ...opts, hitChance: 50, roll: () => rolls[index++] ?? 0.9 });
  };
  const mixed = cast([true, false, true, false, true, false, true]);
  assert.deepEqual(mixed.hits.map((segment) => segment.hit), [true, false, true, false, true, false, true]);
  assert.ok(Math.abs(mixed.damagePercent - (3 * 28 + 252 * 1.24)) < 1e-9);
  const missedExplosion = cast([true, true, true, true, true, true, false]);
  assert.ok(Math.abs(missedExplosion.damagePercent - 168) < 1e-9);
});

test("blood roar visual flag covers exactly five empowered actions, including misses and the finisher", () => {
  const build = createSkillBuild();
  build.ranks["鮮血怒吼"] = 1;
  build.activeSlots[0] = "鮮血怒吼";
  const battle = syncLiveCombat(null, "roar-vfx", "enemy", build, "戰士", 40, createSkillAscensions());
  for (let i = 0; i < 6; i++) {
    const action = resolveLiveCombatAttack(battle, { ...opts, now: 1000+i*1000, healthPercent: 30, hitChance: 0 });
    assert.equal(action.bloodRoarEmpowered, i < 5);
    assert.equal(action.hits.some(hit => hit.hit), false);
  }
});

test("stance visual flag includes exactly eight consumed attacks and does not invent hits", () => {
  const build = createSkillBuild(); build.ranks["狂戰姿態"] = 1; build.activeSlots[0] = "狂戰姿態";
  const battle = syncLiveCombat(null, "stance-vfx", "enemy", build, "戰士", 52, createSkillAscensions());
  battle.combat.buffs.stanceRemaining = 8; battle.combat.buffs.stanceRank = 1;
  for (let i=0;i<9;i++) {
    const action = resolveLiveCombatAttack(battle, { ...opts, now:1000+i*1000, hitChance:0 });
    assert.equal(action.stanceEmpowered, i<8);
    assert.equal(action.hits.some(hit=>hit.hit), false);
  }
});
