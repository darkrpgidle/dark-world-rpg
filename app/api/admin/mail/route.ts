import {currentAccount} from '../../auth-utils';
import {getDb} from '../../../../db';
import {adminJson} from '../../../admin-response';
import {mailInsert} from '../../../gm-mail';
export async function POST(request:Request){
 const gm=await currentAccount(request);
 if(!gm)return adminJson({error:'not_authenticated'},{status:401});
 if(!gm.isGm)return adminJson({error:'forbidden'},{status:403});
 const data=await request.json().catch(()=>null);
 if(!data || typeof data!=='object')return adminJson({error:'invalid_mail'},{status:400});
 const {accountId,requestId}=data;
 const title=typeof data.title==='string'?data.title.trim():'';
 const body=typeof data.body==='string'?data.body.trim():'';
 if(typeof accountId!=='string'||typeof requestId!=='string'||!/^[a-zA-Z0-9-]{20,80}$/.test(requestId)||!title||title.length>80||!body||body.length>2000)return adminJson({error:'invalid_mail'},{status:400});
 const db=await getDb(),client=db.$client;
 const previous=await client.prepare("SELECT target_account_id,detail FROM gm_action_logs WHERE action='gm_mail' AND gm_account_id=? AND CASE WHEN json_valid(detail) THEN json_extract(detail,'$.requestId') END=?").bind(gm.id,requestId).first<{target_account_id:string;detail:string}>();
 if(previous){const old=JSON.parse(previous.detail);return previous.target_account_id===accountId&&old.title===title&&old.body===body ? adminJson({ok:true,duplicate:true}):adminJson({error:'request_conflict'},{status:409});}
 const target=await client.prepare('SELECT username FROM accounts WHERE id=? AND is_gm=0').bind(accountId).first<{username:string}>();
 if(!target)return adminJson({error:'recipient_missing'},{status:404});
 const plan=mailInsert(accountId,gm.id,requestId,title,body,target.username);
 const result=await client.prepare(plan.sql).bind(...plan.bindings).run();
 if(result.meta.changes===1)return adminJson({ok:true});
 // Concurrent retries share the original receipt. Never create a second mail.
 const existing=await client.prepare("SELECT target_account_id,detail FROM gm_action_logs WHERE action='gm_mail' AND gm_account_id=? AND CASE WHEN json_valid(detail) THEN json_extract(detail,'$.requestId') END=?").bind(gm.id,requestId).first<{target_account_id:string;detail:string}>();
 if(existing){const old=JSON.parse(existing.detail);if(existing.target_account_id===accountId&&old.title===title&&old.body===body)return adminJson({ok:true,duplicate:true});}
 return adminJson({error:'mailbox_full_or_changed'},{status:409});
}
