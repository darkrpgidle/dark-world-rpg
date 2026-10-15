import { legacyRebirthTier } from "./legacy-rebirth-rewards";

export type ResetAccount = { id: string; isGm: boolean };
export type ResetSave = { playerId: string; accountId: string | null; payload: string; updatedAt: string };
export type ResetSnapshot = { id: number; playerId: string; accountId: string; payload: string; capturedAt: string };
export type ResetEntitlement = { accountId: string; legacyRebirthCount: number; tier: number };

export type GlobalCharacterResetPlan = {
  entries: { accountId: string; legacyRebirthCount: number; tier: number }[];
  issues: { reason: string }[];
  summary: {
    accountCount: number;
    accountCountWithSaves: number;
    saveCount: number;
    snapshotCount: number;
    tier1Plus: number;
    tier3Plus: number;
    tier5Plus: number;
    tier10Plus: number;
    unverifiedRows: number;
  };
};

/**
 * This fingerprint protects the confirmed scope (the account set and legacy
 * award plan), not live gameplay payloads that can change during normal play.
 */
export function resetScopeFingerprintSource(
  accounts: readonly ResetAccount[],
  plan: GlobalCharacterResetPlan,
) {
  const issueCounts = Object.fromEntries([...new Set(plan.issues.map((issue) => issue.reason))]
    .sort().map((reason) => [reason, plan.issues.filter((issue) => issue.reason === reason).length]));
  return JSON.stringify({
    accountIds: accounts.filter((account) => !account.isGm).map((account) => account.id).sort(),
    entries: plan.entries,
    issueCounts,
  });
}

function validCount(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 20;
}

type LegacyCountEvidence = { count: number } | { reason: string };

function readLegacyCount(payloadText: string): LegacyCountEvidence {
  let parsed: unknown;
  try { parsed = JSON.parse(payloadText); } catch { return { reason: "invalid_payload" }; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { reason: "invalid_payload" };
  const payload = parsed as Record<string, unknown>;
  if (Object.hasOwn(payload, "legacyRebirthCount")) {
    return validCount(payload.legacyRebirthCount)
      ? { count: payload.legacyRebirthCount }
      : { reason: "invalid_legacy_rebirth_count" };
  }
  if (payload.reservationOnly === true && !Object.hasOwn(payload, "rebirthCount")) return { count: 0 };
  return validCount(payload.rebirthCount)
    ? { count: payload.rebirthCount }
    : { reason: "unverified_rebirth_count" };
}

export function createGlobalCharacterResetPlanner(
  accountRows: readonly ResetAccount[],
  entitlements: readonly ResetEntitlement[],
) {
  const accounts = new Map(accountRows.map((account) => [account.id, account]));
  const players = new Map([...accounts].filter(([, account]) => !account.isGm).map(([id]) => [id, 0]));
  const maxCount = new Map<string, number>();
  const saveAccounts = new Set<string>();
  const issues: { reason: string }[] = [];
  const playerOwners = new Map<string, string>();
  let saveCount = 0;
  let snapshotCount = 0;

  for (const entitlement of entitlements) {
    if (!players.has(entitlement.accountId)) continue;
    if (!validCount(entitlement.legacyRebirthCount)) {
      issues.push({ reason: "invalid_existing_entitlement" });
      continue;
    }
    maxCount.set(entitlement.accountId, Math.max(maxCount.get(entitlement.accountId) ?? 0, entitlement.legacyRebirthCount));
  }

  function addRow(row: {
    playerId: string;
    accountId: string | null;
    kind: "save" | "snapshot";
    evidence: LegacyCountEvidence;
  }) {
    if (!row.accountId || !accounts.has(row.accountId)) {
      issues.push({ reason: "unbound_or_unknown_account" });
      return;
    }
    if (players.has(row.accountId)) {
      if (row.kind === "save") saveCount++;
      else snapshotCount++;
    }
    const priorOwner = playerOwners.get(row.playerId);
    if (priorOwner && priorOwner !== row.accountId) {
      issues.push({ reason: "player_bound_to_multiple_accounts" });
      return;
    }
    playerOwners.set(row.playerId, row.accountId);
    if (!players.has(row.accountId)) return;
    if (row.kind === "save") saveAccounts.add(row.accountId);
    if ("reason" in row.evidence) {
      issues.push({ reason: row.evidence.reason });
      return;
    }
    maxCount.set(row.accountId, Math.max(maxCount.get(row.accountId) ?? 0, row.evidence.count));
  }

  function finish(): GlobalCharacterResetPlan {
    const entries = [...maxCount]
      .filter(([, count]) => count > 0)
      .map(([accountId, count]) => ({ accountId, legacyRebirthCount: count, tier: legacyRebirthTier(count) }))
      .sort((a, b) => a.accountId.localeCompare(b.accountId));
    const tierCounts = [...maxCount.values()];
    return {
      entries,
      issues,
      summary: {
        accountCount: players.size,
        accountCountWithSaves: saveAccounts.size,
        saveCount,
        snapshotCount,
        tier1Plus: tierCounts.filter((count) => count >= 1).length,
        tier3Plus: tierCounts.filter((count) => count >= 3).length,
        tier5Plus: tierCounts.filter((count) => count >= 5).length,
        tier10Plus: tierCounts.filter((count) => count >= 10).length,
        unverifiedRows: issues.length,
      },
    };
  }
  return { addRow, finish };
}

export function planGlobalCharacterReset(input: {
  accounts: readonly ResetAccount[];
  saves: readonly ResetSave[];
  snapshots: readonly ResetSnapshot[];
  entitlements: readonly ResetEntitlement[];
}): GlobalCharacterResetPlan {
  const planner = createGlobalCharacterResetPlanner(input.accounts, input.entitlements);
  for (const row of input.saves) {
    planner.addRow({ playerId: row.playerId, accountId: row.accountId, kind: "save", evidence: readLegacyCount(row.payload) });
  }
  for (const row of input.snapshots) {
    planner.addRow({ playerId: row.playerId, accountId: row.accountId, kind: "snapshot", evidence: readLegacyCount(row.payload) });
  }
  return planner.finish();
}
