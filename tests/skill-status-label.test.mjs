import assert from "node:assert/strict";
import test from "node:test";

import { combatStatusLabel } from "../app/skill-status-label.ts";

test("battle status labels translate every reworked enemy debuff", () => {
  assert.deepEqual(
    ["bleed", "burn", "armorBreak", "bloodBrand", "hunterMark", "elementSigil"].map(combatStatusLabel),
    ["流血", "灼燒", "破防", "血戰烙印", "獵殺標記", "元素蝕印"],
  );
});

test("existing Chinese battle labels remain unchanged", () => {
  assert.equal(combatStatusLabel("魔力護盾 -50%"), "魔力護盾 -50%");
  assert.equal(combatStatusLabel("完全格擋"), "完全格擋");
});
