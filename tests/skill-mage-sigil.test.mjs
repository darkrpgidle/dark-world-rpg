import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { createSkillBuild, upgradeSkill, equipActiveSkill } = await import("../app/skill-rework.ts");
const { createMageCombat, resolveMageTurn, transitionMageCombat } = await import("../app/skill-mage-combat.ts");
const { applyEnemyDebuff } = await import("../app/skill-debuff-timer.ts");
const {
  createMageSigilState, consumeMageSigilActiveCast, recordMageSigilStatuses,
  transitionMageSigilTarget,
} = await import("../app/skill-mage-sigil.ts");

function mage(ranks, slots = []) {
  let build = createSkillBuild();
  for (const [name, rank] of Object.entries(ranks)) {
    for (let i = 0; i < rank; i++) build = upgradeSkill(build, "法師", 100, name);
  }
  for (const [index, name] of slots.entries()) build = equipActiveSkill(build, "法師", 100, index, name);
  return createMageCombat(build, 100);
}
function turn(combat, skill, now, { hits = [{ hit: true }], roll = () => 1, ascended = true } = {}) {
  return resolveMageTurn(combat, {
    skill, now, hits, roll, ascended: ascended ? new Set(["元素蝕印"]) : new Set(),
  });
}
function ready(combat, skill, at = 0, roll = () => 1) {
  for (let index = 0; index < 20 && !combat.session.charge.ready.includes(skill); index++) {
    const earlier = combat.session.charge.ready.find((name) =>
      name !== "元素蝕印" || !combat.session.enemy.elementSigil);
    combat = turn(combat, earlier ?? "normal", at + index * 100, { roll }).combat;
  }
  assert.ok(combat.session.charge.ready.includes(skill), `${skill} should be ready`);
  return combat;
}

test("each sigil rank has its own duration and bonus; its application never activates chaos seal", () => {
  for (const [index, duration] of [7, 8, 9, 10, 12].entries()) {
    let combat = ready(mage({ 元素蝕印: index + 1 }, ["元素蝕印"]), "元素蝕印");
    const result = turn(combat, "元素蝕印", 500);
    assert.equal(result.combat.session.enemy.elementSigil.expiresAt, 500 + duration * 1000);
    assert.equal(result.combat.session.enemy.elementSigil.strength, [5, 7, 9, 11, 14][index]);
    assert.equal(result.sigilAscensionStatusChancePoints, 0);
    assert.deepEqual(result.combat.sigil,
      { markedAscended: true, firstAnomalyUsed: false, enhancedCastsRemaining: 0 });
  }
});

test("an unascended mark and a failed burn roll cannot trigger the following-casts bonus", () => {
  let combat = ready(mage({ 元素蝕印: 1, 焰脈: 5 }, ["元素蝕印"]), "元素蝕印");
  combat = turn(combat, "元素蝕印", 500, { ascended: false }).combat;
  assert.equal(turn(combat, "normal", 600, { roll: () => 0 }).combat.sigil.enhancedCastsRemaining, 0);
  combat = ready(mage({ 元素蝕印: 1, 焰脈: 5 }, ["元素蝕印"]), "元素蝕印");
  combat = turn(combat, "元素蝕印", 500).combat;
  assert.deepEqual(turn(combat, "normal", 600, { roll: () => 0.20 }).statusApplications, []);
  assert.equal(turn(combat, "normal", 600, { hits: [{ hit: false }], roll: () => {
    throw Error("a miss must not roll status");
  } }).combat.sigil.enhancedCastsRemaining, 0);
});

test("marked normal attack adds mark points to flame vein and first burn grants three later casts", () => {
  let combat = ready(mage({ 元素蝕印: 5, 焰脈: 5 }, ["元素蝕印"]), "元素蝕印");
  combat = turn(combat, "元素蝕印", 500).combat;
  let rolls = 0;
  const trigger = turn(combat, "normal", 600, { roll: () => { rolls++; return 0.25; } });
  assert.equal(rolls, 1); // 12% flame vein + 14 points from the existing mark
  assert.deepEqual(trigger.statusApplications, [{ kind: "burn", effectMultiplier: 1.3 }]);
  assert.equal(trigger.sigilAscensionStatusChancePoints, 0);
  assert.equal(trigger.combat.sigil.enhancedCastsRemaining, 3);
  const anotherNormal = turn(trigger.combat, "normal", 700, { roll: () => 0 });
  assert.equal(anotherNormal.combat.sigil.enhancedCastsRemaining, 3);
  assert.equal(anotherNormal.combat.sigil.firstAnomalyUsed, true);
});

test("the triggering frost cast does not receive its own 15 points; the next three spend one per cast", () => {
  let combat = mage({ 元素蝕印: 5, 霜火新星: 5, 精密咒式: 5 }, ["元素蝕印", "霜火新星"]);
  combat = ready(combat, "元素蝕印");
  combat = turn(combat, "元素蝕印", 500).combat;
  combat = ready(combat, "霜火新星", 600);
  const initial = turn(combat, "霜火新星", 1000, { roll: () => 0.60 });
  assert.equal(initial.burnChancePercent, 73.6); // 40 + 14 + 14, no sigil bonus yet
  assert.equal(initial.combat.sigil.enhancedCastsRemaining, 3);
  combat = initial.combat;
  for (let index = 0; index < 3; index++) {
    combat = ready(combat, "霜火新星", 1000 + index * 1000);
    const cast = turn(combat, "霜火新星", 1500 + index * 1000, {
      hits: [{ hit: index !== 1 }], roll: () => 1,
    });
    assert.equal(cast.sigilAscensionStatusChancePoints, 15);
    assert.equal(cast.burnChancePercent, index === 1 ? 0 : 90.85);
    assert.equal(cast.combat.sigil.enhancedCastsRemaining, 2 - index);
    combat = cast.combat;
  }
  combat = ready(combat, "霜火新星", 4500);
  assert.equal(turn(combat, "霜火新星", 5000).sigilAscensionStatusChancePoints, 0);
});

