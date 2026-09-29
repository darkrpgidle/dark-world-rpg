import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });

const { syncLiveCombat, resolveLiveCombatAttack, advanceLiveCombat, advanceLiveCombatEvents, resolveLiveEnemyAttack } =
  await import("../app/skill-live-combat.ts");
const { createSkillAscensions } = await import("../app/skill-ascensions.ts");
const { settleCombatHealth } = await import("../app/skill-health-settlement.ts");
const { beginSkillBattleCutover, settleCutoverAction } = await import("../app/skill-combat-cutover.ts");

const sets = {
  戰士: ["裂地斬", "血刃斬", "血戰烙印", "狂戰姿態", "碎甲猛擊", "泰坦斷界斬"],
  遊俠: ["穿雲箭", "追風箭", "獵殺標記", "疾風連射", "風行領域", "破星狙擊", "蒼穹箭雨"],
  法師: ["霜火新星", "奧術飛彈", "元素蝕印", "隕星術", "奧術超載", "虛空崩解", "星界寂滅"],
};
const ultimate = new Set(["泰坦斷界斬", "蒼穹箭雨", "星界寂滅"]);
const opts = { now: 1000, healthPercent: 90, attack: 100, hitChance: 100,
  criticalChance: 0, criticalDamage: 50, roll: () => 0.25 };

const { SKILL_REWORK_CATALOG } = await import("../app/skill-rework.ts");
const { SKILL_CHARGE_RULES } = await import("../app/skill-combat-queue.ts");

test("all 24 active skills and ultimates have a reachable trigger path", () => {
  let verified = 0;
  for (const [characterClass, catalog] of Object.entries(SKILL_REWORK_CATALOG)) {
    for (const definition of catalog.filter((skill) => skill.kind === "active")) {
      const name = definition.name;
      const automatic = (characterClass === "戰士" && ["不屈戰意", "鮮血怒吼"].includes(name))
        || (characterClass === "遊俠" && name === "幻影步")
        || (characterClass === "法師" && name === "魔力護盾");
      if (automatic) continue;
      assert.ok(SKILL_CHARGE_RULES[characterClass][name] || definition.category === "ultimate",
        `missing trigger rule: ${characterClass} ${name}`);
      const overloadSupport = characterClass === "法師" && name === "奧術超載";
      const slots = definition.category === "ultimate" ? [null, null, null]
        : overloadSupport ? ["霜火新星", "奧術超載", null] : [name, null, null];
      const build = { ranks: { [name]: 5, ...(overloadSupport ? { 霜火新星: 5 } : {}) }, activeSlots: slots };
      const battle = syncLiveCombat(null, `verify:${characterClass}:${name}`, "target",
        build, characterClass, 100, createSkillAscensions());
      let triggered = false;
      for (let action = 0; action < 80; action++) {
        const result = resolveLiveCombatAttack(battle, {
          ...opts, now: 10_000 + action * 100, roll: () => 0,
        });
        if (result.name === name) {
          triggered = true;
          if (name === "奧術超載") assert.notEqual(battle.combat.overload.phase, "idle");
          else assert.ok(result.hits.some((segment) => segment.hit), `${name} had no successful hit`);
          if (!["血戰烙印", "狂戰姿態", "獵殺標記", "風行領域", "元素蝕印", "奧術超載"].includes(name))
            assert.ok(result.damagePercent > 0, `${name} triggered with no damage`);
          break;
        }
      }
      assert.ok(triggered, `${characterClass} ${name} did not trigger`);
      verified++;
    }
  }
  assert.equal(verified, 20);
});

