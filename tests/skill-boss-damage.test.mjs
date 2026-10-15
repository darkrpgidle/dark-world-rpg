import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });

const { createBossDamageLedger, settleBossDamageEvent } =
  await import("../app/skill-boss-damage.ts");

for (const encounter of ["personal-boss", "world-boss"]) {
  test(`${encounter} credits only actual damage and grants victory once across direct, burn and counter events`, () => {
    let ledger = createBossDamageLedger(100);
    let credited = 0;
    let victories = 0;
    for (const rawDamage of [70, 25, 20, 300]) {
      const event = settleBossDamageEvent(ledger, rawDamage);
      ledger = event.ledger;
      credited += event.actualDamage;
      victories += Number(event.newVictory);
    }
    assert.equal(credited, 100);
    assert.equal(victories, 1);
    assert.equal(ledger.remainingPercent, 0);
    assert.equal(settleBossDamageEvent(ledger, 200).actualDamage, 0);
  });
}

test("sequential boss hits preserve remaining HP even before a UI render", () => {
  let ledger = createBossDamageLedger(1000);
  const first = settleBossDamageEvent(ledger, 400);
  ledger = first.ledger;
  const burn = settleBossDamageEvent(ledger, 400);
  ledger = burn.ledger;
  const counter = settleBossDamageEvent(ledger, 400);
  assert.equal(first.actualDamage, 400);
  assert.equal(burn.actualDamage, 400);
  assert.equal(counter.actualDamage, 200);
  assert.equal(counter.newVictory, true);
  assert.equal(settleBossDamageEvent(counter.ledger, 10).newVictory, false);
});