test("multi-hit and status-only casts each spend one use, including an all-miss cast", () => {
  let sigil = recordMageSigilStatuses(createMageSigilState(), {
    hadCurrentSigil: false, appliedKinds: ["elementSigil"], newlyAppliedSigilAscended: true,
  });
  sigil = recordMageSigilStatuses(sigil, {
    hadCurrentSigil: true, appliedKinds: ["burn", "burn"], newlyAppliedSigilAscended: false,
  });
  assert.equal(sigil.enhancedCastsRemaining, 3);
  for (const skill of ["three-hit missile", "status-only mark", "all-miss frost"]) {
    const spent = consumeMageSigilActiveCast(sigil, true);
    assert.equal(spent.statusChancePoints, 15, skill);
    sigil = spent.state;
  }
  assert.equal(sigil.enhancedCastsRemaining, 0);
  assert.equal(consumeMageSigilActiveCast(sigil, true).statusChancePoints, 0);
  assert.equal(consumeMageSigilActiveCast(sigil, false).statusChancePoints, 0);
});

test("refresh keeps the first trigger spent and cannot stack; expiry creates a new mark instance", () => {
  let sigil = recordMageSigilStatuses(createMageSigilState(), {
    hadCurrentSigil: false, appliedKinds: ["elementSigil"], newlyAppliedSigilAscended: true,
  });
  sigil = recordMageSigilStatuses(sigil, {
    hadCurrentSigil: true, appliedKinds: ["burn"], newlyAppliedSigilAscended: false,
  });
  sigil = consumeMageSigilActiveCast(sigil, true).state;
  sigil = recordMageSigilStatuses(sigil, {
    hadCurrentSigil: true, appliedKinds: ["elementSigil", "burn"], newlyAppliedSigilAscended: true,
  });
  assert.equal(sigil.firstAnomalyUsed, true);
  assert.equal(sigil.enhancedCastsRemaining, 2);
  sigil = transitionMageSigilTarget(sigil, false);
  assert.equal(sigil.markedAscended, false);
  assert.equal(sigil.enhancedCastsRemaining, 2);
  sigil = recordMageSigilStatuses(sigil, {
    hadCurrentSigil: false, appliedKinds: ["elementSigil"], newlyAppliedSigilAscended: true,
  });
  sigil = recordMageSigilStatuses(sigil, {
    hadCurrentSigil: true, appliedKinds: ["burn"], newlyAppliedSigilAscended: false,
  });
  assert.equal(sigil.enhancedCastsRemaining, 3); // refresh pending buff, not 2 + 3
});

test("expiry removes mark chance and trigger eligibility while keeping earned player buffs", () => {
  let combat = ready(mage({ 元素蝕印: 1, 霜火新星: 1 }, ["元素蝕印", "霜火新星"]), "元素蝕印");
  combat = turn(combat, "元素蝕印", 500).combat;
  combat = ready(combat, "霜火新星", 600);
  const expired = turn(combat, "霜火新星", 7500, { roll: () => 0 });
  assert.equal(expired.burnChancePercent, 25);
  assert.equal(expired.combat.session.enemy.elementSigil, undefined);
  assert.equal(expired.combat.sigil.enhancedCastsRemaining, 0);
  assert.equal(expired.combat.sigil.markedAscended, false);
  const retained = { ...combat, sigil: { ...combat.sigil, enhancedCastsRemaining: 3 } };
  const afterExpiry = turn(retained, "霜火新星", 7500, { roll: () => 1 });
  assert.equal(afterExpiry.sigilAscensionStatusChancePoints, 15);
  assert.equal(afterExpiry.combat.sigil.enhancedCastsRemaining, 2);
});

test("normal kill retains player buff but clears the target mark; major boundaries clear both", () => {
  let combat = ready(mage({ 元素蝕印: 1, 焰脈: 5 }, ["元素蝕印"]), "元素蝕印");
  combat = turn(combat, "元素蝕印", 500).combat;
  combat = turn(combat, "normal", 600, { roll: () => 0 }).combat;
  const next = transitionMageCombat(combat, "normal-kill");
  assert.equal(next.session.enemy.elementSigil, undefined);
  assert.deepEqual(next.sigil,
    { markedAscended: false, firstAnomalyUsed: false, enhancedCastsRemaining: 3 });
  for (const boundary of ["death", "map-change", "boss-start", "pvp-start"]) {
    assert.deepEqual(transitionMageCombat(combat, boundary).sigil, createMageSigilState());
  }
});

test("failed sigil application and unrelated target statuses never fabricate a trigger", () => {
  let combat = ready(mage({ 元素蝕印: 1, 焰脈: 5 }, ["元素蝕印"]), "元素蝕印");
  combat = turn(combat, "元素蝕印", 500, { hits: [{ hit: false }] }).combat;
  assert.deepEqual(combat.sigil, createMageSigilState());
  combat = { ...combat, session: { ...combat.session,
    enemy: applyEnemyDebuff(combat.session.enemy, { kind: "burn" }, 600).state } };
  assert.equal(turn(combat, "normal", 700, { roll: () => 0 }).combat.sigil.enhancedCastsRemaining, 0);
});
