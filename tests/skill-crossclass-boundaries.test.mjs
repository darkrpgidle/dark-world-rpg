import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { createSkillBuild, upgradeSkill, equipActiveSkill } = await import("../app/skill-rework.ts");
const { createWarriorCombat, transitionWarriorCombat, transitionWarriorNormalKill } =
  await import("../app/skill-warrior-combat.ts");
const { createWarriorBuffState, recordWarriorSkillHit, triggerWarriorBloodRoar } =
  await import("../app/skill-warrior-rules.ts");
const { createWarriorPassiveState, recordWarriorBlock } = await import("../app/skill-warrior-passives.ts");
const { createWarriorDefenseState, recordWarriorSuccessfulBlock } =
  await import("../app/skill-warrior-defense.ts");
const { createRangerCombat, transitionRangerCombat, transitionRangerNormalKill } =
  await import("../app/skill-ranger-combat.ts");
const { activateRangerWindDomain, createRangerWindDomain } = await import("../app/skill-ranger-rules.ts");
const { createRangerPassiveState, recordRangerDodge } = await import("../app/skill-ranger-passives.ts");
const { createRangerDefenseState, recordRangerSuccessfulDodge } =
  await import("../app/skill-ranger-defense.ts");
const { createMageCombat, transitionMageCombat } = await import("../app/skill-mage-combat.ts");
const { createMageShieldState } = await import("../app/skill-mage-shield.ts");
const { createMageSigilState } = await import("../app/skill-mage-sigil.ts");
const { createMageOverload } = await import("../app/skill-mage-rules.ts");
const { resolveSkillAction, advanceCombatSession, trySkillProc } =
  await import("../app/skill-combat-session.ts");
const { applyEnemyDebuff, advanceEnemyDebuffs, countEnemyAbnormalKinds, isAppliedAffliction } =
  await import("../app/skill-debuff-timer.ts");
const { recordMageSigilStatuses } =
  await import("../app/skill-mage-sigil.ts");
const { countMageAbnormalKinds } = await import("../app/skill-mage-passives.ts");

function build(characterClass, names, slots) {
  let result = createSkillBuild();
  for (const name of names) result = upgradeSkill(result, characterClass, 100, name);
  for (const [index, name] of slots.entries()) result = equipActiveSkill(result, characterClass, 100, index, name);
  return result;
}
function oneAttack(combat, status, now = 0) {
  const action = resolveSkillAction(combat.session, {
    kind: "normal", hits: [{ hit: true, critical: true }],
    successfulStatuses: [{ kind: status }],
  }, now);
  const proc = trySkillProc(action.session,
    { id: "gear", kind: "damage", source: "primary", family: "equipment" });
  return { ...combat, session: proc.session };
}

test("warrior ordinary kill preserves player buffs and ready order but drops enemy and mark history", () => {
  let combat = createWarriorCombat(build("戰士",
    ["裂地斬", "泰坦斷界斬", "鮮血怒吼", "不屈戰意", "格擋精通", "堅盾反射"],
    ["裂地斬"]), 100);
  combat = oneAttack(combat, "bloodBrand");
  combat = { ...combat,
    buffs: recordWarriorSkillHit(triggerWarriorBloodRoar(combat.buffs, 1, 39, true),
      "裂地斬", true, true),
    bloodBrandBurstUsed: true,
    session: { ...combat.session, charge: { ...combat.session.charge,
      ready: ["裂地斬"], charges: { ...combat.session.charge.charges, 裂地斬: 4 } } },
  };
  combat = recordWarriorSuccessfulBlock(combat, true).combat;
  const kill = transitionWarriorNormalKill(combat);
  assert.deepEqual(kill.session.enemy, {});
  assert.deepEqual(kill.session.usedDamageProcs, []);
  assert.deepEqual(kill.session.charge, combat.session.charge);
  assert.deepEqual(kill.buffs, combat.buffs);
  assert.deepEqual(kill.passives, combat.passives);
  assert.deepEqual(kill.defense, combat.defense);
  assert.equal(kill.bloodBrandBurstUsed, false);
  assert.deepEqual(transitionWarriorCombat(combat, "normal-kill"), kill);
});

