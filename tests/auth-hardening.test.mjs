import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {sessionReplacement} from '../app/auth-session-plan.ts';
import {rateLimitStatement,authenticationRules} from '../app/auth-rate-limit.ts';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[cm]?[jt]sx?$/.test(s)?`${s}.ts`:s,c)}});
const {invalidSaveField,saveDisplay}=await import('../app/save-field-schema.ts');
function db(){const d=new DatabaseSync(':memory:');d.exec(`CREATE TABLE accounts(id TEXT PRIMARY KEY,suspended_at TEXT,suspended_until TEXT);INSERT INTO accounts VALUES('a',NULL,NULL);CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,account_id TEXT,login_id TEXT,expires_at TEXT,created_at TEXT);CREATE TABLE auth_rate_limits(key TEXT PRIMARY KEY,window_start INTEGER,window_end INTEGER,count INTEGER);`);return d;}
function replace(d,token){d.exec('BEGIN');try{const results=sessionReplacement('a',token,token,'2099-01-01').map(s=>d.prepare(s.sql).run(...s.bindings));d.exec('COMMIT');return results;}catch(e){d.exec('ROLLBACK');throw e;}}
test('serialized atomic login transactions leave exactly one active login; failed insertion restores previous login',()=>{const d=db();replace(d,'A');replace(d,'B');assert.equal(d.prepare('SELECT count(*) n FROM sessions').get().n,1);assert.equal(d.prepare('SELECT token_hash FROM sessions').get().token_hash,'B');d.exec("CREATE TRIGGER fail BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT,'fail');END;");assert.throws(()=>replace(d,'C'));assert.equal(d.prepare('SELECT token_hash FROM sessions').get().token_hash,'B');d.close();});
test('deleted or newly suspended account cannot create a session after earlier authentication',()=>{for(const sql of ["DELETE FROM accounts","UPDATE accounts SET suspended_at='2026-01-01'"]){const d=db();d.exec(sql);assert.equal(replace(d,'x')[1].changes,0);assert.equal(d.prepare('SELECT count(*) n FROM sessions').get().n,0);d.close();}});
test('persistent atomic counter enforces limit, caps rejected attempts and resets at exact next window',()=>{const d=db(),rule={key:'k',limit:3,seconds:60},consume=now=>{const s=rateLimitStatement(rule,now);return d.prepare(s.sql).get(...s.bindings).count;};for(let i=1;i<=4;i++)assert.equal(consume(61000),i);assert.equal(consume(119999),4);assert.equal(consume(120000),1);assert.equal(d.prepare('SELECT count(*) n FROM auth_rate_limits').get().n,1);d.close();});
test('limiter hashes identifying inputs, separates source and account, ignores spoofable forwarded header',async()=>{const rules=await authenticationRules(new Request('https://game/api/auth',{headers:{'cf-connecting-ip':'192.0.2.1'}}),'login','gm4d');assert.equal(rules.length,3);assert.ok(rules.every(r=>!r.key.includes('192.0.2.1')&&!r.key.includes('gm4d')));const r=await authenticationRules(new Request('https://game/api/auth',{headers:{'x-forwarded-for':'192.0.2.2'}}),'register','player');assert.equal(r[1].key,'register:source:unknown');assert.equal(r[1].limit,5);});
test('optional legacy fields remain accepted; wrong scalar and nested field types fail',()=>{
assert.equal(invalidSaveField({playerName:'玩家',playerClass:'戰士',items:[],loadouts:{1:[],2:[]}}),null);
for(const value of [{playerName:{}},{playerName:123},{battleOn:'true'},{combatPower:'100'},{items:[null]},{items:[{affixes:[{}]}]},{loadouts:{1:{}}},{mails:[{body:{}}]},{mails:[{rewards:{items:[{}],gold:'100'}}]},{rebirthTalents:[]},{gemInventory:[{gemId:'redIron',tier:'beginner',quantity:'1'}]},{logs:[{id:1,time:'now',type:'系統',text:{}}]},JSON.parse('{"__proto__":{}}')])assert.notEqual(invalidSaveField(value),null,JSON.stringify(value));
assert.equal(invalidSaveField({mails:[{id:'legacy-mail',rewards:{gold:0,items:[]}}]}),null);
});
test('legacy malformed display fields are removed without mutating saved data',()=>{const raw={playerName:{x:1},combatPower:'invalid',level:5,items:[null,{id:1,slot:'武器',name:{},affixes:[{},'攻擊 +1']}],loadouts:{1:[1,{}]}};const safe=saveDisplay(raw);assert.equal(safe.playerName,undefined);assert.equal(safe.combatPower,undefined);assert.equal(safe.level,5);assert.equal(safe.items.length,1);assert.deepEqual(safe.loadouts['1'],[1]);assert.deepEqual(raw.playerName,{x:1});});
test('write route validates raw types before normalization; login replacement uses one batch and limiter precedes password verification',()=>{const route=readFileSync(new URL('../app/api/save/route.ts',import.meta.url),'utf8'),auth=readFileSync(new URL('../app/api/auth/route.ts',import.meta.url),'utf8'),utils=readFileSync(new URL('../app/api/auth-utils.ts',import.meta.url),'utf8');assert.ok(route.indexOf('invalidSaveField(incoming)')<route.indexOf('resetPersonalBossTicketsIfNeeded(incoming)'));assert.ok(auth.indexOf('rateLimitStatement(r,now)')<auth.indexOf('await verifyPassword'));assert.match(auth,/status:429/);assert.match(auth,/Retry-After/);assert.match(utils,/db\.\$client\.batch\(plan/);});

test('fresh account and no idle claim allow explicit null claim id; other wrong types remain rejected',()=>{
const fresh={playerName:'新玩家',playerClass:'法師',level:1,exp:0,gold:0,yuanbao:0,items:[],loadouts:{1:[],2:[]},skillReworkBuild:{ranks:{},activeSlots:[null,null,null]},skillAscensions:{rebirthCount:0,choices:[null,null,null,null,null],selectionOpen:false},_lastIdleClaimId:null};
assert.equal(invalidSaveField(fresh),null);assert.equal(invalidSaveField({...fresh,_lastIdleClaimId:'issued-id'}),null);
for(const v of [42,{},[],false])assert.equal(invalidSaveField({...fresh,_lastIdleClaimId:v}),'_lastIdleClaimId');
for(const v of [null,{},[]])assert.equal(invalidSaveField({...fresh,playerName:v}),'playerName');
assert.equal(invalidSaveField(saveDisplay(fresh)),null);
});

test('skill nested fields reject malformed ranks, slots and ascension choices',()=>{
for(const v of [{ranks:{a:'1'},activeSlots:[null,null,null]},{ranks:[],activeSlots:[null,null,null]},{ranks:{},activeSlots:[{},null,null]},{ranks:{},activeSlots:[null]},{ranks:{},activeSlots:[null,null,null],adminPointLimit:'100'}])assert.equal(invalidSaveField({skillReworkBuild:v}),'skillReworkBuild');
for(const v of [{rebirthCount:0,choices:[null,null,null,null,{}],selectionOpen:false},{rebirthCount:0,choices:[null,null,null,null,null],selectionOpen:'false'}])assert.equal(invalidSaveField({skillAscensions:v}),'skillAscensions');
assert.equal(invalidSaveField({items:[{sockets:{socketCount:3,gems:[]}}]}),'items');
});
