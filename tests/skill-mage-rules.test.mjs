import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const {
  MAGE_ACTIVE_RULES, MAGE_PASSIVE_RULES, mageSkillRankValue,
  createMageOverload, activateMageOverload, addMageOverloadStability,
  consumeMageOverload, mageExhaustionPenaltyPercent, clearMageExhaustion,
} = await import("../app/skill-mage-rules.ts");
const { SKILL_REWORK_CATALOG } = await import("../app/skill-rework.ts");
const { createSkillCombatState, recordPrimaryAttack, consumeReadySkill, SKILL_CHARGE_RULES } = await import("../app/skill-combat-queue.ts");

const hit = { kind: "skill", hits: [{ hit: true }] };
const missiles = { kind: "skill", hits: [{ hit: true }, { hit: true }, { hit: true }] };
function exhaust(state) {
  for (let i = 0; i < 3; i++) state = consumeMageOverload(state, hit).state;
  return state;
}

test("mage catalog has all eight actives and twelve passives in the specified unlock order", () => {
  const active = SKILL_REWORK_CATALOG.法師.filter((skill) => skill.kind === "active");
  const passive = SKILL_REWORK_CATALOG.法師.filter((skill) => skill.kind === "passive");
  assert.equal(active.length, 8);
  assert.equal(passive.length, 12);
  assert.deepEqual(Object.keys(MAGE_ACTIVE_RULES), active.map((skill) => skill.name));
  assert.deepEqual(Object.keys(MAGE_PASSIVE_RULES), passive.map((skill) => skill.name));
  assert.deepEqual(active.map((skill) => skill.unlockLevel), [1, 10, 20, 30, 40, 52, 66, 80]);
  assert.deepEqual(passive.map((skill) => skill.unlockLevel), [5, 12, 18, 24, 32, 38, 45, 50, 56, 62, 70, 76]);
  assert.deepEqual(Object.values(MAGE_ACTIVE_RULES).map((rule) => rule.category), active.map((skill) => skill.category));
});

test("all mage Lv1–5 rows match sections 10 and 17 of the specification", () => {
  const rows = (rules) => Object.fromEntries(Object.entries(rules).map(([name, rule]) =>
    [name, Object.fromEntries(Object.entries(rule).filter(([, value]) => Array.isArray(value)))]));
  assert.deepEqual(rows(MAGE_ACTIVE_RULES), {
    霜火新星: { damage: [155, 165, 175, 190, 205], burnChance: [25, 30, 35, 40, 50] },
    閃電鏈: { damagePerMissile: [60, 70, 80, 90, 100] },
    魔力護盾: { maxHealthShieldPercent: [12, 15, 18, 21, 25] },
    元素蝕印: { durationSeconds: [7, 8, 9, 10, 12], statusChancePoints: [5, 7, 9, 11, 14], statusEffectBonus: [10, 15, 20, 25, 30] },
    隕星術: { damage: [260, 290, 320, 355, 395], burnChance: [100, 100, 100, 100, 100] },
    奧術超載: { skillEfficiencyBonus: [15, 18, 22, 26, 30] },
    虛空崩解: { damage: [250, 275, 300, 330, 365], damageBonusVsStatus: [20, 25, 30, 35, 40] },
    星界寂滅: { totalDamage: [420, 475, 530, 590, 660] },
  });
  assert.deepEqual(rows(MAGE_PASSIVE_RULES), {
    奧術感知: { activeDirectDamageBonus: [5, 8, 10, 13, 15] },
    焰脈: { normalBurnChance: [5, 8, 10, 13, 15] },
    星界護體: { incomingShieldChancePercent: [5, 5, 5, 5, 5], incomingShieldMaxHealthPercent: [5, 6, 7, 8, 10] },
    燃燼導引: { activeDirectDamageVsBurn: [6, 9, 12, 15, 18] },
    護盾轉流: { activeDirectDamageWithShield: [5, 8, 10, 13, 15] },
    精密咒式: { activeStatusChanceBonus: [5, 8, 10, 13, 15] },
    餘燼回響: { extraDamage: [25, 35, 45, 55, 65] },
    奧術循環: { ultimateEnergyPerSuccessfulCast: [2, 3, 4, 5, 6] },
    元素共振: { activeDirectDamagePerStatus: [5, 8, 10, 13, 15] },
    屏障續航: { initialShieldBonus: [10, 15, 20, 25, 30] },
    枯竭控制: { exhaustionReductionPercent: [10, 20, 30, 40, 50] },
    星界回爆: { ultimateFinalExplosionExtraDamage: [45, 55, 65, 75, 90] },
  });
  for (const rule of [...Object.values(MAGE_ACTIVE_RULES), ...Object.values(MAGE_PASSIVE_RULES)]) {
    for (const values of Object.values(rule).filter(Array.isArray)) {
      for (let rank = 1; rank <= 5; rank++) assert.equal(mageSkillRankValue(values, rank), values[rank - 1]);
    }
  }
});

