import assert from "node:assert/strict";
import test from "node:test";

const { clampRebirthCount, MAX_REBIRTHS, REBIRTH_REWARD_PER_TURN } = await import("../app/rebirth-config.ts");

test("rebirth progression caps at five and clamps invalid saved counts", () => {
  assert.equal(MAX_REBIRTHS, 5);
  assert.equal(clampRebirthCount(0), 0);
  assert.equal(clampRebirthCount(5), 5);
  assert.equal(clampRebirthCount(20), 5);
  assert.equal(clampRebirthCount(-2), 0);
  assert.equal(clampRebirthCount("bad"), 0);
});

test("each rebirth grants the agreed permanent bonus values", () => {
  assert.deepEqual(REBIRTH_REWARD_PER_TURN, {
    talentPoints: 3,
    coreStats: 5,
    experience: 10,
    gold: 15,
    resourceDrop: 10,
    equipmentDrop: 5,
    highQualityDrop: 3,
  });
});
