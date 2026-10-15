// Account removal is atomic; historical snapshots and audit records remain
// tied to the old account ID, never to a newly registered namesake.
export function buildAccountDeletion(accountId: string, username: string, gmAccountId: string, reason: string, now = new Date().toISOString()) {
  const eligible = "EXISTS (SELECT 1 FROM accounts WHERE id=? AND username=? AND is_gm=0 AND id<>?)";
  const guard = [accountId, username, gmAccountId];
  const statements = [
    {sql: `INSERT INTO save_snapshots (player_id,account_id,payload,kind,captured_at)
      SELECT player_id,account_id,payload,'pre_account_delete',? FROM game_saves WHERE account_id=? AND ${eligible}`, bindings:[now,accountId,...guard]},
    {sql: `INSERT INTO gm_action_logs (gm_account_id,target_account_id,action,detail,created_at)
      SELECT ?,?,'delete_account',?,? WHERE ${eligible}`, bindings:[gmAccountId,accountId,JSON.stringify({username,reason}),now,...guard]},
    ...["sessions", "game_saves", "account_rebirth_entitlements"].map(table => ({
      sql:`DELETE FROM ${table} WHERE account_id=? AND ${eligible}`, bindings:[accountId,...guard],
    })),
    {sql:"DELETE FROM accounts WHERE id=? AND username=? AND is_gm=0 AND id<>?",bindings:guard},
  ];
  return statements;
}