test("ascension data preserves segment counts, shield/mark limits and independent proc caps", () => {
  assert.deepEqual(Object.values(MAGE_ACTIVE_RULES).map((rule) => rule.ascension),
    ["極炎霜爆", "雷環共鳴", "星界屏障", "混沌刻印", "天火墜星", "魔能暴走", "萬象湮滅", "諸星終焉"]);
  assert.equal(MAGE_ACTIVE_RULES.霜火新星.afterburstDamage, 70);
  assert.equal(MAGE_ACTIVE_RULES.閃電鏈.missiles, 3);
  assert.equal(MAGE_ACTIVE_RULES.閃電鏈.resonanceMissileDamage, 80);
  assert.equal(MAGE_ACTIVE_RULES.魔力護盾.healthBelow, 60);
  assert.equal(MAGE_ACTIVE_RULES.魔力護盾.followingActiveCasts, 3);
  assert.equal(MAGE_ACTIVE_RULES.魔力護盾.activeDamageBonus, 10);
  assert.equal(MAGE_ACTIVE_RULES.魔力護盾.energyOnBreak, 15);
  assert.equal(MAGE_ACTIVE_RULES.元素蝕印.followingActiveCasts, 3);
  assert.equal(MAGE_ACTIVE_RULES.元素蝕印.nextStatusChancePoints, 15);
  assert.equal(MAGE_ACTIVE_RULES.隕星術.emberExplosionDamage, 120);
  assert.equal(MAGE_ACTIVE_RULES.虛空崩解.damagePerDistinctStatus * MAGE_ACTIVE_RULES.虛空崩解.maxDistinctStatuses, 54);
  assert.equal(MAGE_ACTIVE_RULES.星界寂滅.maxCollapseStacks, 6);
  assert.equal(MAGE_ACTIVE_RULES.星界寂滅.finalExplosionDamagePerStack * 6, 48);
  assert.equal(MAGE_PASSIVE_RULES.餘燼回響.procChance, 15);
  assert.equal(MAGE_PASSIVE_RULES.餘燼回響.maxProcsPerCast, undefined);
  assert.equal(MAGE_PASSIVE_RULES.元素共振.maxDistinctStatuses, 3);
  assert.equal(MAGE_PASSIVE_RULES.星界回爆.maxProcsPerUltimate, 1);
});

test("rank lookup and overload activation reject invalid ranks without silently clamping", () => {
  for (const rank of [0, -1, 6, 1.5, NaN, Infinity]) {
    assert.throws(() => mageSkillRankValue(MAGE_ACTIVE_RULES.霜火新星.damage, rank), RangeError);
    assert.throws(() => activateMageOverload(rank, true), RangeError);
  }
  assert.throws(() => mageSkillRankValue([1, 2], 1), RangeError);
  for (const rank of [-1, 6, 1.5, NaN, Infinity]) {
    assert.throws(() => mageExhaustionPenaltyPercent(createMageOverload(), rank), RangeError);
  }
});

test("queue charges overload once per successful complete cast and activation leaves three later casts", () => {
  assert.deepEqual(SKILL_CHARGE_RULES.法師.奧術超載, { event: "skillHit", threshold: 3 });
  assert.equal(MAGE_ACTIVE_RULES.奧術超載.successfulActiveCastsRequired, 3);
  let queue = createSkillCombatState({ ranks: { 奧術超載: 1 }, activeSlots: ["奧術超載", null, null] }, "法師", null);
  queue = recordPrimaryAttack(queue, { kind: "normal", hits: [{ hit: true }] });
  queue = recordPrimaryAttack(queue, { kind: "skill", hits: [{ hit: false }, { hit: false }] });
  assert.equal(queue.charges.奧術超載, 0);
  for (let i = 1; i <= 3; i++) {
    queue = recordPrimaryAttack(queue, i === 1 ? { kind: "skill", hits: [{ hit: false }, { hit: true }] } : missiles);
    assert.equal(queue.charges.奧術超載, i);
    assert.deepEqual(queue.ready, i < 3 ? [] : ["奧術超載"]);
  }
  const cast = consumeReadySkill(queue, true);
  assert.equal(cast.skill, "奧術超載");
  assert.equal(cast.state.charges.奧術超載, 0);
  const overload = activateMageOverload(1, false);
  assert.equal(overload.remainingSuccessfulCasts, 3);
  assert.equal(overload.stabilityStacks, 0);
});

