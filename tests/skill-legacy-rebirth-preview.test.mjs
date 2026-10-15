import assert from "node:assert/strict";
import test from "node:test";
import { previewLegacyRebirth } from "../app/legacy-rebirth-preview.ts";

const capturedAt = "2026-09-27T01:00:00.000Z";
const record = (kind, rowId, accountId, playerId, count, time = "2026-09-26T12:00:00.000Z") => ({
  kind, rowId, accountId, playerId, capturedAt: time,
  payload: JSON.stringify({ playerName: "同名角色", rebirthCount: count, skillAscensions: { rebirthCount: 5 } }),
});

test("historical maximum follows a stable account even when a newer save has fewer rebirths", () => {
  const snapshot = record("snapshot", "42", "account-a", "player-a", 10);
  const input = {
    capturedAt, accountIds: ["account-b", "account-a"], rows: [
      snapshot, record("save", "player-a", "account-a", "player-a", 2),
      record("save", "player-b", "account-b", "player-b", 3),
    ],
  };
  const original = structuredClone(input);
  const preview = previewLegacyRebirth(input);
  assert.deepEqual(input, original);
  assert.deepEqual(preview.entries.map(row => [row.accountId, row.legacyRebirthCount, row.proposedTier]), [
    ["account-a", 10, 4], ["account-b", 3, 2],
  ]);
  assert.equal(preview.entries[0].evidence.length, 2);
  assert.equal(preview.canApply, false);
  assert.deepEqual(preview.rejected, []);
  assert.deepEqual(preview.missingAccountIds, []);
});

test("all four proposed thresholds use only old rebirthCount, never new ascensions", () => {
  const counts = [0, 1, 2, 3, 4, 5, 9, 10, 20];
  const preview = previewLegacyRebirth({ capturedAt, accountIds: counts.map(String),
    rows: counts.map(count => record("save", String(count), String(count), `player-${count}`, count)) });
  const tiers = new Map(preview.entries.map(row => [Number(row.accountId), row.proposedTier]));
  assert.deepEqual(counts.map(count => tiers.get(count)), [0, 1, 1, 2, 2, 3, 3, 4, 4]);
});

test("unknown ownership, corrupt counts and missing records are review items, never inferred awards", () => {
  const invalid = { ...record("snapshot", "bad", "account-a", "player-a", 8), payload: "{broken" };
  const preview = previewLegacyRebirth({ capturedAt, accountIds: ["account-a", "account-b"], rows: [
    invalid, record("save", "player-x", null, "player-x", 10),
    record("snapshot", "future", "account-a", "player-a", 20, "2026-09-28T12:00:00.000Z"),
    record("save", "player-a", "account-a", "player-a", 1),
  ] });
  assert.deepEqual(preview.rejected.map(row => row.reason), [
    "unverifiable_legacy_count", "unbound_or_unknown_account", "invalid_or_future_timestamp",
  ]);
  assert.equal(preview.entries[0].legacyRebirthCount, 1);
  assert.equal(preview.entries[0].needsReview, true);
  assert.deepEqual(preview.missingAccountIds, ["account-b"]);
});

test("a player bound to two accounts or conflicting duplicate rows blocks both accounts", () => {
  const preview = previewLegacyRebirth({ capturedAt, accountIds: ["a", "b"], rows: [
    record("save", "same-player", "a", "same-player", 1),
    record("snapshot", "2", "b", "same-player", 10),
    record("save", "same-player", "b", "other-player", 20),
  ] });
  assert.deepEqual(preview.rejected.map(row => row.reason), [
    "player_bound_to_multiple_accounts", "conflicting_duplicate_row",
  ]);
  assert.equal(preview.entries[0].needsReview, true);
  assert.equal(preview.missingAccountIds.includes("b"), true);
  assert.throws(() => previewLegacyRebirth({ capturedAt, accountIds: ["a", "a"], rows: [] }), RangeError);
});

test("replaying an identical snapshot is idempotent and prior migration fields require review", () => {
  const row = record("snapshot", "5", "a", "p", 5);
  const migrated = { ...record("save", "p", "a", "p", 0), payload: JSON.stringify({ rebirthCount: 0, legacyRebirthCount: 5 }) };
  const preview = previewLegacyRebirth({ capturedAt, accountIds: ["a"], rows: [row, row, migrated] });
  assert.equal(preview.entries[0].legacyRebirthCount, 5);
  assert.equal(preview.entries[0].evidence.length, 1);
  assert.equal(preview.entries[0].needsReview, true);
  assert.deepEqual(preview.rejected.map(item => item.reason), ["unverifiable_legacy_count"]);
});

test("SQLite UTC timestamps compare correctly with ISO cutoffs", () => {
  const preview = previewLegacyRebirth({ capturedAt, accountIds: ["a"], rows: [
    record("snapshot", "1", "a", "p", 3, "2026-09-26 11:59:59"),
    record("save", "p", "a", "p", 5, "2026-09-26T12:00:00.000Z"),
  ] });
  assert.deepEqual(preview.entries[0].evidence.map(row => row.rebirthCount), [3, 5]);
  assert.deepEqual(preview.rejected, []);
});

