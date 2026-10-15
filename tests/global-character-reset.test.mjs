import test from "node:test";
import { registerHooks } from "node:module";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
import assert from "node:assert/strict";

const { equippedLegacyRebirthReward, legacyRebirthReward } = await import("../app/legacy-rebirth-rewards.ts");
const { createGlobalCharacterResetPlanner, planGlobalCharacterReset, resetScopeFingerprintSource } = await import("../app/global-character-reset.ts");

test("paged reset planning retains the highest verified history without retaining payloads", () => {
  const planner = createGlobalCharacterResetPlanner(
    [{ id: "player", isGm: false }, { id: "gm", isGm: true }],
    [{ accountId: "player", legacyRebirthCount: 3, tier: 2 }],
  );
  for (let id = 1; id <= 1200; id++) {
    planner.addRow({ playerId: "hero", accountId: "player", kind: "snapshot", evidence: { count: id === 1199 ? 10 : 0 } });
  }
  planner.addRow({ playerId: "hero", accountId: "player", kind: "save", evidence: { count: 1 } });
  planner.addRow({ playerId: "gm-hero", accountId: "gm", kind: "save", evidence: { reason: "invalid_payload" } });
  const plan = planner.finish();
  assert.deepEqual(plan.entries, [{ accountId: "player", legacyRebirthCount: 10, tier: 4 }]);
  assert.equal(plan.summary.snapshotCount, 1200);
  assert.equal(plan.summary.saveCount, 1);
  assert.deepEqual(plan.issues, []);
});

test("legacy rebirth reward uses the agreed highest tier without stacking", () => {
  assert.deepEqual(legacyRebirthReward(1), {
    count: 1, tier: 1, titleId: "beta-reincarnator", title: "封測轉生者",
    unlockedTitleIds: ["beta-reincarnator"], experience: 10, gold: 10, attack: 5,
    defense: 5, attackSpeed: 0, resourceDrop: 0,
  });
  const ten = legacyRebirthReward(10);
  assert.equal(ten.title, "深淵輪迴者");
  assert.equal(ten.experience, 30);
  assert.equal(ten.attackSpeed, 12);
  assert.equal(ten.resourceDrop, 10);
  assert.deepEqual(ten.unlockedTitleIds, ["abyss-reincarnator"]);
  assert.equal(equippedLegacyRebirthReward(10, "none").attack, 0);
  assert.equal(equippedLegacyRebirthReward(10, "abyss-reincarnator").attack, 10);
  assert.equal(equippedLegacyRebirthReward(10, "beta-reincarnator").attack, 0);
});

test("reset preview uses the highest account-bound history and excludes GM game data", () => {
  const plan = planGlobalCharacterReset({
    accounts: [{ id: "player-1", isGm: false }, { id: "gm", isGm: true }, { id: "empty", isGm: false }],
    saves: [
      { playerId: "char-1", accountId: "player-1", payload: JSON.stringify({ rebirthCount: 3 }), updatedAt: "2026-01-01" },
      { playerId: "gm-char", accountId: "gm", payload: JSON.stringify({ rebirthCount: 20 }), updatedAt: "2026-01-01" },
    ],
    snapshots: [
      { id: 1, playerId: "char-1", accountId: "player-1", payload: JSON.stringify({ rebirthCount: 5 }), capturedAt: "2025-01-01" },
    ],
    entitlements: [],
  });
  assert.deepEqual(plan.entries, [{ accountId: "player-1", legacyRebirthCount: 5, tier: 3 }]);
  assert.equal(plan.summary.accountCount, 2);
  assert.equal(plan.summary.saveCount, 1);
  assert.equal(plan.summary.snapshotCount, 1);
  assert.equal(plan.summary.tier5Plus, 1);
  assert.deepEqual(plan.issues, []);
});

test("reset preview blocks unverifiable and unbound records instead of treating them as zero", () => {
  const plan = planGlobalCharacterReset({
    accounts: [{ id: "player-1", isGm: false }],
    saves: [
      { playerId: "bad", accountId: "player-1", payload: "{}", updatedAt: "2026-01-01" },
      { playerId: "orphan", accountId: null, payload: JSON.stringify({ rebirthCount: 10 }), updatedAt: "2026-01-01" },
    ],
    snapshots: [],
    entitlements: [],
  });
  assert.equal(plan.entries.length, 0);
  assert.deepEqual(plan.issues.map((issue) => issue.reason).sort(), ["unbound_or_unknown_account", "unverified_rebirth_count"]);
});

test("reservation-only characters count as zero and existing entitlement survives another reset", () => {
  const plan = planGlobalCharacterReset({
    accounts: [{ id: "player-1", isGm: false }],
    saves: [{ playerId: "char-1", accountId: "player-1", payload: JSON.stringify({ reservationOnly: true }), updatedAt: "2026-01-01" }],
    snapshots: [],
    entitlements: [{ accountId: "player-1", legacyRebirthCount: 10, tier: 4 }],
  });
  assert.deepEqual(plan.entries, [{ accountId: "player-1", legacyRebirthCount: 10, tier: 4 }]);
  assert.deepEqual(plan.issues, []);
});

test("reset confirmation stays valid across live save updates but changes with account awards", () => {
  const accounts = [{ id: "player-1", isGm: false }, { id: "gm", isGm: true }];
  const first = planGlobalCharacterReset({
    accounts,
    saves: [{ playerId: "char-1", accountId: "player-1", payload: JSON.stringify({ rebirthCount: 3, gold: 50 }), updatedAt: "2026-09-01" }],
    snapshots: [], entitlements: [],
  });
  const ordinarySaveUpdate = planGlobalCharacterReset({
    accounts,
    saves: [{ playerId: "char-1", accountId: "player-1", payload: JSON.stringify({ rebirthCount: 3, gold: 5000 }), updatedAt: "2026-09-28" }],
    snapshots: [], entitlements: [],
  });
  const changedRebirth = planGlobalCharacterReset({
    accounts,
    saves: [{ playerId: "char-1", accountId: "player-1", payload: JSON.stringify({ rebirthCount: 5, gold: 5000 }), updatedAt: "2026-09-28" }],
    snapshots: [], entitlements: [],
  });
  assert.equal(resetScopeFingerprintSource(accounts, first), resetScopeFingerprintSource(accounts, ordinarySaveUpdate));
  assert.notEqual(resetScopeFingerprintSource(accounts, first), resetScopeFingerprintSource(accounts, changedRebirth));
});
