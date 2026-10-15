import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[cm]?[jt]sx?$/.test(s)?`${s}.ts`:s,c)}});
const {buildAdminSaveMutation}=await import('../app/admin-save-mutation.ts');
const {equippedSlotIndex,replaceEquippedSlot,normalizedAdminEquipment}=await import('../app/admin-equipment.ts');
const {integrityAuditDetail,parseIntegrityDetail}=await import('../app/save-integrity-audit.ts');
const {resetAdminIntegrity,adminLocalDateTime}=await import('../app/admin-state.ts');
const at=Date.parse('2026-10-03T07:00:00Z');
function database(){const db=new DatabaseSync(':memory:');db.exec(`
 CREATE TABLE game_saves(player_id TEXT PRIMARY KEY,account_id TEXT,payload TEXT,updated_at TEXT);
 CREATE TABLE save_snapshots(id INTEGER PRIMARY KEY,player_id TEXT,account_id TEXT,payload TEXT,kind TEXT,captured_at TEXT);
 CREATE TABLE sessions(account_id TEXT);
 CREATE TABLE gm_action_logs(id INTEGER PRIMARY KEY,gm_account_id TEXT,target_account_id TEXT,action TEXT,detail TEXT,created_at TEXT);`);
 db.prepare('INSERT INTO game_saves VALUES(?,?,?,?)').run('player','account','{"gold":100}','v1');
 db.prepare('INSERT INTO sessions VALUES(?)').run('account');return db;}
