import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { getDb } from "../../../../db";
import { accounts, gameSaves, saveSnapshots } from "../../../../db/schema";
import { previewLegacyRebirth, type LegacyRebirthSource } from "../../../legacy-rebirth-preview";
import { currentAccount } from "../../auth-utils";

const MAX_SNAPSHOTS = 100;
const noStore = { "Cache-Control": "no-store, max-age=0" };
const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: noStore });

// Historical counts are a review aid only; this endpoint never writes or awards anything.
export async function GET(request: Request) {
  const gm = await currentAccount(request);
  if (!gm) return respond({ error: "not_authenticated" }, 401);
  if (!gm.isGm) return respond({ error: "forbidden" }, 403);

  const accountId = new URL(request.url).searchParams.get("accountId")?.trim() ?? "";
  if (!accountId || accountId.length > 128) return respond({ error: "invalid_account_id" }, 400);
  const db = await getDb();
  const [account] = await db.select({ id: accounts.id, username: accounts.username, isGm: accounts.isGm })
    .from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (!account) return respond({ error: "account_not_found" }, 404);
  if (account.isGm) return respond({ error: "protected_account" }, 403);

  // Refuse an incomplete history instead of silently awarding a lower tier.
  const [saves, snapshotIds] = await Promise.all([
    db.select({ playerId: gameSaves.playerId, accountId: gameSaves.accountId,
      payload: gameSaves.payload, updatedAt: gameSaves.updatedAt })
      .from(gameSaves).where(eq(gameSaves.accountId, accountId)).limit(2),
    db.select({ id: saveSnapshots.id }).from(saveSnapshots)
      .where(eq(saveSnapshots.accountId, accountId)).limit(MAX_SNAPSHOTS + 1),
  ]);
  if (saves.length > 1) return respond({ error: "multiple_account_saves", canApply: false }, 409);
  if (snapshotIds.length > MAX_SNAPSHOTS)
    return respond({ error: "snapshot_limit_exceeded", limit: MAX_SNAPSHOTS, canApply: false }, 409);

  const snapshots = snapshotIds.length ? await db.select({ id: saveSnapshots.id,
    playerId: saveSnapshots.playerId, accountId: saveSnapshots.accountId,
    payload: saveSnapshots.payload, capturedAt: saveSnapshots.capturedAt })
    .from(saveSnapshots).where(inArray(saveSnapshots.id, snapshotIds.map(row => row.id))) : [];
  if (snapshots.length !== snapshotIds.length)
    return respond({ error: "history_changed_retry", canApply: false }, 409);
  const playerIds = [...new Set([...saves.map(row => row.playerId), ...snapshots.map(row => row.playerId)])];
  if (playerIds.length) {
    const [foreignSave, foreignSnapshot] = await Promise.all([
      db.select({ playerId: gameSaves.playerId }).from(gameSaves)
        .where(and(inArray(gameSaves.playerId, playerIds),
          or(isNull(gameSaves.accountId), ne(gameSaves.accountId, accountId)))).limit(1),
      db.select({ playerId: saveSnapshots.playerId }).from(saveSnapshots)
        .where(and(inArray(saveSnapshots.playerId, playerIds), ne(saveSnapshots.accountId, accountId))).limit(1),
    ]);
    if (foreignSave.length || foreignSnapshot.length)
      return respond({ error: "player_account_conflict", canApply: false }, 409);
  }

  const rows: LegacyRebirthSource[] = [
    ...saves.map(row => ({ kind: "save" as const, rowId: row.playerId,
      playerId: row.playerId, accountId: row.accountId,
      capturedAt: row.updatedAt, payload: row.payload })),
    ...snapshots.map(row => ({ kind: "snapshot" as const, rowId: String(row.id),
      playerId: row.playerId, accountId: row.accountId,
      capturedAt: row.capturedAt, payload: row.payload })),
  ];
  const preview = previewLegacyRebirth({ capturedAt: new Date().toISOString(), accountIds: [accountId], rows });
  return respond({ account: { id: account.id, username: account.username }, ...preview });
}

