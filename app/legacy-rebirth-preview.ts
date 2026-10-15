// Read-only stage 34 preview. Account IDs must come from accounts.id, while
// history rows come from game_saves and save_snapshots before any reset.
export type LegacyRebirthSource = {
  kind: "save" | "snapshot";
  rowId: string;
  accountId: string | null;
  playerId: string;
  capturedAt: string;
  payload: string;
};

export type LegacyRebirthEvidence = {
  kind: LegacyRebirthSource["kind"];
  rowId: string;
  playerId: string;
  capturedAt: string;
  rebirthCount: number;
};

function timestamp(value: string): number {
  if (typeof value !== "string") return Number.NaN;
  // SQLite CURRENT_TIMESTAMP stores UTC without a timezone suffix.
  const utc = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z` : value;
  return Date.parse(utc);
}

export function previewLegacyRebirth(input: {
  capturedAt: string;
  accountIds: readonly string[];
  rows: readonly LegacyRebirthSource[];
}) {
  const cutoff = timestamp(input.capturedAt);
  if (!Number.isFinite(cutoff) || !input.capturedAt || !Array.isArray(input.accountIds) || !Array.isArray(input.rows)) {
    throw new RangeError("Invalid preview input");
  }
  const known = new Set(input.accountIds);
  if (known.size !== input.accountIds.length || [...known].some(id => typeof id !== "string" || !id.trim())) {
    throw new RangeError("Account IDs must be unique and nonempty");
  }
  const grouped = new Map<string, LegacyRebirthEvidence[]>();
  const rejected: { kind: LegacyRebirthSource["kind"] | "unknown"; rowId: string; reason: string }[] = [];
  const seenRows = new Map<string, { signature: string; accountId: string }>();
  const playerAccounts = new Map<string, string>();
  const conflictedAccounts = new Set<string>();

  for (const row of input.rows) {
    if (!row || (row.kind !== "save" && row.kind !== "snapshot") ||
        typeof row.rowId !== "string" || !row.rowId.trim() ||
        typeof row.playerId !== "string" || !row.playerId.trim()) {
      rejected.push({ kind: row?.kind === "save" || row?.kind === "snapshot" ? row.kind : "unknown",
        rowId: typeof row?.rowId === "string" ? row.rowId : "", reason: "invalid_row_identity" });
      continue;
    }
    if (!row.accountId || !known.has(row.accountId)) {
      rejected.push({ kind: row.kind, rowId: row.rowId, reason: "unbound_or_unknown_account" });
      continue;
    }
    const rowKey = `${row.kind}:${row.rowId}`;
    const signature = JSON.stringify([row.accountId, row.playerId, row.capturedAt, row.payload]);
    const previousRow = seenRows.get(rowKey);
    if (previousRow) {
      if (previousRow.signature !== signature) {
        rejected.push({ kind: row.kind, rowId: row.rowId, reason: "conflicting_duplicate_row" });
        conflictedAccounts.add(row.accountId);
        conflictedAccounts.add(previousRow.accountId);
      }
      continue;
    }
    seenRows.set(rowKey, { signature, accountId: row.accountId });
    const previousAccount = playerAccounts.get(row.playerId);
    if (previousAccount && previousAccount !== row.accountId) {
      conflictedAccounts.add(previousAccount);
      conflictedAccounts.add(row.accountId);
      rejected.push({ kind: row.kind, rowId: row.rowId, reason: "player_bound_to_multiple_accounts" });
      continue;
    }
    playerAccounts.set(row.playerId, row.accountId);
    const recordedAt = timestamp(row.capturedAt);
    if (!Number.isFinite(recordedAt) || recordedAt > cutoff) {
      rejected.push({ kind: row.kind, rowId: row.rowId, reason: "invalid_or_future_timestamp" });
      conflictedAccounts.add(row.accountId);
      continue;
    }
    let payload: unknown;
    try { payload = JSON.parse(row.payload); } catch { /* reported below */ }
    if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
        !Number.isInteger((payload as Record<string, unknown>).rebirthCount) ||
        (payload as { rebirthCount: number }).rebirthCount < 0 ||
        (payload as { rebirthCount: number }).rebirthCount > 20 ||
        "legacyRebirthCount" in payload) {
      rejected.push({ kind: row.kind, rowId: row.rowId, reason: "unverifiable_legacy_count" });
      conflictedAccounts.add(row.accountId);
      continue;
    }
    const evidence = grouped.get(row.accountId) ?? [];
    evidence.push({ kind: row.kind, rowId: row.rowId, playerId: row.playerId,
      capturedAt: row.capturedAt, rebirthCount: (payload as { rebirthCount: number }).rebirthCount });
    grouped.set(row.accountId, evidence);
  }

  const entries = [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([accountId, evidence]) => {
    evidence.sort((a, b) => timestamp(a.capturedAt) - timestamp(b.capturedAt) || a.rowId.localeCompare(b.rowId));
    const legacyRebirthCount = Math.max(...evidence.map(row => row.rebirthCount));
    const proposedTier = legacyRebirthCount >= 10 ? 4 : legacyRebirthCount >= 5 ? 3
      : legacyRebirthCount >= 3 ? 2 : legacyRebirthCount >= 1 ? 1 : 0;
    return { accountId, legacyRebirthCount, proposedTier, evidence, needsReview: conflictedAccounts.has(accountId) };
  });
  const missingAccountIds = [...known].filter(id => !grouped.has(id)).sort();
  return {
    capturedAt: input.capturedAt,
    entries,
    rejected,
    missingAccountIds,
    // Title names, all four Buff values and production backups are not final.
    canApply: false as const,
  };
}