const input=()=>({accountId:'account',playerId:'player',gmAccountId:'gm',current:{playerId:'player',payload:'{"gold":100}',updatedAt:'v1'},save:{gold:150},kind:'pre_admin_edit',action:'edit_save',detail:'edit',now:at,operationId:'op'});
function commit(db,plan){db.exec('BEGIN');try{const result=plan.statements.map(s=>db.prepare(s.sql).run(...s.bindings));db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
test('admin mutation atomically backs up, edits, logs out and records the action',()=>{
 const db=database(),plan=buildAdminSaveMutation(input()),result=commit(db,plan);
 assert.equal(result[plan.writeIndex].changes,1);assert.equal(JSON.parse(db.prepare('SELECT payload FROM game_saves').get().payload).gold,150);
 assert.equal(db.prepare('SELECT payload FROM save_snapshots').get().payload,'{"gold":100}');
 assert.equal(db.prepare('SELECT count(*) AS n FROM sessions').get().n,0);assert.equal(db.prepare('SELECT count(*) AS n FROM gm_action_logs').get().n,1);db.close();
});
test('stale version causes zero writes, backups, logouts and audit records',()=>{
 const db=database();db.prepare('UPDATE game_saves SET updated_at=?,payload=?').run('v2','{"gold":200}');
 const plan=buildAdminSaveMutation(input()),result=commit(db,plan);
 assert.equal(result[plan.writeIndex].changes,0);assert.equal(JSON.parse(db.prepare('SELECT payload FROM game_saves').get().payload).gold,200);
 for(const table of ['save_snapshots','gm_action_logs'])assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n,0);
 assert.equal(db.prepare('SELECT count(*) AS n FROM sessions').get().n,1);db.close();
});
test('audit failure rolls back the save, backup and logout',()=>{
 const db=database();db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON gm_action_logs BEGIN SELECT RAISE(ABORT,'failed audit'); END;");
 assert.throws(()=>commit(db,buildAdminSaveMutation(input())));
 assert.equal(JSON.parse(db.prepare('SELECT payload FROM game_saves').get().payload).gold,100);
 assert.equal(db.prepare('SELECT count(*) AS n FROM sessions').get().n,1);assert.equal(db.prepare('SELECT count(*) AS n FROM save_snapshots').get().n,0);db.close();
});
test('creating a GM character cannot insert a second character for an account',()=>{
 const db=database(),args={...input(),current:null,playerId:'new-player'};
 assert.equal(commit(db,buildAdminSaveMutation(args))[0].changes,0);
 db.exec('DELETE FROM game_saves');assert.equal(commit(db,buildAdminSaveMutation(args))[0].changes,1);
 assert.equal(db.prepare('SELECT count(*) AS n FROM game_saves').get().n,1);db.close();
});
test('equipped slots follow loadout IDs rather than bag order and leave bag equipment intact',()=>{
 const bag={id:1,name:'灰燼武器',slot:'武器',mapId:1,quality:'普通',power:80,enhance:0};
 const worn={...bag,id:2,enhance:5};const save={items:[bag,worn],loadouts:{1:[2],2:[1]},activeLoadout:1};
 assert.equal(equippedSlotIndex(save,'武器'),1);
 const next=replaceEquippedSlot(save,'武器',{enhance:10});assert.equal(next.items[0].enhance,0);assert.equal(next.items[1].enhance,10);
 const empty=replaceEquippedSlot(next,'武器',{name:''});assert.equal(empty.items.length,2);assert.deepEqual(empty.loadouts[1],[]);assert.deepEqual(empty.loadouts[2],[1]);
 const head=replaceEquippedSlot(save,'頭盔',{name:'灰燼頭盔'});assert.equal(head.items.length,3);assert.ok(head.loadouts[1].includes(head.items[2].id));
});
test('changing a catalog item to scene equipment clears old catalog effects and uses current reforgeCount',()=>{
 const previous={id:2,name:'灰燼武器',slot:'武器',mapId:1,quality:'普通',power:80,mythicId:'forged',reforgeLevel:9};
 const next=normalizedAdminEquipment({...previous,name:'荒骨武器',quality:'史詩'},previous);
 assert.equal(next.mapId,2);assert.equal(next.mythicId,undefined);assert.equal(next.reforgeCount,9);assert.ok(next.power>80);assert.equal(next.reforgeLevel,undefined);
});
test('integrity audit stores only bounded field changes and handles legacy or broken details',()=>{
 const detail=integrityAuditDetail('player','excessive_gold',{gold:100},{gold:1e9,password:'secret',_saveIntegrity:{secret:'token'}});
 assert.doesNotMatch(detail,/secret|token|password/);assert.deepEqual(parseIntegrityDetail(detail).changes.find(c=>c.field==='gold'),{field:'gold',before:100,submitted:1e9});
 assert.deepEqual(parseIntegrityDetail('{"reason":"unissued_rebirth"}'),{reason:'unissued_rebirth',changes:[]});
 assert.deepEqual(parseIntegrityDetail('broken'),{reason:'unknown',changes:[]});
});
test('restore retains current consumed claim and resets old budget and client clock',()=>{
 const next=resetAdminIntegrity({_lastIdleClaimId:'old',_saveSequence:900,_saveIntegrity:{credits:{gold:1e9}}},{_lastIdleClaimId:'current',_lastIdleClaimSeconds:3600},at);
 assert.equal(next._lastIdleClaimId,'current');assert.equal(next._saveIntegrity.idleClaimId,'current');assert.equal(next.lastSeenAt,at);assert.deepEqual(next._saveIntegrity.credits,{});assert.equal(next._saveSequence,undefined);
 assert.equal(adminLocalDateTime(new Date(at)).length,16);
});
test('every security log read enforces GM authorization, bounded paging and UTC-compatible date filtering',()=>{
 const route=readFileSync(new URL('../app/api/admin/security-logs/route.ts',import.meta.url),'utf8');
 assert.ok(route.indexOf('if (!gm.isGm)')<route.indexOf('const db = await getDb()'));
 assert.match(route,/Cache-Control.*no-store/);assert.match(route,/limit\(26\)/);assert.match(route,/lt\(gmActionLogs.id,cursor\)/);assert.match(route,/julianday/);
 const ui=readFileSync(new URL('../app/admin-panels.tsx',import.meta.url),'utf8');
 assert.match(ui,/loadedAccountId!==accountId/);assert.match(ui,/expectedUpdatedAt:updatedAt/);assert.match(ui,/equippedSlotIndex\(save,slot\)/);assert.match(ui,/update\("storedSeconds"/);assert.doesNotMatch(ui,/update\("idleSeconds"/);
});

test('real security endpoint returns 401/403 before touching player or audit data',async()=>{
 registerHooks({resolve(s,c,n){
  if(c.parentURL?.includes('/app/api/admin/security-logs/') && s==='../../auth-utils')return {url:'data:text/javascript,export async function currentAccount(){return globalThis.__gmAuditAuth ?? null}',shortCircuit:true};
  if(c.parentURL?.includes('/app/api/admin/security-logs/') && s==='../../../../db')return {url:'data:text/javascript,export async function getDb(){throw new Error("database reached")}',shortCircuit:true};
  return n(s,c);
 }});
 const {GET}=await import('../app/api/admin/security-logs/route.ts');
 const request=new Request('https://example.test/api/admin/security-logs');
 globalThis.__gmAuditAuth=null;assert.equal((await GET(request)).status,401);
 globalThis.__gmAuditAuth={id:'player',isGm:false};assert.equal((await GET(request)).status,403);
 globalThis.__gmAuditAuth={id:'gm',isGm:true};await assert.rejects(()=>GET(request),/database reached/);
 delete globalThis.__gmAuditAuth;
});

test('self edit backs up and invalidates its own sessions atomically',()=>{
 const db=database();const args={...input(),gmAccountId:'account'};
 const plan=buildAdminSaveMutation(args);assert.equal(commit(db,plan)[plan.writeIndex].changes,1);
 assert.equal(db.prepare('SELECT count(*) AS n FROM sessions').get().n,0);
 assert.equal(db.prepare('SELECT count(*) AS n FROM save_snapshots').get().n,1);
 const log=db.prepare('SELECT gm_account_id,target_account_id FROM gm_action_logs').get();
 assert.equal(log.gm_account_id,'account');assert.equal(log.target_account_id,'account');db.close();
});
