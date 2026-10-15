export type GmMail = {id:number;title:string;body:string;createdAt:string;read:boolean};
export const GM_MAIL_DAYS = 7;
export function mailInsert(accountId:string,gmId:string,requestId:string,title:string,body:string,username:string) {
  const detail=JSON.stringify({requestId,title,body,username});
  return {detail,sql:`INSERT INTO gm_action_logs(gm_account_id,target_account_id,action,detail,created_at)
    SELECT ?,?,'gm_mail',?,? WHERE EXISTS(SELECT 1 FROM accounts WHERE id=? AND is_gm=0)
    AND NOT EXISTS(SELECT 1 FROM gm_action_logs WHERE action='gm_mail' AND gm_account_id=?
      AND CASE WHEN json_valid(detail) THEN json_extract(detail,'$.requestId') END=?)
    AND (SELECT count(*) FROM gm_action_logs WHERE action='gm_mail' AND target_account_id=?
      AND julianday(created_at)>julianday('now','-7 days'))<50`,
    bindings:[gmId,accountId,detail,new Date().toISOString(),accountId,gmId,requestId,accountId]};
}
export const inboxSql = `SELECT m.id,m.detail,m.created_at,
 EXISTS(SELECT 1 FROM gm_action_logs r WHERE r.action='gm_mail_read' AND r.target_account_id=m.target_account_id AND r.detail=CAST(m.id AS TEXT)) AS is_read
 FROM gm_action_logs m WHERE m.action='gm_mail' AND m.target_account_id=?
 AND julianday(m.created_at)>julianday('now','-7 days') ORDER BY m.id DESC LIMIT 50`;
export const mailReadSql = `INSERT INTO gm_action_logs(gm_account_id,target_account_id,action,detail,created_at)
 SELECT 'system',?,'gm_mail_read',?,? WHERE EXISTS(SELECT 1 FROM gm_action_logs WHERE id=? AND action='gm_mail' AND target_account_id=? AND julianday(created_at)>julianday('now','-7 days'))
 AND NOT EXISTS(SELECT 1 FROM gm_action_logs WHERE action='gm_mail_read' AND target_account_id=? AND detail=?)`;
