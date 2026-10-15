import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[cm]?[jt]sx?$/.test(s)?`${s}.ts`:s,c);}});
const {worldBossCycle,lastWorldBossCycle,worldBossDamageDelta,damageEventStatement,settleWorldBoss,deliverWorldBossMail,makeWorldBossReward,worldBossRanking,worldBossClaimStatements}=await import('../app/world-boss-rewards.ts');
const {canonicalAffixes}=await import('../app/equipment-affixes.ts');
const {validateSaveTransition,SaveIntegrityError}=await import('../app/save-integrity.ts');
const {preserveServerResourceRevision}=await import('../app/server-resource-revision.ts');
const at=Date.parse('2026-10-12T04:00:00Z'),before=at-1000;
function database(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(`CREATE TABLE accounts(id TEXT PRIMARY KEY,is_gm INTEGER NOT NULL,suspended_until TEXT);
 CREATE TABLE game_saves(player_id TEXT PRIMARY KEY,account_id TEXT,payload TEXT,updated_at TEXT);`);
 sqlite.exec(readFileSync(new URL('../drizzle/0011_faithful_revanche.sql',import.meta.url),'utf8'));
 sqlite.exec(readFileSync(new URL('../drizzle/0012_cuddly_karnak.sql',import.meta.url),'utf8'));
 const db={prepare(sql){return {sql,args:[],bind(...args){this.args=args;return this;},async all(){return {results:sqlite.prepare(sql).all(...this.args)};},async first(){return sqlite.prepare(sql).get(...this.args)??null;}};},async batch(statements){sqlite.exec('BEGIN');try{const results=statements.map(s=>({meta:{changes:sqlite.prepare(s.sql).run(...s.args).changes}}));sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 return {db,sqlite};
}
function save(cls='戰士'){return {playerClass:cls,playerName:cls,level:100,exp:0,xpSchemaVersion:2,rebirthCount:0,rebirthPoints:0,rebirthTalents:{},gold:0,yuanbao:0,enhanceStones:0,reforgeStones:0,drillingStones:0,combatPower:1350,worldDamage:0,worldBossResetVersion:'2026-09-14-60s',unlockedMapId:1,mapId:1,wave:1,mapBestFloors:{1:1},dailyDate:'2026-10-12',dailyKills:0,items:[],mails:[],gemInventory:[],storedSeconds:0,lastSeenAt:before,loadouts:{1:[],2:[]},adminRevision:0};}
function participant(d,id,damage,cls='戰士',gm=0){
 const s={...save(cls),worldDamage:damage},date=new Date(before).toISOString();
 d.sqlite.prepare('INSERT INTO accounts VALUES(?,?,NULL)').run(id,gm);
 d.sqlite.prepare('INSERT INTO game_saves VALUES(?,?,?,?)').run(id,id,JSON.stringify(s),date);
 const event=damageEventStatement(id,id,date,save(cls),s,before);
 if(event)d.sqlite.prepare(event.sql).run(...event.bindings);
 return s;
}
test('Taipei noon is the only period boundary, including midnight and next-day noon',()=>{
 assert.equal(worldBossCycle(at-1),'2026-10-12');assert.equal(worldBossCycle(at),'2026-10-13');
 assert.equal(lastWorldBossCycle(at-1),'2026-10-11');assert.equal(lastWorldBossCycle(at),'2026-10-12');
 assert.equal(worldBossCycle(Date.parse('2026-10-12T16:00:00Z')),'2026-10-13');
 assert.equal(worldBossDamageDelta({...save(),dailyDate:'2026-10-11',worldDamage:1000},{...save(),worldDamage:100},before),100);
 assert.equal(worldBossDamageDelta(save(),{...save(),worldDamage:-100},before),0);
});
test('accepted damage counts once, rejected/racing save payloads cannot create a contribution',()=>{
 const d=database(),s=participant(d,'a',100);
 const date=new Date(before).toISOString(),same=damageEventStatement('a','a',date,save(),s,before);
 d.sqlite.prepare(same.sql).run(...same.bindings);
 const forged=damageEventStatement('a','a',date,save(),{...s,worldDamage:100000},before);
 d.sqlite.prepare(forged.sql).run(...forged.bindings);
 assert.equal(d.sqlite.prepare('SELECT SUM(damage) n FROM world_boss_damage_events').get().n,100);
});
test('concurrent settlement snapshots top three, excludes GM and never duplicates rewards',async()=>{
 const d=database();participant(d,'a',300,'戰士');participant(d,'b',200,'遊俠');participant(d,'c',100,'法師');participant(d,'d',1);participant(d,'gm',999999,'戰士',1);
 await Promise.all([settleWorldBoss(d.db,at),settleWorldBoss(d.db,at)]);
 const mails=d.sqlite.prepare('SELECT account_id,rank,mail FROM world_boss_reward_mails ORDER BY rank').all();
 assert.deepEqual(mails.map(x=>[x.account_id,x.rank]),[['a',1],['b',2],['c',3]]);
 assert.equal(d.sqlite.prepare('SELECT count(*) n FROM world_boss_settlements').get().n,1);
 assert.deepEqual(JSON.parse(mails[0].mail).rewards.items[0].affixes,['攻擊% +10%','攻擊% +10%','暴擊 +10%','攻速 +10%','暴擊傷害 +30%']);
 assert.equal((await settleWorldBoss(d.db,at)).settled,0);
});
test('noon before boundary does not pay current period; empty due periods are durably completed',async()=>{
 const d=database();participant(d,'a',100);
 await settleWorldBoss(d.db,before);assert.equal(d.sqlite.prepare('SELECT count(*) n FROM world_boss_reward_mails').get().n,0);
 assert.equal(d.sqlite.prepare('SELECT cycle FROM world_boss_settlements').get().cycle,'2026-10-11');
 await settleWorldBoss(d.db,at);assert.equal(d.sqlite.prepare('SELECT count(*) n FROM world_boss_reward_mails').get().n,1);
});
test('settlement batch failure rolls back both receipt and every reward mail, then retry succeeds',async()=>{
 const d=database();participant(d,'a',100);d.sqlite.exec(`CREATE TRIGGER broken_reward BEFORE INSERT ON world_boss_reward_mails BEGIN SELECT RAISE(ABORT,'test failure');END;`);
 await assert.rejects(settleWorldBoss(d.db,at));assert.equal(d.sqlite.prepare('SELECT count(*) n FROM world_boss_settlements').get().n,0);
 d.sqlite.exec('DROP TRIGGER broken_reward');await settleWorldBoss(d.db,at);assert.equal(d.sqlite.prepare('SELECT count(*) n FROM world_boss_reward_mails').get().n,1);
});
test('late damage cannot alter a completed period; midnight damage remains in the noon-to-noon cycle',async()=>{
 const d=database();const s=participant(d,'a',100);await settleWorldBoss(d.db,at);
 const date=new Date(at+1).toISOString(),next={...s,worldDamage:200};d.sqlite.prepare('UPDATE game_saves SET payload=?,updated_at=?').run(JSON.stringify(next),date);
 const event=damageEventStatement('a','a',date,s,next,at+1);d.sqlite.prepare(event.sql).run(...event.bindings);
 assert.equal((await worldBossRanking(d.db,at+1))[0].damage,100);
 const night=Date.parse('2026-10-12T16:00:01Z'),after={...next,dailyDate:'2026-10-13',worldDamage:50},updated=new Date(night).toISOString();
 d.sqlite.prepare('UPDATE game_saves SET payload=?,updated_at=?').run(JSON.stringify(after),updated);
 const midnight=damageEventStatement('a','a',updated,next,after,night);d.sqlite.prepare(midnight.sql).run(...midnight.bindings);
 assert.equal((await worldBossRanking(d.db,night))[0].damage,150);
});
test('mail delivery is atomic and idempotent, remains offline-safe and cannot overwrite a competing save',async()=>{
 const d=database();participant(d,'a',100);await settleWorldBoss(d.db,at);
 await Promise.all([deliverWorldBossMail(d.db,'a',at+1),deliverWorldBossMail(d.db,'a',at+1)]);
 const row=d.sqlite.prepare('SELECT payload FROM game_saves WHERE account_id=?').get('a'),s=JSON.parse(row.payload);
 assert.equal(s.mails.length,1);assert.equal(s.adminRevision,1);assert.ok(d.sqlite.prepare('SELECT delivered_at FROM world_boss_reward_mails').get().delivered_at);
 assert.equal(preserveServerResourceRevision({...s,adminRevision:0},s).adminRevision,1);
 await deliverWorldBossMail(d.db,'a',at+2);assert.equal(JSON.parse(d.sqlite.prepare('SELECT payload FROM game_saves').get().payload).mails.length,1);
});
test('first-place premium affixes survive normalization and claimed stones/yuanbao/equipment pass server checks once',()=>{
 const previous=save(),mail=makeWorldBossReward('2026-10-12','a',1,{cls:'戰士',mapId:1,damage:100},at);previous.mails=[mail];
 const item=mail.rewards.items[0];assert.deepEqual(canonicalAffixes(item),item.affixes);
 const claimed={...mail,claimed:true,rewards:{...mail.rewards,yuanbao:0,reforgeStones:0,items:[],resourcesClaimed:true}};
 const next={...previous,yuanbao:500,reforgeStones:200,items:[item],mails:[claimed]};
 const accepted=validateSaveTransition(next,previous,at+1,at);assert.equal(accepted.yuanbao,500);assert.equal(accepted.reforgeStones,200);
 assert.throws(()=>validateSaveTransition({...accepted,yuanbao:1000},accepted,at+2,at+1),e=>e instanceof SaveIntegrityError&&e.reason==='unissued_yuanbao');
 assert.throws(()=>validateSaveTransition({...previous,items:[item],mails:[]},previous,at+1,at),e=>e.reason==='missing_world_reward_mail');
});
test('forged provenance and expired premium mail claims are rejected; normal inventory remains compatible',()=>{
 const previous=save(),mail=makeWorldBossReward('2026-10-12','a',1,{cls:'戰士',mapId:1,damage:100},at);previous.mails=[mail];
 assert.throws(()=>validateSaveTransition({...previous,items:[{...mail.rewards.items[0],id:111}]},previous,at+1,at),e=>e.reason==='forged_world_boss_reward');
 const claimed={...mail,claimed:true,rewards:{...mail.rewards,yuanbao:0,reforgeStones:0,items:[],resourcesClaimed:true}};
 assert.throws(()=>validateSaveTransition({...previous,items:[mail.rewards.items[0]],yuanbao:500,reforgeStones:200,mails:[claimed]},previous,at+8*86400000,at+8*86400000),e=>e.reason==='expired_world_boss_reward');
});


test('claim receipts survive restored saves and stale claim attempts cannot issue rewards twice',async()=>{
 const d=database();participant(d,'a',100);await settleWorldBoss(d.db,at);await deliverWorldBossMail(d.db,'a',at+1);
 const row=d.sqlite.prepare('SELECT * FROM game_saves').get(),previous=JSON.parse(row.payload),mail=previous.mails[0];
 const next={...previous,yuanbao:500,reforgeStones:200,items:[mail.rewards.items[0]],mails:[{...mail,claimed:true,rewards:{...mail.rewards,yuanbao:0,reforgeStones:0,items:[],resourcesClaimed:true}}]};
 const date=new Date(at+2).toISOString(),claims=worldBossClaimStatements('a','a',date,previous,next,at+2);
 await d.db.batch([d.db.prepare('UPDATE game_saves SET payload=?,updated_at=? WHERE player_id=? AND updated_at=?').bind(JSON.stringify(next),date,'a',row.updated_at),...claims.map(c=>d.db.prepare(c.sql).bind(...c.bindings))]);
 assert.equal(d.sqlite.prepare('SELECT count(*) n FROM world_boss_reward_claims').get().n,1);
 // A GM snapshot restore cannot resurrect the award's unclaimed mail.
 d.sqlite.prepare('UPDATE game_saves SET payload=?,updated_at=?').run(JSON.stringify(previous),new Date(at+3).toISOString());
 await deliverWorldBossMail(d.db,'a',at+4);
 const recovered=JSON.parse(d.sqlite.prepare('SELECT payload FROM game_saves').get().payload);
 assert.equal(recovered.mails[0].claimed,true);assert.equal(recovered.mails[0].rewards.items.length,0);
 assert.equal(recovered.mails[0].rewards.yuanbao,0);
});