test("automatic active defenses and low-health roar activate from their real combat events", () => {
  const warrior = syncLiveCombat(null, "verify-warrior-auto", "enemy", {
    ranks: { 鮮血怒吼: 5 }, activeSlots: ["鮮血怒吼", null, null],
  }, "戰士", 100, createSkillAscensions());
  resolveLiveCombatAttack(warrior, { ...opts, healthPercent: 39, roll: () => 0 });
  assert.equal(warrior.combat.buffs.bloodRoarUsed, true);
  assert.ok(warrior.combat.buffs.bloodRoarRemaining > 0);

  for (const [characterClass, name] of [["戰士", "不屈戰意"], ["遊俠", "幻影步"], ["法師", "魔力護盾"]]) {
    const battle = syncLiveCombat(null, `verify-defense:${name}`, "enemy", {
      ranks: { [name]: 5 }, activeSlots: [name, null, null],
    }, characterClass, 100, createSkillAscensions());
    let protectedHit = false;
    let specialStateObserved = false;
    for (let index = 0; index < 12; index++) {
      const result = resolveLiveEnemyAttack(battle, {
        healthPercent: 30, maxHealth: 100, damage: 60, roll: () => 0,
      });
      protectedHit ||= result.damage < 60 || result.blocked || result.dodged;
      specialStateObserved ||= name === "不屈戰意"
        ? battle.combat.defense.activeForAttack
        : name === "幻影步"
          ? battle.combat.defense.phantomActiveForAttack
          : battle.combat.shieldActivatedThisBattle;
    }
    assert.ok(protectedHit, `${name} did not protect its owner`);
    assert.ok(specialStateObserved, `${name} state never activated`);
    if (name === "不屈戰意") assert.ok(battle.combat.defense.receivedAttacks < 12);
    if (name === "幻影步") assert.ok(battle.combat.defense.receivedAttacks < 12);
    if (name === "魔力護盾") {
      assert.equal(battle.combat.shieldActivatedThisBattle, true);
      assert.ok(battle.combat.shield.initialValue > 0);
    }
  }
});

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
  const events = advanceLiveCombatEvents(battle, 2300);
  assert.ok(events.some((event) => event.kind === "bleed" && event.damage > 0));
  assert.ok(events.every((event) => event.kind === "bleed" || event.kind === "burn"));
  syncLiveCombat(battle, "tower-1", "enemy-2", battle.build, "戰士", 100, createSkillAscensions());
  assert.deepEqual(advanceLiveCombat(battle, 4000), []);
});


test("bleed and burn tick events visibly carry separate damage and reduce target HP", () => {
  for (const [characterClass, name, expectedKind] of [
    ["戰士", "血刃斬", "bleed"], ["法師", "霜火新星", "burn"],
  ]) {
    const battle = syncLiveCombat(null, `dot-hp:${name}`, "enemy", {
      ranks: { [name]: 5 }, activeSlots: [name, null, null],
    }, characterClass, 100, createSkillAscensions());
    let lastActionAt = opts.now;
    let applied = null;
    for (let index = 0; index < 20; index++) {
      lastActionAt = opts.now + index * 100;
      applied = resolveLiveCombatAttack(battle, { ...opts, now: lastActionAt, roll: () => 0 });
      if (applied.statuses.includes(expectedKind)) break;
    }
    assert.ok(applied?.statuses.includes(expectedKind), `${name} did not apply ${expectedKind}`);
    const events = advanceLiveCombatEvents(battle, lastActionAt + 3_100);
    const relevant = events.filter((event) => event.kind === expectedKind);
    assert.ok(relevant.length > 0, `${expectedKind} produced no tick events`);
    assert.ok(relevant.every((event) => event.damage > 0));
    const settlement = settleCombatHealth(100, 100, relevant.reduce((sum, event) => sum + event.damage, 0));
    assert.ok(settlement.actualDamage > 0, `${expectedKind} did not lower HP`);
  }
});

test("a passive bleed refresh settles its due tick with the earlier attack snapshot", () => {
  const battle = syncLiveCombat(null, "tower-snapshot", "enemy-1", {
    ranks: { 裂傷本能: 5 }, activeSlots: [null, null, null],
  }, "戰士", 100, createSkillAscensions());
  const first = resolveLiveCombatAttack(battle,
    { ...opts, now: 1000, attack: 100, roll: () => 0 });
  assert.ok(first.statuses.includes("bleed"));
  const refresh = resolveLiveCombatAttack(battle,
    { ...opts, now: 2000, attack: 200, roll: () => 0 });
  assert.equal(refresh.name, null);
  assert.ok(refresh.statuses.includes("bleed"));
  assert.deepEqual(refresh.ticks, [{ kind: "bleed", damage: 20 }]);
  assert.equal(battle.dotAttack.bleed, 200);
  assert.deepEqual(advanceLiveCombat(battle, 3000), [80]);
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
    ["法師", "奧術飛彈", [true, false, true]],
  ];
  for (const [characterClass, name, pattern] of cases) {
    const cast = (outcomes) => {
      const battle = syncLiveCombat(null, `segment-hit:${name}`, "enemy", {
        ranks: { [name]: 1 },
        activeSlots: ultimate.has(name) ? [null, null, null] : [name, null, null],
      }, characterClass, 100, createSkillAscensions());
      battle.combat.session.charge.ready = [name];
      if (ultimate.has(name)) battle.combat.session.charge.ultimateEnergy = 100;
      const rolls = outcomes.flatMap((hit) => hit ? [0.1, 0.9] : [0.9]);
      let index = 0;
      const result = resolveLiveCombatAttack(battle, {
        ...opts, hitChance: 50, roll: () => rolls[index++] ?? 0.9,
      });
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