test("three successful subsequent casts receive efficiency; exhaustion begins only after the third", () => {
  for (let rank = 1; rank <= 5; rank++) {
    let state = activateMageOverload(rank, false);
    const bonuses = [15, 18, 22, 26, 30];
    for (let i = 0; i < 3; i++) {
      const result = consumeMageOverload(state, missiles);
      assert.equal(result.skillEfficiencyBonusPercent, bonuses[rank - 1]);
      assert.equal(result.skillDamagePenaltyPercent, 0);
      if (i < 2) assert.equal(result.state.remainingSuccessfulCasts, 2 - i);
      state = result.state;
    }
    assert.deepEqual(state, { phase: "exhausted", expiresAt: 5000, basePenaltyPercent: 15 });
    const next = consumeMageOverload(state, hit);
    assert.equal(next.skillEfficiencyBonusPercent, 0);
    assert.equal(next.skillDamagePenaltyPercent, 15);
  }
});

test("misses and non-active damage never consume overload or produce implicit stability", () => {
  const state = Object.freeze(activateMageOverload(5, true));
  for (const hits of [[], [{ hit: false }], [{ hit: false }, { hit: false }, { hit: false }]]) {
    assert.equal(consumeMageOverload(state, { kind: "skill", hits }).state, state);
  }
  for (const kind of ["normal", "secondary", "proc", "dot", "counter", "ascension"]) {
    assert.deepEqual(consumeMageOverload(state, { kind, hits: [{ hit: true }] }),
      { state, skillEfficiencyBonusPercent: 0, skillDamagePenaltyPercent: 0 });
  }
  const partial = consumeMageOverload(state, { kind: "skill", hits: [{ hit: false }, { hit: true }, { hit: false }] });
  assert.equal(partial.state.remainingSuccessfulCasts, 2);
  assert.equal(partial.state.stabilityStacks, 0);
  assert.equal(state.remainingSuccessfulCasts, 3);
  assert.deepEqual(exhaust(state), { phase: "exhausted", expiresAt: 5000, basePenaltyPercent: 15 });
});

test("only explicit ascended stability events can reach the six-stack reduced-penalty threshold", () => {
  const initial = Object.freeze(activateMageOverload(1, true));
  assert.equal(exhaust(addMageOverloadStability(initial, 5)).basePenaltyPercent, 15);
  const stable = addMageOverloadStability(addMageOverloadStability(initial, 5), 100);
  assert.equal(stable.stabilityStacks, 6);
  assert.equal(initial.stabilityStacks, 0);
  assert.equal(exhaust(stable).basePenaltyPercent, 5);
  const basic = activateMageOverload(1, false);
  assert.equal(addMageOverloadStability(basic, 6), basic);
  assert.equal(exhaust(basic).basePenaltyPercent, 15);
  for (const state of [createMageOverload(), exhaust(initial)]) assert.equal(addMageOverloadStability(state, 6), state);
  for (const stacks of [-1, 0.5, NaN, Infinity]) assert.throws(() => addMageOverloadStability(initial, stacks), RangeError);
});

test("exhaustion control combines with ascension at every rank and cannot turn into extra damage", () => {
  const basic = exhaust(activateMageOverload(1, false));
  const stable = exhaust(addMageOverloadStability(activateMageOverload(1, true), 6));
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((rank) => mageExhaustionPenaltyPercent(basic, rank)), [15, 13.5, 12, 10.5, 9, 7.5]);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((rank) => mageExhaustionPenaltyPercent(stable, rank)), [5, 4.5, 4, 3.5, 3, 2.5]);
  assert.equal(consumeMageOverload(stable, hit, 5).skillDamagePenaltyPercent, 2.5);
  assert.equal(consumeMageOverload(basic, hit, 5).skillDamagePenaltyPercent, 7.5);
});

test("exhaustion persists until explicitly cleared and never penalizes non-active damage", () => {
  const state = Object.freeze(exhaust(activateMageOverload(1, false)));
  for (let i = 0; i < 20; i++) {
    const result = consumeMageOverload(state, i % 2 ? missiles : { kind: "skill", hits: [] });
    assert.equal(result.state, state);
    assert.equal(result.skillDamagePenaltyPercent, 15);
  }
  for (const kind of ["normal", "secondary", "proc", "dot", "counter", "ascension"]) {
    const result = consumeMageOverload(state, { kind, hits: [{ hit: true }] });
    assert.equal(result.state, state);
    assert.equal(result.skillDamagePenaltyPercent, 0);
  }
  const active = activateMageOverload(1, false);
  assert.equal(clearMageExhaustion(active), active);
  assert.deepEqual(clearMageExhaustion(state), createMageOverload());
  assert.equal(consumeMageOverload(clearMageExhaustion(state), hit).skillDamagePenaltyPercent, 0);
});