test("warrior death, map change, boss and PvP starts clear target and every player-side pending effect", () => {
  let combat = createWarriorCombat(build("戰士",
    ["裂地斬", "泰坦斷界斬", "鮮血怒吼", "不屈戰意", "格擋精通"],
    ["裂地斬"]), 100);
  combat = oneAttack(combat, "bleed");
  combat = { ...combat,
    buffs: recordWarriorSkillHit(triggerWarriorBloodRoar(combat.buffs, 1, 39, true),
      "泰坦斷界斬", false, true),
    session: { ...combat.session, charge: { ...combat.session.charge, ready: ["裂地斬"] } },
  };
  combat = recordWarriorSuccessfulBlock(combat, true).combat;
  for (const boundary of ["death", "map-change", "boss-start", "pvp-start"]) {
    const reset = transitionWarriorCombat(combat, boundary);
    assert.deepEqual(reset.buffs, createWarriorBuffState(), boundary);
    assert.deepEqual(reset.passives, createWarriorPassiveState(), boundary);
    assert.deepEqual(reset.defense, createWarriorDefenseState(), boundary);
    assert.deepEqual(reset.session.enemy, {}, boundary);
    assert.deepEqual(reset.session.usedDamageProcs, [], boundary);
    assert.deepEqual(reset.session.charge.ready, [], boundary);
    assert.equal(reset.session.charge.charges.裂地斬, 0, boundary);
    assert.equal(reset.session.charge.ultimateEnergy, 0, boundary);
  }
});

test("ranger ordinary kill carries self buffs and charge but clears marked enemy and explosion progress", () => {
  let combat = createRangerCombat(build("遊俠",
    ["穿雲箭", "蒼穹箭雨", "幻影步", "影步反射", "乘風閃擊"],
    ["穿雲箭", "幻影步"]), 100);
  combat = oneAttack(combat, "hunterMark");
  combat = { ...combat,
    windDomain: activateRangerWindDomain(1, true),
    passives: recordRangerDodge(combat.passives, combat.build),
    nextSkillIgnoreDefensePending: true,
    hunterMarkCriticalHits: 2,
    hunterExplosionPending: true,
    session: { ...combat.session, charge: { ...combat.session.charge, ready: ["穿雲箭"] } },
  };
  combat = recordRangerSuccessfulDodge(combat,
    { phantomStepActive: true, ascended: true }).combat;
  const kill = transitionRangerNormalKill(combat);
  assert.deepEqual(kill.session.enemy, {});
  assert.deepEqual(kill.session.usedDamageProcs, []);
  assert.deepEqual(kill.session.charge, combat.session.charge);
  assert.deepEqual(kill.windDomain, combat.windDomain);
  assert.deepEqual(kill.passives, combat.passives);
  assert.deepEqual(kill.defense, combat.defense);
  assert.equal(kill.nextSkillIgnoreDefensePending, true);
  assert.equal(kill.hunterMarkCriticalHits, 0);
  assert.equal(kill.hunterExplosionPending, false);
  assert.deepEqual(transitionRangerCombat(combat, "normal-kill"), kill);
});

test("ranger death, map change, boss and PvP starts discard all waiting player and target effects", () => {
  let combat = createRangerCombat(build("遊俠",
    ["穿雲箭", "蒼穹箭雨", "幻影步"], ["穿雲箭", "幻影步"]), 100);
  combat = oneAttack(combat, "hunterMark");
  combat = { ...combat, windDomain: activateRangerWindDomain(1, true),
    nextSkillIgnoreDefensePending: true, hunterMarkCriticalHits: 2, hunterExplosionPending: true,
    session: { ...combat.session, charge: { ...combat.session.charge, ready: ["穿雲箭"] } } };
  combat = recordRangerSuccessfulDodge(combat,
    { phantomStepActive: true, ascended: true }).combat;
  for (const boundary of ["death", "map-change", "boss-start", "pvp-start"]) {
    const reset = transitionRangerCombat(combat, boundary);
    assert.deepEqual(reset.windDomain, createRangerWindDomain(), boundary);
    assert.deepEqual(reset.passives, createRangerPassiveState(), boundary);
    assert.deepEqual(reset.defense, createRangerDefenseState(), boundary);
    assert.equal(reset.nextSkillIgnoreDefensePending, false, boundary);
    assert.equal(reset.hunterMarkCriticalHits, 0, boundary);
    assert.equal(reset.hunterExplosionPending, false, boundary);
    assert.deepEqual(reset.session.enemy, {}, boundary);
    assert.deepEqual(reset.session.usedDamageProcs, [], boundary);
    assert.deepEqual(reset.session.charge.ready, [], boundary);
    assert.equal(reset.session.charge.charges.穿雲箭, 0, boundary);
    assert.equal(reset.session.charge.ultimateEnergy, 0, boundary);
  }
});

