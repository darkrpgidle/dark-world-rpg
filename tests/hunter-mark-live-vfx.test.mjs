import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith("./") && !specifier.endsWith(".ts") ? `${specifier}.ts` : specifier, context);
} });
const { syncLiveCombat, resolveLiveCombatAttack } = await import("../app/skill-live-combat.ts");
const { createSkillAscensions } = await import("../app/skill-ascensions.ts");
function setup(ascended = true) {
  const b = syncLiveCombat(null, {}, "enemy", { ranks: { 獵殺標記: 1, 穿雲箭: 1, 追風箭: 1 },
    activeSlots: ["獵殺標記", "穿雲箭", "追風箭"] }, "遊俠", 100, createSkillAscensions());
  b.ascended = new Set(ascended ? ["獵殺標記", "追風箭"] : []); return b;
}
function cast(b, skill = null, { crit = 0, hit = 100, now = 1000, rolls = [], items = [] } = {}) {
  b.combat.session.charge.ready = skill ? [skill] : [];
  if (skill) b.combat.session.charge.charges[skill] = 20;
  return resolveLiveCombatAttack(b, { now, healthPercent: 100, attack: 100,
    hitChance: hit, criticalChance: crit, criticalDamage: 50,
    equippedItems: items, roll: () => rolls.shift() ?? .5 });
}
function charged(b) { cast(b, "獵殺標記"); for (let i = 0; i < 3; i++) cast(b, null, { crit: 100 }); }
test("successful mark exposes the actual rank duration and starts at zero glyphs", () => {
  const a = cast(setup(), "獵殺標記");
  assert.equal(a.hunterMark.expiresAt, 8000); assert.equal(a.hunterMark.activated, true);
  assert.equal(a.hunterMark.criticals, 0); assert.equal(a.hunterExplosion, null);
});
test("three confirmed critical hits fill glyphs without immediate explosion", () => {
  const b = setup(); cast(b, "獵殺標記");
  for (let i = 1; i <= 3; i++) {
    const a = cast(b, null, { crit: 100 });
    assert.equal(a.hunterMark.criticals, i); assert.equal(a.hunterMark.pending, i === 3);
    assert.equal(a.hunterExplosion, null);
  }
  assert.equal(cast(b, null).hunterExplosion, null);
});
test("next successful active skill reports separate independently rolled explosion", () => {
  const b = setup(); charged(b); const a = cast(b, "穿雲箭");
  assert.deepEqual(a.hunterExplosion, { hit: true, critical: false, damagePercent: 120 });
  assert.equal(a.damagePercent, 285); assert.equal(a.hunterMark.pending, false);
  assert.equal(cast(b, "穿雲箭").hunterExplosion, null);
});
test("missed explosion keeps primary damage and reports no fabricated hit", () => {
  const b = setup(); charged(b);
  const a = cast(b, "穿雲箭", { hit: 50, rolls: [0, .99, .99] });
  assert.deepEqual(a.hunterExplosion, { hit: false, critical: false, damagePercent: 0 });
  assert.equal(a.damagePercent, 165);
});
test("tailwind echo and hunter explosion retain their own percentages in one cast", () => {
  const b = setup(); charged(b); const a = cast(b, "追風箭", { crit: 100 });
  assert.equal(a.tailwindEcho.damagePercent, 90); assert.equal(a.hunterExplosion.damagePercent, 180);
  assert.equal(a.damagePercent, 487.5);
  assert.equal(a.damagePercent - a.tailwindEcho.damagePercent - a.hunterExplosion.damagePercent, 217.5);
});
test("equipment multiplier is included in actual explosion metadata", () => {
  const b = setup(); charged(b);
  const a = cast(b, "穿雲箭", { items: [{ mythicId: "skill-ranger-queen-contract" }] });
  assert.equal(a.hunterExplosion.damagePercent, 180); assert.equal(a.damagePercent, 345);
});
test("non-ascended mark does not accumulate death lock glyphs", () => {
  const b = setup(false); charged(b); const a = cast(b, "穿雲箭", { crit: 100 });
  assert.equal(a.hunterMark.ascended, false); assert.equal(a.hunterMark.criticals, 0);
  assert.equal(a.hunterExplosion, null);
});
test("expired ordinary mark and changed target expose no stale mark", () => {
  const b = setup(); cast(b, "獵殺標記");
  assert.equal(cast(b, null, { now: 8001 }).hunterMark, null);
  cast(b, "獵殺標記", { now: 9000 });
  const next = syncLiveCombat(b, b.owner, "other-enemy", b.combat.build, "遊俠", 100, createSkillAscensions());
  assert.equal(cast(next, null, { now: 9001 }).hunterMark, null);
});
test("failed mark cast creates no sigil", () => {
  const a = cast(setup(), "獵殺標記", { hit: 0 });
  assert.equal(a.hunterMark, null); assert.equal(a.hunterExplosion, null);
});

test("each confirmed critical segment of a volley contributes to death lock readiness", () => {
  const b = syncLiveCombat(null, {}, "enemy", { ranks: { 獵殺標記: 1, 疾風連射: 1, 穿雲箭: 1 },
    activeSlots: ["獵殺標記", "疾風連射", "穿雲箭"] }, "遊俠", 100, createSkillAscensions());
  b.ascended = new Set(["獵殺標記"]);
  cast(b, "獵殺標記");
  const a = cast(b, "疾風連射", { crit: 100 });
  assert.equal(a.hits.filter((hit) => hit.hit && hit.critical).length, 5);
  assert.equal(a.hunterMark.criticals, 3); assert.equal(a.hunterMark.pending, true);
  assert.equal(a.hunterExplosion, null);
  assert.equal(cast(b, "穿雲箭").hunterExplosion.damagePercent, 120);
});
