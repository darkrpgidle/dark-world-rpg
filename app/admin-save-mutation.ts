import type { getDb } from "../db";

type CurrentSave = { playerId: string; payload: string; updatedAt: string } | null;
type Mutation = { accountId: string; playerId: string; gmAccountId: string; current: CurrentSave;
  save: Record<string, unknown>; kind: string; action: string; detail: string; now?: number; operationId?: string };

// One atomic D1 batch: versioned backup/write, logout and audit. Every effect
// after the write is conditional on this operation's unguessable receipt.
export function buildAdminSaveMutation(input: Mutation) {
  const now = input.now ?? Date.now();
  const previousTime = input.current ? Date.parse(input.current.updatedAt) : 0;
  const updatedAt = new Date(Math.max(now, Number.isFinite(previousTime) ? previousTime + 1 : now)).toISOString();
  const operationId = input.operationId ?? crypto.randomUUID();
  const save = { ...input.save, _lastAdminOperationId: operationId };
  const payload = JSON.stringify(save);
  if (payload.length > 240_000) throw new RangeError("save_too_large");
  const statements: { sql: string; bindings: (string | number | null)[] }[] = [];
  if (input.current) {
    statements.push({ sql: `INSERT INTO save_snapshots (player_id,account_id,payload,kind,captured_at)
      SELECT player_id,account_id,payload,?,? FROM game_saves WHERE player_id=? AND account_id=? AND updated_at=?`,
      bindings: [input.kind, updatedAt, input.current.playerId, input.accountId, input.current.updatedAt] });
    statements.push({ sql: "UPDATE game_saves SET payload=?,updated_at=? WHERE player_id=? AND account_id=? AND updated_at=?",
      bindings: [payload, updatedAt, input.current.playerId, input.accountId, input.current.updatedAt] });
  } else {
    statements.push({ sql: `INSERT INTO game_saves (player_id,account_id,payload,updated_at)
      SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM game_saves WHERE account_id=?)`,
      bindings: [input.playerId, input.accountId, payload, updatedAt, input.accountId] });
  }
  const writeIndex = statements.length - 1;
  const receipt = `EXISTS (SELECT 1 FROM game_saves WHERE account_id=? AND updated_at=?
    AND CASE WHEN json_valid(payload) THEN json_extract(payload,'$._lastAdminOperationId') END=?)`;
  const receiptBindings = [input.accountId, updatedAt, operationId];
  statements.push({ sql: `DELETE FROM sessions WHERE account_id=? AND ${receipt}`,
    bindings: [input.accountId, ...receiptBindings] });
  statements.push({ sql: `INSERT INTO gm_action_logs (gm_account_id,target_account_id,action,detail,created_at)
    SELECT ?,?,?,?,? WHERE ${receipt}`,
    bindings: [input.gmAccountId, input.accountId, input.action, input.detail, updatedAt, ...receiptBindings] });
  return { statements, writeIndex, updatedAt, save };
}

export async function commitAdminSave(db: Awaited<ReturnType<typeof getDb>>, input: Mutation) {
  const plan = buildAdminSaveMutation(input);
  const results = await db.$client.batch(plan.statements.map(statement => db.$client.prepare(statement.sql).bind(...statement.bindings)));
  return { ...plan, accepted: results[plan.writeIndex]?.meta?.changes === 1 };
}
