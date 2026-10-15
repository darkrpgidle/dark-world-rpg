import { count, gt, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { chunkByBindingLimit, executeD1Batch } from "../../../d1-batch";
import { accountRebirthEntitlements, accounts, deathEvents, gameSaves, gmActionLogs, saveSnapshots, sessions } from "../../../../db/schema";
import { createGlobalCharacterResetPlanner, resetScopeFingerprintSource, type ResetAccount, type ResetEntitlement } from "../../../global-character-reset";
import { LEGACY_REBIRTH_RESET_VERSION } from "../../../legacy-rebirth-rewards";
import { currentAccount, sessionCookie } from "../../auth-utils";

const noStore = { "Cache-Control": "no-store, max-age=0" };
const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: noStore });
const respondAfterLogout = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { ...noStore, "Set-Cookie": sessionCookie("", 0) },
});
const confirmationPhrase = "重置所有角色資料";

function safeBatchDiagnostic(error: unknown) {
  if (!(error instanceof Error)) return "Unknown database error";
  const firstLine = error.message.split(/\r?\n/)[0] ?? "Database batch failed";
  const safe = firstLine
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "[id]")
    .replace(/\s+/g, " ").trim();
  return (safe || error.name || "Database batch failed").slice(0, 180);
}

async function readState(db: Awaited<ReturnType<typeof getDb>>) {
  const [accountRows, entitlementRows, [deaths], [sessionCount], [saveStats], [snapshotStats]] = await Promise.all([
    db.select({ id: accounts.id, isGm: accounts.isGm }).from(accounts),
    db.select({ accountId: accountRebirthEntitlements.accountId,
      legacyRebirthCount: accountRebirthEntitlements.legacyRebirthCount,
      tier: accountRebirthEntitlements.tier }).from(accountRebirthEntitlements),
    db.select({ value: count() }).from(deathEvents).where(sql`${deathEvents.accountId} IN (SELECT id FROM accounts WHERE is_gm = 0)`),
    db.select({ value: count() }).from(sessions),
    db.select({ count: count(), bytes: sql<number>`COALESCE(SUM(length(CAST(${gameSaves.payload} AS BLOB))), 0)`,
      latest: sql<string>`COALESCE(MAX(${gameSaves.updatedAt}), '')` }).from(gameSaves)
      .where(sql`${gameSaves.accountId} IN (SELECT id FROM accounts WHERE is_gm = 0)`),
    db.select({ count: count(), bytes: sql<number>`COALESCE(SUM(length(CAST(${saveSnapshots.payload} AS BLOB))), 0)`,
      maxId: sql<number>`COALESCE(MAX(${saveSnapshots.id}), 0)` }).from(saveSnapshots),
  ]);
  const planner = createGlobalCharacterResetPlanner(accountRows as ResetAccount[], entitlementRows as ResetEntitlement[]);
  // JSON is interpreted inside D1; full historical payloads never enter the Worker.
  function evidenceProjection(payload: typeof gameSaves.payload | typeof saveSnapshots.payload) {
    return sql<string>`CASE
      WHEN NOT json_valid(${payload}) THEN 'r:invalid_payload'
      WHEN json_type(${payload}) <> 'object' THEN 'r:invalid_payload'
      WHEN json_type(${payload}, '$.legacyRebirthCount') IS NOT NULL THEN
        CASE WHEN json_type(${payload}, '$.legacyRebirthCount') IN ('integer', 'real')
          AND json_extract(${payload}, '$.legacyRebirthCount') BETWEEN 0 AND 20
          AND json_extract(${payload}, '$.legacyRebirthCount') = CAST(json_extract(${payload}, '$.legacyRebirthCount') AS INTEGER)
          THEN 'n:' || CAST(json_extract(${payload}, '$.legacyRebirthCount') AS INTEGER)
          ELSE 'r:invalid_legacy_rebirth_count' END
      WHEN json_type(${payload}, '$.reservationOnly') = 'true'
        AND json_type(${payload}, '$.rebirthCount') IS NULL THEN 'n:0'
      WHEN json_type(${payload}, '$.rebirthCount') IN ('integer', 'real')
        AND json_extract(${payload}, '$.rebirthCount') BETWEEN 0 AND 20
        AND json_extract(${payload}, '$.rebirthCount') = CAST(json_extract(${payload}, '$.rebirthCount') AS INTEGER)
        THEN 'n:' || CAST(json_extract(${payload}, '$.rebirthCount') AS INTEGER)
      ELSE 'r:unverified_rebirth_count' END`;
  }
  function evidence(code: string) {
    return code.startsWith('n:') ? { count: Number(code.slice(2)) } : { reason: code.slice(2) };
  }
  const pageSize = 100;
  let lastPlayerId: string | undefined;
  while (true) {
    const rows = await db.select({ playerId: gameSaves.playerId, accountId: gameSaves.accountId,
      code: evidenceProjection(gameSaves.payload) }).from(gameSaves)
      .where(lastPlayerId === undefined ? undefined : gt(gameSaves.playerId, lastPlayerId))
      .orderBy(gameSaves.playerId).limit(pageSize);
    for (const row of rows) planner.addRow({ playerId: row.playerId, accountId: row.accountId, kind: 'save', evidence: evidence(row.code) });
    if (rows.length < pageSize) break;
    lastPlayerId = rows[rows.length - 1].playerId;
  }
  let lastSnapshotId = 0;
  while (lastSnapshotId < (snapshotStats?.maxId ?? 0)) {
    const rows = await db.select({ id: saveSnapshots.id, playerId: saveSnapshots.playerId,
      accountId: saveSnapshots.accountId, code: evidenceProjection(saveSnapshots.payload) }).from(saveSnapshots)
      .where(sql`${saveSnapshots.id} > ${lastSnapshotId} AND ${saveSnapshots.id} <= ${snapshotStats?.maxId ?? 0}`)
      .orderBy(saveSnapshots.id).limit(pageSize);
    for (const row of rows) planner.addRow({ playerId: row.playerId, accountId: row.accountId, kind: 'snapshot', evidence: evidence(row.code) });
    if (rows.length < pageSize) break;
    lastSnapshotId = rows[rows.length - 1].id;
  }
  const plan = planner.finish();
  const fingerprintSource = resetScopeFingerprintSource(accountRows as ResetAccount[], plan);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(fingerprintSource)));
  const fingerprint = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const summary = {
    ...plan.summary,
    playerAccountCount: plan.summary.accountCount,
    saveCount: saveStats?.count ?? 0,
    deathEventCount: deaths?.value ?? 0,
    sessionCount: sessionCount?.value ?? 0,
    snapshotCount: snapshotStats?.count ?? 0,
    protectedGmAccountCount: accountRows.filter((account) => account.isGm).length,
  };
  const issueCounts = Object.fromEntries([...new Set(plan.issues.map((issue) => issue.reason))]
    .sort().map((reason) => [reason, plan.issues.filter((issue) => issue.reason === reason).length]));
  return {
    plan, fingerprint, issueCounts, summary, saveBytes: saveStats?.bytes ?? 0,
    snapshotCount: snapshotStats?.count ?? 0,
    snapshotBytes: snapshotStats?.bytes ?? 0,
    maxSnapshotId: snapshotStats?.maxId ?? 0,
    latestPlayerSaveAt: saveStats?.latest ?? '',
  };
}

