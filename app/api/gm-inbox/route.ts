import {currentLogin} from '../auth-utils';
import {getDb} from '../../../db';
import {adminJson} from '../../admin-response';
import {inboxSql,mailReadSql,type GmMail} from '../../gm-mail';
export async function GET(request:Request){
 const login=await currentLogin(request);if(!login.account)return adminJson({error:login.error},{status:401});
 const db=await getDb();
 const rows=await db.$client.prepare(inboxSql).bind(login.account.id).all<{id:number;detail:string;created_at:string;is_read:number}>();
 const mails:GmMail[]=[];
 for(const row of rows.results){try{const d=JSON.parse(row.detail);if(typeof d.title==='string'&&typeof d.body==='string')mails.push({id:row.id,title:d.title,body:d.body,createdAt:row.created_at,read:Boolean(row.is_read)});}catch{/* skip malformed historical log */}}
 return adminJson({mails});
}
export async function POST(request:Request){
 const login=await currentLogin(request);if(!login.account)return adminJson({error:login.error},{status:401});
 const data=await request.json().catch(()=>null);if(!Number.isSafeInteger(data?.id)||data.id<1)return adminJson({error:'invalid_mail'},{status:400});
 const db=await getDb(),id=String(data.id),account=login.account.id;
 const own=await db.$client.prepare("SELECT id FROM gm_action_logs WHERE id=? AND action='gm_mail' AND target_account_id=? AND julianday(created_at)>julianday('now','-7 days')").bind(data.id,account).first();
 if(!own)return adminJson({error:'mail_missing'},{status:404});
 await db.$client.prepare(mailReadSql).bind(account,id,new Date().toISOString(),data.id,account,account,id).run();
 return adminJson({ok:true});
}