test("mage ordinary kill retains self buffs but loses its enemy mark and target-specific trigger", () => {
  let combat = createMageCombat(build("法師", ["霜火新星", "星界寂滅"], ["霜火新星"]), 100);
  combat = oneAttack(combat, "elementSigil");
  combat = { ...combat,
    overload: { phase: "overloaded", rank: 1, ascended: false,
      remainingSuccessfulCasts: 3, stabilityStacks: 0 },
    shield: { value: 50, initialValue: 100, ascended: true, enhancedCastsRemaining: 2 },
    sigil: { markedAscended: true, firstAnomalyUsed: true, enhancedCastsRemaining: 2 },
    session: { ...combat.session, charge: { ...combat.session.charge, ready: ["霜火新星"] } },
  };
  const kill = transitionMageCombat(combat, "normal-kill");
  assert.deepEqual(kill.session.enemy, {});
  assert.deepEqual(kill.session.usedDamageProcs, []);
  assert.deepEqual(kill.session.charge, combat.session.charge);
  assert.deepEqual(kill.overload, combat.overload);
  assert.deepEqual(kill.shield, combat.shield);
  assert.deepEqual(kill.sigil,
    { markedAscended: false, firstAnomalyUsed: false, enhancedCastsRemaining: 2 });
});

test("mage death, map change, boss and PvP starts discard self buffs and enemy effects", () => {
  let combat = createMageCombat(build("法師", ["霜火新星", "星界寂滅"], ["霜火新星"]), 100);
  combat = oneAttack(combat, "burn");
  combat = { ...combat,
    overload: { phase: "exhausted", basePenaltyPercent: 15 },
    shield: { value: 50, initialValue: 100, ascended: true, enhancedCastsRemaining: 2 },
    sigil: { markedAscended: true, firstAnomalyUsed: true, enhancedCastsRemaining: 2 },
    session: { ...combat.session, charge: { ...combat.session.charge, ready: ["霜火新星"] } },
  };
  for (const boundary of ["death", "map-change", "boss-start", "pvp-start"]) {
    const reset = transitionMageCombat(combat, boundary);
    assert.deepEqual(reset.overload, createMageOverload(), boundary);
    assert.deepEqual(reset.shield, createMageShieldState(), boundary);
    assert.deepEqual(reset.sigil, createMageSigilState(), boundary);
    assert.deepEqual(reset.session.enemy, {}, boundary);
    assert.deepEqual(reset.session.usedDamageProcs, [], boundary);
    assert.deepEqual(reset.session.charge.ready, [], boundary);
    assert.equal(reset.session.charge.charges.霜火新星, 0, boundary);
    assert.equal(reset.session.charge.ultimateEnergy, 0, boundary);
  }
});

test("ascension, counter, proc and DoT follow-ups cannot roll any new proc", () => {
  const combat = createMageCombat(build("法師", ["星界寂滅"], []), 100);
  for (const source of ["ascension", "counter", "proc", "dot"]) {
    for (const kind of ["damage", "status", "buff"]) {
      for (const family of ["passive", "equipment"]) {
        const result = trySkillProc(combat.session, { id: `${source}:${kind}:${family}`, source, kind, family });
        assert.equal(result.allowed, false);
        assert.equal(result.session, combat.session);
      }
    }
  }
  for (const kind of ["damage", "status", "buff"]) {
    assert.equal(trySkillProc(combat.session,
      { id: `secondary:${kind}`, source: "secondary", kind, family: "passive" }).allowed, false);
  }
});