async function requireGm(request: Request) {
  const account = await currentAccount(request);
  if (!account) return { error: respond({ error: "not_authenticated" }, 401) } as const;
  if (!account.isGm) return { error: respond({ error: "forbidden" }, 403) } as const;
  return { account } as const;
}

export async function GET(request: Request) {
  const auth = await requireGm(request);
  if ("error" in auth) return auth.error;
  const db = await getDb();
  const state = await readState(db);
  return respond({
    ok: true,
    action: "preview",
    resetVersion: LEGACY_REBIRTH_RESET_VERSION,
    fingerprint: state.fingerprint,
    canExecute: state.plan.issues.length === 0,
    summary: state.summary,
    issueCounts: state.issueCounts,
    recovery: "正式存檔會先複製到 GM 快照；帳號與登入資料保留。",
  });
}

export async function POST(request: Request) {
  const auth = await requireGm(request);
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => null) as {
    action?: "preview" | "execute";
    fingerprint?: string;
    confirmation?: string;
  } | null;
  if (!body || (body.action !== "preview" && body.action !== "execute"))
    return respond({ error: "invalid_request" }, 400);

  const db = await getDb();
  const state = await readState(db);
  if (body.action === "preview") {
    return respond({
      ok: true,
      action: "preview",
      resetVersion: LEGACY_REBIRTH_RESET_VERSION,
      fingerprint: state.fingerprint,
      canExecute: state.plan.issues.length === 0,
      summary: state.summary,
      issueCounts: state.issueCounts,
      recovery: "正式存檔會先複製到 GM 快照；帳號與登入資料保留。",
    });
  }
  if (body.confirmation !== confirmationPhrase)
    return respond({ error: "confirmation_required" }, 400);
  if (state.plan.issues.length)
    return respond({ error: "history_review_required", summary: state.summary, issueCounts: state.issueCounts }, 409);
  if (!body.fingerprint || body.fingerprint !== state.fingerprint)
    return respond({ error: "preview_stale", message: "資料在預覽後有變動，請重新檢查影響範圍。" }, 409);

  const resetId = crypto.randomUUID();
  const kind = `pre_global_reset:${resetId}`;
  const now = new Date().toISOString();
  const accountCount = state.summary.playerAccountCount;
  const saveCount = state.summary.saveCount;
  const [maxSaveTime] = await db.select({ value: sql<string>`COALESCE(MAX(${gameSaves.updatedAt}), '')` })
    .from(gameSaves).where(sql`${gameSaves.accountId} IN (SELECT id FROM accounts WHERE is_gm = 0)`);
  const [maxDeathTime] = await db.select({ value: sql<string>`COALESCE(MAX(${deathEvents.occurredAt}), '')` })
    .from(deathEvents).where(sql`${deathEvents.accountId} IN (SELECT id FROM accounts WHERE is_gm = 0)`);
  const runGuard = db.run(sql`
    INSERT INTO global_reset_runs (id, gm_account_id, account_count, save_count, archive_count, entitlement_count, completed_at)
    SELECT ${resetId}, ${auth.account.id}, ${accountCount}, ${saveCount}, ${saveCount}, ${state.plan.entries.length}, ${now}
    WHERE (SELECT COUNT(*) FROM accounts WHERE is_gm = 0) = ${accountCount}
      AND (SELECT COUNT(*) FROM game_saves WHERE account_id IN (SELECT id FROM accounts WHERE is_gm = 0)) = ${saveCount}
      AND (SELECT COALESCE(MAX(updated_at), '') FROM game_saves WHERE account_id IN (SELECT id FROM accounts WHERE is_gm = 0)) = ${maxSaveTime?.value ?? ""}
      AND (SELECT COALESCE(SUM(length(CAST(payload AS BLOB))), 0) FROM game_saves WHERE account_id IN (SELECT id FROM accounts WHERE is_gm = 0)) = ${state.saveBytes}
      AND (SELECT COUNT(*) FROM sessions) = ${state.summary.sessionCount}
      AND (SELECT COUNT(*) FROM death_events WHERE account_id IN (SELECT id FROM accounts WHERE is_gm = 0)) = ${state.summary.deathEventCount}
      AND (SELECT COALESCE(MAX(occurred_at), '') FROM death_events WHERE account_id IN (SELECT id FROM accounts WHERE is_gm = 0)) = ${maxDeathTime?.value ?? ""}
      AND (SELECT COUNT(*) FROM save_snapshots) = ${state.snapshotCount}
      AND (SELECT COALESCE(MAX(id), 0) FROM save_snapshots) = ${state.maxSnapshotId}
      AND (SELECT COALESCE(SUM(length(CAST(payload AS BLOB))), 0) FROM save_snapshots) = ${state.snapshotBytes}
  `);
  const archive = db.run(sql`
    INSERT INTO save_snapshots (player_id, account_id, payload, kind, captured_at)
    SELECT game_saves.player_id, game_saves.account_id, game_saves.payload, ${kind}, game_saves.updated_at
    FROM game_saves INNER JOIN accounts ON accounts.id = game_saves.account_id
    WHERE accounts.is_gm = 0 AND EXISTS (SELECT 1 FROM global_reset_runs WHERE id = ${resetId})
  `);
  // A mismatch aborts the native D1 batch before any deletion. The duplicate
  // run ID intentionally violates the primary key within the same transaction.
  const verifyArchive = db.run(sql`
    INSERT INTO global_reset_runs (id, gm_account_id, account_count, save_count, archive_count, entitlement_count, completed_at)
    SELECT ${resetId}, ${auth.account.id}, ${accountCount}, ${saveCount}, ${saveCount}, ${state.plan.entries.length}, ${now}
    WHERE EXISTS (SELECT 1 FROM global_reset_runs WHERE id = ${resetId})
      AND (
        (SELECT COUNT(*) FROM save_snapshots WHERE kind = ${kind}) <> ${saveCount}
        OR (SELECT COUNT(*) FROM save_snapshots AS archived
          INNER JOIN game_saves AS original ON original.player_id = archived.player_id
          WHERE archived.kind = ${kind} AND archived.account_id = original.account_id
            AND archived.captured_at = original.updated_at AND archived.payload = original.payload) <> ${saveCount}
      )
  `);
  const entitlementWrites = chunkByBindingLimit(state.plan.entries, 5, 95).map((entries) => {
    const rows = entries.map((entry) => sql`(
      ${entry.accountId}, ${entry.legacyRebirthCount}, ${entry.tier}, ${LEGACY_REBIRTH_RESET_VERSION}, ${now}
    )`);
    return db.run(sql`
      INSERT INTO account_rebirth_entitlements (account_id, legacy_rebirth_count, tier, reset_version, created_at)
      SELECT column1, column2, column3, column4, column5 FROM (VALUES ${sql.join(rows, sql`, `)})
      WHERE EXISTS (SELECT 1 FROM global_reset_runs WHERE id = ${resetId})
      ON CONFLICT(account_id) DO UPDATE SET
        legacy_rebirth_count = MAX(account_rebirth_entitlements.legacy_rebirth_count, excluded.legacy_rebirth_count),
        tier = MAX(account_rebirth_entitlements.tier, excluded.tier),
        reset_version = excluded.reset_version
    `);
  });
  const entitlementOperations = entitlementWrites.length ? entitlementWrites : [db.run(sql`SELECT 1`)];
  const deleteSessions = db.run(sql`DELETE FROM sessions
    WHERE EXISTS (SELECT 1 FROM global_reset_runs WHERE id = ${resetId})`);
  const deleteDeaths = db.run(sql`DELETE FROM death_events
    WHERE account_id IN (SELECT id FROM accounts WHERE is_gm = 0)
      AND EXISTS (SELECT 1 FROM global_reset_runs WHERE id = ${resetId})`);
  const deleteSaves = db.run(sql`DELETE FROM game_saves
    WHERE account_id IN (SELECT id FROM accounts WHERE is_gm = 0)
      AND EXISTS (SELECT 1 FROM global_reset_runs WHERE id = ${resetId})`);
  const audit = db.run(sql`
    INSERT INTO gm_action_logs (gm_account_id, target_account_id, action, detail, created_at)
    SELECT ${auth.account.id}, NULL, 'global_reset_character_data',
      ${JSON.stringify({ resetId, ...state.summary, historyIssueCount: state.plan.issues.length })}, ${now}
    WHERE EXISTS (SELECT 1 FROM global_reset_runs WHERE id = ${resetId})
  `);

  let results: Awaited<ReturnType<typeof db.batch>>;
  try {
    results = await executeD1Batch(db.$client, [runGuard, archive, verifyArchive, ...entitlementOperations, deleteSessions, deleteDeaths, deleteSaves, audit]);
  } catch (error) {
    const diagnostic = safeBatchDiagnostic(error);
    try {
      await db.insert(gmActionLogs).values({ gmAccountId: auth.account.id, targetAccountId: null,
        action: "global_reset_failed", detail: JSON.stringify({ resetId, diagnostic }) });
    } catch { /* diagnostic logging cannot change the rolled-back reset */ }
    return respond({ error: "reset_transaction_failed", message: "重置交易失敗；資料未變更。", diagnostic, resetId }, 500);
  }
  const sessionResultIndex = 3 + entitlementOperations.length;
  const deathResultIndex = sessionResultIndex + 1;
  const saveResultIndex = deathResultIndex + 1;
  if ((results[0]?.meta?.changes ?? 0) !== 1)
    return respond({ error: "preview_stale", message: "資料在檢查後有變動，沒有執行重置。請重新預覽。" }, 409);
  if ((results[1]?.meta?.changes ?? 0) !== saveCount ||
      (results[sessionResultIndex]?.meta?.changes ?? 0) !== state.summary.sessionCount ||
      (results[deathResultIndex]?.meta?.changes ?? 0) !== state.summary.deathEventCount ||
      (results[saveResultIndex]?.meta?.changes ?? 0) !== saveCount)
    return respondAfterLogout({ error: "reset_postcondition_failed", resetId }, 500);

  return respondAfterLogout({
    ok: true,
    resetId,
    summary: state.summary,
    archivedAndVerified: saveCount,
    entitlementsStored: state.plan.entries.length,
    accountsPreserved: accountCount,
    gmAccountsPreserved: state.summary.protectedGmAccountCount,
    sessionsRevoked: state.summary.sessionCount,
    logoutRequired: true,
  });
}
