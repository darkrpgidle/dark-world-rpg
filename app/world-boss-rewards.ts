import {SKILL_MYTHICS,GENERAL_MYTHICS,SPECIAL_LEGENDARIES} from './mythic-data';
import {dropPowerRange} from './balance';
import {rollAffixes} from './equipment-affixes';
import {balanceConfig} from './balance-config';
import {assessedRankingPower} from './ranking-power';

type Save=Record<string,any>;
type Statement={sql:string;bindings:(string|number|null)[]};
type Prepared={bind(...args:any[]):Prepared;all<T>():Promise<{results:T[]}>;first<T>():Promise<T|null>};
export type RewardDb={prepare(sql:string):Prepared;batch(statements:any[]):Promise<any[]>};
const DAY=86400000,NOON_UTC=4*3600000;
export function worldBossCycle(now=Date.now()) {return new Date(Math.floor((now-NOON_UTC)/DAY)*DAY+DAY+NOON_UTC).toISOString().slice(0,10);}
export function lastWorldBossCycle(now=Date.now()) {return new Date(Math.floor((now-NOON_UTC)/DAY)*DAY+NOON_UTC).toISOString().slice(0,10);}
export function worldBossDamageDelta(previous:Save,next:Save,now:number) {
 const today=new Date(now+8*3600000).toISOString().slice(0,10);
 if(next.dailyDate!==today||next.worldBossResetVersion!=='2026-09-14-60s')return 0;
 const before=previous.dailyDate===today?Number(previous.worldDamage??0):0;
 const damage=Number(next.worldDamage??0)-before;
 return Number.isSafeInteger(damage)&&damage>0?damage:0;
}
export function damageEventStatement(accountId:string,playerId:string,updatedAt:string,previous:Save,next:Save,now:number):Statement|null {
 const damage=worldBossDamageDelta(previous,next,now);if(!damage)return null;
 const snapshot=JSON.stringify({name:String(next.playerName??'無名旅人'),cls:next.playerClass,
  level:next.level,power:assessedRankingPower(next),mapId:Math.max(1,Math.min(9,Number(next.mapId??1)))});
 return {sql:`INSERT INTO world_boss_damage_events(id,cycle,account_id,damage,snapshot,recorded_at)
 SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM game_saves WHERE player_id=? AND account_id=? AND updated_at=? AND payload=?)
 AND EXISTS(SELECT 1 FROM accounts WHERE id=? AND is_gm=0)
 AND NOT EXISTS(SELECT 1 FROM world_boss_settlements WHERE cycle=?) ON CONFLICT(id) DO NOTHING`,
 bindings:[`${playerId}:${updatedAt}`,worldBossCycle(now),accountId,damage,snapshot,new Date(now).toISOString(),playerId,accountId,updatedAt,JSON.stringify(next),accountId,worldBossCycle(now)]};
}
export const worldBossRankingSql=`SELECT * FROM (SELECT e.account_id,SUM(e.damage) damage,
 (SELECT snapshot FROM world_boss_damage_events latest WHERE latest.cycle=e.cycle AND latest.account_id=e.account_id ORDER BY recorded_at DESC,id DESC LIMIT 1) snapshot
 FROM world_boss_damage_events e JOIN accounts a ON a.id=e.account_id
 WHERE e.cycle=? AND a.is_gm=0 AND (a.suspended_until IS NULL OR a.suspended_until<?)
 GROUP BY e.account_id HAVING SUM(e.damage)>0) ORDER BY damage DESC,CAST(json_extract(snapshot,'$.power') AS INTEGER) DESC,account_id ASC LIMIT 100`;
