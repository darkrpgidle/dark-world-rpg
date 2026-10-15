import assert from "node:assert/strict";
import test from "node:test";

const { prepareIdleClaim, preserveServerIdleClaim, settleIdleSave } = await import("../app/idle-claim.ts");
const claimId = "a7420c19-d735-41ca-933c-4f06df77ad52";

test("a retried offline claim returns the same seconds without consuming them twice", () => {
  const original = { storedSeconds: 3600, gold: 200 };
  const first = prepareIdleClaim(original, claimId, 1000, "login-1");
  assert.equal(first.accepted, true);
  assert.equal(first.claimedSeconds, 3600);
  assert.equal(first.save.storedSeconds, 0);
  assert.equal(first.save.battleOn, true);
  assert.equal(original.storedSeconds, 3600);
  const retry = prepareIdleClaim(first.save, claimId, 2000, "login-1");
  assert.equal(retry.accepted, false);
  assert.equal(retry.claimedSeconds, 3600);
  assert.equal(retry.save, first.save);
  const nextClaim = prepareIdleClaim(first.save, "another-id", 1000, "login-1");
  assert.equal(nextClaim.claimedSeconds, 0);
});

test("an autosave started before claiming cannot put claimed time back", () => {
  const server = prepareIdleClaim({ storedSeconds: 7200 }, claimId, 1000, "login-1").save;
  const stale = preserveServerIdleClaim({ storedSeconds: 7200, _lastIdleClaimId: "forged" }, server);
  assert.equal(stale.storedSeconds, 0);
  assert.equal(stale._lastIdleClaimId, claimId);
  assert.equal(stale._lastIdleClaimSeconds, 7200);
  const acknowledged = preserveServerIdleClaim({ storedSeconds: 90, _lastIdleClaimId: claimId }, server);
  assert.equal(acknowledged.storedSeconds, 90);
  const firstSave = preserveServerIdleClaim({ storedSeconds: 30, _lastIdleClaimId: claimId }, null);
  assert.equal(firstSave._lastIdleClaimId, undefined);
});

test("an old paused save still accrues offline time after the pause button was removed", () => {
  const settled = settleIdleSave({ storedSeconds: 300, lastSeenAt: 1000, battleOn: false }, 3_601_000, "login-2");
  assert.equal(settled.elapsedSeconds, 3600);
  assert.equal(settled.save.storedSeconds, 3900);
  assert.equal(settled.save.battleOn, true);
  assert.equal(settleIdleSave(settled.save, 3_601_000, "login-2").elapsedSeconds, 0);
});