test("a secondary equipment proc shares the two damage slots, but cannot proc from its own hit", () => {
  let session = createMageCombat(build("法師", ["星界寂滅"], []), 100).session;
  session = trySkillProc(session,
    { id: "first", kind: "damage", source: "primary", family: "passive" }).session;
  const second = trySkillProc(session,
    { id: "gear", kind: "damage", source: "secondary", family: "equipment" });
  assert.equal(second.allowed, true);
  assert.deepEqual(second.session.usedDamageProcs, ["first", "gear"]);
  assert.equal(trySkillProc(second.session,
    { id: "third", kind: "damage", source: "primary", family: "equipment" }).allowed, false);
  assert.equal(trySkillProc(second.session,
    { id: "gear-chain", kind: "damage", source: "proc", family: "equipment" }).allowed, false);
  assert.deepEqual(second.session.charge, session.charge);
});

test("enemy DoT ticks use wall time and never create a second primary attack or resource event", () => {
  let session = createWarriorCombat(build("戰士", ["血刃斬", "泰坦斷界斬"], ["血刃斬"]), 100).session;
  session = resolveSkillAction(session, {
    kind: "normal", hits: [{ hit: true }], successfulStatuses: [{ kind: "bleed" }],
  }, 0).session;
  const originalCharge = session.charge;
  const at2500 = advanceCombatSession(session, 2500);
  assert.deepEqual(at2500.ticks.map((tick) => tick.at), [1000, 2000]);
  assert.deepEqual(at2500.session.charge, originalCharge);
  const at3000 = advanceCombatSession(at2500.session, 3000);
  assert.deepEqual(at3000.ticks.map((tick) => tick.at), [3000]);
  assert.deepEqual(at3000.session.charge, originalCharge);
  assert.deepEqual(advanceCombatSession(at3000.session, 5000).ticks, []);
  assert.deepEqual(transitionWarriorCombat({
    ...createWarriorCombat(build("戰士", ["血刃斬", "泰坦斷界斬"], ["血刃斬"]), 100),
    session,
  }, "normal-kill").session.enemy, {});
});

test("all classes share the same four target abnormal categories, independent of stacks and marks", () => {
  let enemy = {};
  for (const kind of ["bleed", "bleed", "burn", "armorBreak", "elementSigil", "bloodBrand", "hunterMark"]) {
    enemy = applyEnemyDebuff(enemy, { kind }, 0).state;
  }
  assert.equal(enemy.bleed.stacks, 2);
  assert.equal(countEnemyAbnormalKinds(enemy), 4);
  assert.equal(countMageAbnormalKinds(enemy), 4);
  assert.equal(countEnemyAbnormalKinds(advanceEnemyDebuffs(enemy, 4001).state), 1);
  assert.equal(countEnemyAbnormalKinds(advanceEnemyDebuffs(enemy, 13000).state), 0);
  const ranger = createRangerCombat(build("遊俠", ["穿雲箭"], ["穿雲箭"]), 100);
  assert.equal(countEnemyAbnormalKinds(transitionRangerCombat({
    ...ranger, session: { ...ranger.session, enemy },
  }, "normal-kill").session.enemy), 0);
});

test("placing a sigil counts for target damage but only a later affliction activates chaos seal", () => {
  assert.equal(isAppliedAffliction("elementSigil"), false);
  for (const kind of ["bloodBrand", "hunterMark", "elementSigil"]) {
    assert.equal(isAppliedAffliction(kind), false);
  }
  for (const kind of ["bleed", "burn", "armorBreak"]) {
    assert.equal(isAppliedAffliction(kind), true);
    const marked = recordMageSigilStatuses(createMageSigilState(), {
      hadCurrentSigil: false, appliedKinds: ["elementSigil"], newlyAppliedSigilAscended: true,
    });
    assert.equal(marked.enhancedCastsRemaining, 0);
    const triggered = recordMageSigilStatuses(marked, {
      hadCurrentSigil: true, appliedKinds: [kind], newlyAppliedSigilAscended: false,
    });
    assert.equal(triggered.enhancedCastsRemaining, 3);
  }
});