export async function worldBossRanking(db:RewardDb,now=Date.now(),cycle=worldBossCycle(now)) {
 return (await db.prepare(worldBossRankingSql).bind(cycle,new Date(now).toISOString()).all<{account_id:string;damage:number;snapshot:string}>()).results;
}
function seedOf(value:string){let h=2166136261;for(const c of value)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
export function makeWorldBossReward(cycle:string,accountId:string,rank:number,snapshot:Save,now:number) {
 let seed=seedOf(`${cycle}:${accountId}:${rank}`);const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 const cls=snapshot.cls;
 const pool=rank===1?SKILL_MYTHICS.filter(x=>x.className===cls):rank===2?[...GENERAL_MYTHICS,...SPECIAL_LEGENDARIES]:SPECIAL_LEGENDARIES;
 if(!pool.length)throw Error('invalid_reward_class');
 const def=pool[Math.floor(random()*pool.length)],quality=def.kind==='special-legendary'?'傳奇':'神話';
 const mapId=Math.max(1,Math.min(9,Number(snapshot.mapId??1)));
 const provenance=`${cycle}:${accountId}:${rank}`;
 const item:Save={id:Date.parse(`${cycle}T04:00:00.000Z`)*1000+rank,name:def.name,slot:def.slot,quality,mapId,enhance:0,
  set:'',power:dropPowerRange(mapId,quality==='神話'?5:4).minimum,
  equipmentType:def.kind==='special-legendary'?'特殊傳奇':'神話裝備',
  ...(def.kind==='special-legendary'?{legendaryId:def.id}:{mythicId:def.id}),artKey:def.artKey,
  affixSchemaVersion:7,reforgeCount:0,sockets:{socketCount:0,gems:[]},worldBossRewardId:provenance,worldBossRewardRank:rank,affixes:[]};
 // Fixed first-place affixes are server-issued; ordinary reforges keep their normal pool.
 item.affixes=rank===1?['攻擊% +10%','攻擊% +10%','暴擊 +10%','攻速 +10%','暴擊傷害 +30%']:
  (()=>{const original=Math.random;try{Math.random=random;return rollAffixes(item as any);}finally{Math.random=original;}})();
 const rewards=balanceConfig.combat.worldBoss.rankingRewards[rank-1];
 return {id:`world-boss:${provenance}`,title:`深淵王排名獎勵・第${rank}名`,
  body:`${cycle} 12:00（台北時間）結算，累積傷害 ${Number(snapshot.damage).toLocaleString('zh-TW')}。獎勵保存7天。`,claimed:false,
  expiresAt:new Date(now+7*DAY).toISOString(),rewards:{gold:0,stones:0,yuanbao:rewards.yuanbao,reforgeStones:rewards.reforgeStones,items:[item],resourcesClaimed:false}};
}
export async function settleWorldBoss(db:RewardDb,now=Date.now()) {
 const due=lastWorldBossCycle(now);
 if(await db.prepare('SELECT cycle FROM world_boss_settlements WHERE cycle=?').bind(due).first())return {cycle:due,settled:0};
 const pending=(await db.prepare(`SELECT DISTINCT cycle FROM world_boss_damage_events WHERE cycle<=? AND cycle NOT IN(SELECT cycle FROM world_boss_settlements) ORDER BY cycle LIMIT 7`).bind(due).all<{cycle:string}>()).results.map(x=>x.cycle);
 if(pending.length<7&&!pending.includes(due))pending.push(due);
 let settled=0;
 for(const cycle of pending){
  if(await db.prepare('SELECT cycle FROM world_boss_settlements WHERE cycle=?').bind(cycle).first())continue;
  const winners=(await worldBossRanking(db,now,cycle)).slice(0,3),operation=crypto.randomUUID(),date=new Date(now).toISOString();
  const statements=[db.prepare(`INSERT INTO world_boss_settlements(cycle,operation_id,winners,completed_at) VALUES(?,?,?,?) ON CONFLICT(cycle) DO NOTHING`).bind(cycle,operation,JSON.stringify(winners.map((x,i)=>({accountId:x.account_id,rank:i+1,damage:x.damage}))),date)];
  for(const [i,winner]of winners.entries()){
   const snapshot=JSON.parse(winner.snapshot),mail=makeWorldBossReward(cycle,winner.account_id,i+1,{...snapshot,damage:winner.damage},now);
   statements.push(db.prepare(`INSERT INTO world_boss_reward_mails(id,cycle,account_id,rank,mail,created_at,expires_at)
    SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM world_boss_settlements WHERE cycle=? AND operation_id=?) ON CONFLICT(id) DO NOTHING`)
    .bind(mail.id,cycle,winner.account_id,i+1,JSON.stringify(mail),date,mail.expiresAt,cycle,operation));
  }
  const result=await db.batch(statements);if(result[0]?.meta?.changes===1)settled++;
 }
 return {cycle:due,settled};
}
export async function deliverWorldBossMail(db:RewardDb,accountId:string,now=Date.now()) {
 await reconcileWorldBossClaims(db,accountId,now);
 const rows=(await db.prepare(`SELECT id,mail FROM world_boss_reward_mails WHERE account_id=? AND delivered_at IS NULL AND expires_at>? ORDER BY created_at,id LIMIT 50`).bind(accountId,new Date(now).toISOString()).all<{id:string;mail:string}>()).results;
 if(!rows.length)return;
 for(let attempt=0;attempt<4;attempt++){
  const row=await db.prepare('SELECT player_id,payload,updated_at FROM game_saves WHERE account_id=?').bind(accountId).first<{player_id:string;payload:string;updated_at:string}>();if(!row)return;
  const save:Save=JSON.parse(row.payload),mails=Array.isArray(save.mails)?save.mails:[];
  const pending=rows.filter(r=>!mails.some((m:any)=>m.id===r.id));
  const kept=mails.filter((m:any)=>!m.claimed&&(!m.expiresAt||Date.parse(m.expiresAt)>now));
  const selected=pending.slice(0,Math.max(0,50-kept.length));if(!selected.length)return;
  const operation=crypto.randomUUID(),updatedAt=new Date(Math.max(now,Date.parse(row.updated_at)+1)).toISOString();
  const next={...save,mails:[...selected.map(r=>JSON.parse(r.mail)),...kept],adminRevision:Number(save.adminRevision??0)+1,_worldBossMailDeliveryId:operation};
  const payload=JSON.stringify(next);if(payload.length>240000)return;
  const statements=[db.prepare('UPDATE game_saves SET payload=?,updated_at=? WHERE player_id=? AND account_id=? AND updated_at=?').bind(payload,updatedAt,row.player_id,accountId,row.updated_at)];
  for(const mail of selected)statements.push(db.prepare(`UPDATE world_boss_reward_mails SET delivered_at=? WHERE id=? AND delivered_at IS NULL
   AND EXISTS(SELECT 1 FROM game_saves WHERE account_id=? AND updated_at=? AND json_extract(payload,'$._worldBossMailDeliveryId')=?)`).bind(updatedAt,mail.id,accountId,updatedAt,operation));
  const results=await db.batch(statements);if(results[0]?.meta?.changes===1)return;
 }
}

export function worldBossClaimStatements(accountId:string,playerId:string,updatedAt:string,previous:Save,next:Save,now:number):Statement[]{
 return (Array.isArray(previous.mails)?previous.mails:[]).filter((m:any)=>String(m.id).startsWith('world-boss:')&&!m.claimed)
  .filter((m:any)=>(next.mails??[]).some((n:any)=>n.id===m.id&&n.claimed&&n.rewards?.resourcesClaimed))
  .map((mail:any)=>({sql:`INSERT INTO world_boss_reward_claims(mail_id,account_id,claimed_at)
    SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM game_saves WHERE player_id=? AND account_id=? AND updated_at=? AND payload=?)
    AND EXISTS(SELECT 1 FROM world_boss_reward_mails WHERE id=? AND account_id=? AND expires_at>?) ON CONFLICT(mail_id) DO NOTHING`,
    bindings:[mail.id,accountId,new Date(now).toISOString(),playerId,accountId,updatedAt,JSON.stringify(next),mail.id,accountId,new Date(now).toISOString()]}));
}

async function reconcileWorldBossClaims(db:RewardDb,accountId:string,now:number){
 for(let i=0;i<4;i++){
  const row=await db.prepare(`SELECT DISTINCT s.player_id,s.payload,s.updated_at FROM game_saves s,json_each(s.payload,'$.mails') m
   JOIN world_boss_reward_claims c ON c.mail_id=json_extract(m.value,'$.id')
   WHERE s.account_id=? AND COALESCE(json_extract(m.value,'$.claimed'),0)=0`).bind(accountId).first<{player_id:string;payload:string;updated_at:string}>();
  if(!row)return;
  const ids=new Set((await db.prepare('SELECT mail_id FROM world_boss_reward_claims WHERE account_id=?').bind(accountId).all<{mail_id:string}>()).results.map(r=>r.mail_id));
  const save=JSON.parse(row.payload),operation=crypto.randomUUID();
  const next={...save,adminRevision:Number(save.adminRevision??0)+1,_worldBossMailDeliveryId:operation,
   mails:(save.mails??[]).map((m:any)=>ids.has(m.id)?{...m,claimed:true,rewards:{...m.rewards,gold:0,stones:0,yuanbao:0,reforgeStones:0,items:[],resourcesClaimed:true}}:m)};
  const updatedAt=new Date(Math.max(now,Date.parse(row.updated_at)+1)).toISOString();
  const [r]=await db.batch([db.prepare('UPDATE game_saves SET payload=?,updated_at=? WHERE player_id=? AND account_id=? AND updated_at=?').bind(JSON.stringify(next),updatedAt,row.player_id,accountId,row.updated_at)]);
  if(r?.meta?.changes===1)return;
 }
}
