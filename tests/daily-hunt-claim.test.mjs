import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.includes("/app/") && specifier.startsWith("./") && !specifier.endsWith(".ts"))
    return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });

const { applyDailyHuntClaim, claimedDailyHuntDate, preserveServerDailyHuntClaim, taipeiDailyDate } =
  await import("../app/daily-hunt-claim.ts");
const day = "2026-09-27";
const ready = () => ({
  dailyDate: day, dailyKills: 500, dailyRewardClaimed: false,
  gold: 100, enhanceStones: 1, reforgeStones: 2, yuanbao: 300, adminRevision: 3,
  battleOn: true, rebirthCount: 4,
});

test("daily claim grants exactly once and preserves unrelated game state", () => {
  const previous = ready();
  const first = applyDailyHuntClaim(previous, { dailyDate: day, dailyKills: 500 }, day);
  assert.equal(first.accepted, true);
  assert.deepEqual([first.save.gold, first.save.enhanceStones, first.save.reforgeStones, first.save.yuanbao],
    [5100, 11, 12, 320]);
  assert.equal(first.save.adminRevision, 4);
  assert.equal(first.save._lastDailyHuntClaimDate, day);
  assert.equal(first.save.dailyRewardClaimed, true);
  assert.equal(first.save.battleOn, true);
  assert.equal(first.save.rebirthCount, 4);
  assert.equal(previous.yuanbao, 300);
  const replay = applyDailyHuntClaim(JSON.parse(JSON.stringify(first.save)),
    { dailyDate: day, dailyKills: 999 }, day);
  assert.equal(replay.accepted, false);
  assert.deepEqual(replay.save, first.save);
});

test("a stale autosave cannot clear or forge a server daily claim", () => {
  const issued = applyDailyHuntClaim(ready(), { dailyDate: day, dailyKills: 500 }, day).save;
  const stale = { ...ready(), _lastDailyHuntClaimDate: "2026-09-28", dailyRewardClaimed: false };
  const preserved = preserveServerDailyHuntClaim(stale, issued);
  assert.equal(preserved._lastDailyHuntClaimDate, day);
  assert.equal(preserved.dailyRewardClaimed, true);
  assert.equal(applyDailyHuntClaim(preserved, { dailyDate: day, dailyKills: 501 }, day).accepted, false);
  assert.equal(preserveServerDailyHuntClaim({ ...ready(), _lastDailyHuntClaimDate: day }, null)
    ._lastDailyHuntClaimDate, null);
});

test("legacy claimed flag migrates to a server receipt without a duplicate reward", () => {
  const legacy = { ...ready(), dailyRewardClaimed: true };
  assert.equal(claimedDailyHuntDate(legacy), day);
  const saved = preserveServerDailyHuntClaim({ ...ready(), dailyRewardClaimed: false }, legacy);
  assert.equal(saved._lastDailyHuntClaimDate, day);
  assert.equal(saved.dailyRewardClaimed, true);
  assert.equal(applyDailyHuntClaim(saved, { dailyDate: day, dailyKills: 500 }, day).accepted, false);
});

test("Taipei midnight determines the new claim day", () => {
  assert.equal(taipeiDailyDate(new Date("2026-09-27T15:59:59Z")), day);
  assert.equal(taipeiDailyDate(new Date("2026-09-27T16:00:00Z")), "2026-09-28");
  const old = applyDailyHuntClaim(ready(), { dailyDate: day, dailyKills: 500 }, day).save;
  const rolled = preserveServerDailyHuntClaim({ ...old, dailyDate: "2026-09-28", dailyRewardClaimed: false }, old);
  assert.equal(rolled.dailyRewardClaimed, false);
  assert.equal(rolled._lastDailyHuntClaimDate, day);
  const newDay = applyDailyHuntClaim(rolled, { dailyDate: "2026-09-28", dailyKills: 500 }, "2026-09-28");
  assert.equal(newDay.accepted, true);
  assert.equal(newDay.save.yuanbao, 340);
});

test("daily claim rejects wrong day, insufficient kills and invalid resources", () => {
  assert.equal(applyDailyHuntClaim(ready(), { dailyDate: day, dailyKills: 499 }, day), null);
  assert.equal(applyDailyHuntClaim(ready(), { dailyDate: "2026-09-28", dailyKills: 500 }, day), null);
  assert.equal(applyDailyHuntClaim({ ...ready(), yuanbao: -1 }, { dailyDate: day, dailyKills: 500 }, day), null);
  assert.equal(applyDailyHuntClaim({ ...ready(), gold: Number.MAX_SAFE_INTEGER },
    { dailyDate: day, dailyKills: 500 }, day), null);
});

