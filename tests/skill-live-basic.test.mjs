import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });

const { syncLiveBasicBattle, prepareLiveBasicAttack, finishLiveBasicAttack } = await import("../app/skill-live-basic.ts");
const { beginSkillBattleCutover, settleCutoverAction } = await import("../app/skill-combat-cutover.ts");
const { settleCombatHealth } = await import("../app/skill-health-settlement.ts");

for (const [characterClass, name, multiplier, defenseIgnore, burnChance] of [
  ["戰士", "裂地斬", 1.5, 15, 0],
  ["遊俠", "穿雲箭", 1.5, 20, 0],
  ["法師", "霜火新星", 1.55, 0, 20],
]) {
  test(`${characterClass} equipped basic skill charges on actions, lands once through tower and boss HP settlement`, () => {
    const build = { ranks: { [name]: 1 }, activeSlots: [name, null, null] };
    for (const encounter of ["tower", "personal-boss", "world-boss"]) {
      const owner = `${encounter}-${name}`;
      const battle = syncLiveBasicBattle(null, owner, build, characterClass);
      for (let action = 0; action < 4; action++) {
        assert.equal(prepareLiveBasicAttack(battle), null);
        finishLiveBasicAttack(battle, null, action !== 1);
      }
      assert.equal(syncLiveBasicBattle(battle, owner, build, characterClass), battle);
      const cast = prepareLiveBasicAttack(battle);
      assert.deepEqual(cast, { name, rank: 1, multiplier, defenseIgnore, burnChance });
      // Same action may never consume the same ready cast twice.
      assert.equal(prepareLiveBasicAttack(battle), null);
      const route = beginSkillBattleCutover({ battleId: owner, encounter, enableRework: false, reworkReady: false });
      const rawDamage = Math.round(100 * cast.multiplier);
      const damage = settleCutoverAction(route, { battleId: owner, sequence: 1, legacyDamage: rawDamage }).damage;
      assert.equal(settleCombatHealth(100, 1000, damage).remainingPercent, 100 - damage / 10);
      finishLiveBasicAttack(battle, cast, true);
      assert.equal(battle.queue.charges[name], 1);
    }
  });
}

test("an unequipped skill cannot cast, and a changed build or boss instance resets its charge", () => {
  const build = { ranks: { 裂地斬: 5 }, activeSlots: ["裂地斬", null, null] };
  const first = syncLiveBasicBattle(null, "tower-1", build, "戰士");
  finishLiveBasicAttack(first, null, false);
  assert.equal(first.queue.charges.裂地斬, 1);
  const next = syncLiveBasicBattle(first, "tower-2", build, "戰士");
  assert.equal(next.queue.charges.裂地斬, 0);
  const unequipped = syncLiveBasicBattle(next, "tower-2", { ...build, activeSlots: [null, null, null] }, "戰士");
  assert.equal(prepareLiveBasicAttack(unequipped), null);
  assert.deepEqual(unequipped.queue.charges, {});
  assert.equal(syncLiveBasicBattle(first, "tower-1", { ...build, ranks: { 裂地斬: 4 } }, "戰士").queue.charges.裂地斬, 0);
});
