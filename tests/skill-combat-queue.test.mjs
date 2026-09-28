import assert from "node:assert/strict";
import test from "node:test";
import { createSkillBuild, enabledUltimate, upgradeSkill, equipActiveSkill } from "../app/skill-rework.ts";
import {
  SKILL_CHARGE_RULES,
  consumeReadySkill,
  createSkillCombatState,
  nextReadySkill,
  recordPrimaryAttack,
  recordSuccessfulDodge,
  recoverPrimaryAttackCharges,
  transitionSkillCombat,
} from "../app/skill-combat-queue.ts";

const normalHit = { kind: "normal", hits: [{ hit: true }] };

function loadout(characterClass, names, ultimate) {
  let build = createSkillBuild();
  for (const name of [...names, ultimate].filter(Boolean)) build = upgradeSkill(build, characterClass, 100, name);
  names.forEach((name, slot) => { build = equipActiveSkill(build, characterClass, 100, slot, name); });
  return createSkillCombatState(build, characterClass, enabledUltimate(build, characterClass, 100));
}

test("charging queues in first-ready order, with slot order breaking the same-event tie", () => {
  let state = loadout("戰士", ["裂地斬", "血刃斬", "血戰烙印"], "泰坦斷界斬");
  for (let i = 0; i < 3; i++) state = recordPrimaryAttack(state, normalHit);
  assert.deepEqual(state.ready, ["血刃斬"]);
  state = recordPrimaryAttack(state, normalHit);
  assert.deepEqual(state.ready, ["血刃斬", "裂地斬"]);
  const cast = consumeReadySkill(state, true);
  assert.equal(cast.skill, "血刃斬");
  assert.equal(cast.state.charges["血刃斬"], 0);
  state = recordPrimaryAttack(cast.state, { kind: "skill", hits: [{ hit: true }, { hit: true, critical: true }] });
  assert.deepEqual(state.ready, ["裂地斬", "血戰烙印"]);
  assert.equal(state.charges["血刃斬"], 1);
  assert.equal(state.ultimateEnergy, 35); // 4 normal hits + one critical skill cast
  let tied = loadout("戰士", ["碎甲猛擊", "狂戰姿態"], null);
  for (let i = 0; i < 8; i++) tied = recordPrimaryAttack(tied, normalHit);
  assert.deepEqual(tied.ready, ["碎甲猛擊", "狂戰姿態"]);
  let reversed = loadout("戰士", ["狂戰姿態", "碎甲猛擊"], null);
  for (let i = 0; i < 8; i++) reversed = recordPrimaryAttack(reversed, normalHit);
  assert.deepEqual(reversed.ready, ["狂戰姿態", "碎甲猛擊"]);
});

test("wind domain counts successful primary casts once, including multi-hit skills", () => {
  let state = loadout("遊俠", ["風行領域"], null);
  state = recordPrimaryAttack(state, { kind: "skill", hits: [{ hit: false }, { hit: true }, { hit: true }] });
  assert.equal(state.charges["風行領域"], 1);
  state = recordPrimaryAttack(state, { kind: "skill", hits: [{ hit: false }, { hit: false }] });
  assert.equal(state.charges["風行領域"], 1);
  for (let i = 0; i < 7; i++) state = recordPrimaryAttack(state, normalHit);
  assert.deepEqual(state.ready, ["風行領域"]);
});

test("multiple damage segments never multiply charges, critical energy or skill-hit counters", () => {
  let state = loadout("法師", ["奧術飛彈", "奧術超載", "霜火新星"], "星界寂滅");
  const segments = [{ hit: true, critical: true }, { hit: true, critical: true }, { hit: false }];
  state = recordPrimaryAttack(state, { kind: "skill", hits: segments, appliedStatus: true });
  assert.deepEqual(state.charges, { 奧術飛彈: 1, 奧術超載: 1, 霜火新星: 1 });
  assert.equal(state.ultimateEnergy, 6);
  state = recordPrimaryAttack(state, { kind: "skill", hits: [{ hit: false }, { hit: false }] });
  assert.equal(state.charges["奧術超載"], 1);
  assert.equal(state.charges["奧術飛彈"], 2);
  assert.equal(SKILL_CHARGE_RULES.法師["奧術超載"].threshold, 6);
});

test("a blocked status skill preserves its original queue position across monsters", () => {
  let state = loadout("戰士", ["血戰烙印", "裂地斬"], null);
  for (let i = 0; i < 5; i++) state = recordPrimaryAttack(state, normalHit);
  assert.deepEqual(state.ready, ["裂地斬", "血戰烙印"]);
  const first = consumeReadySkill(state, true, new Set(["血戰烙印"]));
  assert.equal(first.skill, "裂地斬");
  assert.equal(nextReadySkill(first.state, true, new Set(["血戰烙印"])), null);
  assert.equal(nextReadySkill(first.state, false), null);
  const carried = transitionSkillCombat(first.state, "normal-kill");
  assert.equal(consumeReadySkill(carried, true)?.skill, "血戰烙印");
  assert.equal(first.state.ready[0], "血戰烙印");
});

test("ultimate caps at 100, joins queue and resets only on cast or battle boundary", () => {
  let state = loadout("遊俠", ["穿雲箭"], "蒼穹箭雨");
  for (let i = 0; i < 12; i++) state = recordPrimaryAttack(state, normalHit);
  state = recordSuccessfulDodge(state);
  state = recordPrimaryAttack(state, { kind: "normal", hits: [{ hit: true, critical: true }] });
  assert.equal(state.ultimateEnergy, 100);
  assert.deepEqual(state.ready, ["穿雲箭", "蒼穹箭雨"]);
  const first = consumeReadySkill(state, true);
  assert.equal(first.skill, "穿雲箭");
  assert.equal(first.state.ultimateEnergy, 100);
  const ultimate = consumeReadySkill(first.state, true);
  assert.equal(ultimate.skill, "蒼穹箭雨");
  assert.equal(ultimate.state.ultimateEnergy, 0);
  for (const boundary of ["death", "map-change", "boss-start", "pvp-start"]) {
    const cleared = transitionSkillCombat(state, boundary);
    assert.equal(cleared.ultimateEnergy, 0);
    assert.deepEqual(cleared.ready, []);
    assert.equal(cleared.charges["穿雲箭"], 0);
  }
});

test("ascension charge recovery only affects attack-count skills and preserves earlier ready order", () => {
  const state = loadout("遊俠", ["破星狙擊", "穿雲箭", "風行領域"], "蒼穹箭雨");
  state.charges["破星狙擊"] = 7;
  state.charges["穿雲箭"] = 2;
  state.charges["風行領域"] = 7;
  state.ready = ["蒼穹箭雨"];
  state.ultimateEnergy = 100;
  const recovered = recoverPrimaryAttackCharges(state, 2);
  assert.deepEqual(recovered.ready, ["蒼穹箭雨", "破星狙擊", "穿雲箭"]);
  assert.deepEqual(recovered.charges, { 破星狙擊: 9, 穿雲箭: 4, 風行領域: 7 });
  assert.equal(recovered.ultimateEnergy, 100);
  assert.deepEqual(state.ready, ["蒼穹箭雨"]);
  assert.throws(() => recoverPrimaryAttackCharges(state, -1), RangeError);
});
