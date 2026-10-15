export function sessionReplacement(accountId:string,tokenHash:string,loginId:string,expiresAt:string){
 return [
 {sql:'DELETE FROM sessions WHERE account_id=?',bindings:[accountId]},
 {sql:`INSERT INTO sessions(token_hash,account_id,login_id,expires_at,created_at) SELECT ?,?,?,?,?
   WHERE EXISTS(SELECT 1 FROM accounts WHERE id=? AND (suspended_at IS NULL OR (suspended_until IS NOT NULL AND suspended_until<=?)))`,bindings:[tokenHash,accountId,loginId,expiresAt,new Date().toISOString(),accountId,new Date().toISOString()]},
 ];
}
