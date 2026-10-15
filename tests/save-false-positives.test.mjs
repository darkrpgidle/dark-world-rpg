import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[cm]?[jt]sx?$/.test(s)?`${s}.ts`:s,c)}});
const {finalizePendingRebirth}=await import('../app/rebirth-save.ts');
const {applySkillSaveActionOnce}=await import('../app/skill-save-policy.ts');
const {preserveServerResourceRevision}=await import('../app/server-resource-revision.ts');
const {validateSaveTransition,SaveIntegrityError}=await import('../app/save-integrity.ts');
const {invalidSaveField}=await import('../app/save-field-schema.ts');
const {safeLoadouts,repairInheritedLoadout}=await import('../app/equipment-save-policy.ts');
const {dropPowerRange}=await import('../app/balance.ts');
const {rollAffixes}=await import('../app/equipment-affixes.ts');
const at=Date.parse('2026-10-03T06:00:00Z');
const gear=(map=1,rank=0)=>({id:123,name:'舊劍',slot:'武器',quality:['普通','良好','優秀','史詩','傳奇'][rank],mapId:map,enhance:0,power:dropPowerRange(map,rank).maximum,affixes:[],sockets:{socketCount:0,gems:[]}});
const base=()=>({playerClass:'戰士',level:100,exp:0,xpSchemaVersion:2,rebirthCount:0,rebirthPoints:0,rebirthTalents:{},gold:500,yuanbao:100,enhanceStones:10,reforgeStones:4,drillingStones:3,gemInventory:[],combatPower:60000,worldDamage:0,unlockedMapId:9,mapId:9,wave:30,mapBestFloors:{9:30},dailyDate:'2026-10-03',dailyKills:62,dailyRewardClaimed:false,items:[gear()],mails:[],loadouts:{1:[123],2:[123]},storedSeconds:120,lastSeenAt:at,adminRevision:7});
const id='123e4567-e89b-12d3-a456-426614174108';
const pending=()=>({...base(),_lastSkillRebirthLegacyCount:0,skillReworkVersion:2,skillReworkBuild:{ranks:{},activeSlots:[null,null,null]},skillAscensions:{rebirthCount:1,choices:[null,null,null,null,null],selectionOpen:true}});
test('rebirth action commits progression, skill receipt and resource revision together; replay cannot repeat reset',()=>{
 const old=base(),issued=applySkillSaveActionOnce(old,{kind:'begin_rebirth'},id);
 assert.equal(issued.accepted,true);const s=issued.save;
 assert.equal(s.level,1);assert.equal(s.exp,0);assert.equal(s.rebirthCount,1);assert.equal(s.rebirthPoints,3);
 assert.deepEqual(s.items,[]);assert.deepEqual(s.loadouts,{1:[],2:[]});assert.deepEqual(s.mails,[]);
 assert.deepEqual(s.mapBestFloors,{1:1});assert.equal(s.adminRevision,8);assert.equal(s._lastRebirthRevision,8);
 assert.equal(s.gold,500);assert.equal(s.yuanbao,100);assert.equal(s.enhanceStones,10);
 assert.equal(invalidSaveField(s),null);assert.equal(old.level,100);
 const later={...s,gold:550,exp:73,dailyKills:1};
 const replay=applySkillSaveActionOnce(later,{kind:'begin_rebirth'},id);
 assert.equal(replay.accepted,false);assert.equal(replay.save,later);assert.equal(replay.save.rebirthPoints,3);
});
test('first kill, level up and new drop after atomic rebirth remain valid',()=>{
 const s=applySkillSaveActionOnce(base(),{kind:'begin_rebirth'},id).save;
 for(const gained of [{exp:73,dailyKills:1},{level:2,exp:10,dailyKills:2,items:[gear()]}]){
  const saved=validateSaveTransition({...s,...gained},s,at+10000,at);
  assert.equal(saved.rebirthCount,1);assert.equal(saved.rebirthPoints,3);
 }
 assert.throws(()=>validateSaveTransition({...s,rebirthCount:2},s,at+10000,at),e=>e instanceof SaveIntegrityError&&e.reason==='unissued_rebirth');
});
test('only server-issued unfinished rebirths recover once, preserving permanent resources and talent investments',()=>{
 const old={...pending(),rebirthPoints:4,rebirthTalents:{power:2},gemInventory:[{gemId:'redIron',tier:'beginner',quantity:3}],selectedAppearance:'none',ownedTitles:['none']};
 const saved=finalizePendingRebirth(old,at);
 assert.notEqual(saved,old);assert.equal(saved.rebirthPoints,7);assert.deepEqual(saved.rebirthTalents,old.rebirthTalents);
 for(const field of ['gold','yuanbao','gemInventory','selectedAppearance','ownedTitles'])assert.deepEqual(saved[field],old[field]);
 assert.equal(finalizePendingRebirth(saved,at+1000),saved);
 for(const patch of [{_lastSkillRebirthLegacyCount:undefined},{level:99},{mapBestFloors:{}},{mapBestFloors:{9:'30'}},{mapBestFloors:{9:29}},{skillAscensions:{rebirthCount:0}},{skillAscensions:{rebirthCount:2}},{rebirthPoints:Number.MAX_SAFE_INTEGER},{adminRevision:Number.MAX_SAFE_INTEGER}]){
  const s={...old,...patch};assert.equal(finalizePendingRebirth(s,at),s);
 }
 // A post-cutover ascension count may trail the legacy progression count.
 const migrated={...pending(),rebirthCount:2,_lastSkillRebirthLegacyCount:2};
 assert.equal(finalizePendingRebirth(migrated,at).rebirthCount,3);
 assert.equal(applySkillSaveActionOnce({...base(),mapBestFloors:{}},{kind:'begin_rebirth'},id),null);
});
test('stale pre-rebirth whole saves cannot resurrect old gear or maps, nor mint the revision marker',()=>{
 const old=base(),server=applySkillSaveActionOnce(old,{kind:'begin_rebirth'},id).save;
 assert.equal(preserveServerResourceRevision(old,server),null);
 const fresh=preserveServerResourceRevision({...server,_lastRebirthRevision:0},server);
 assert.equal(fresh._lastRebirthRevision,8);assert.equal(fresh.level,1);
 const unissued=preserveServerResourceRevision({...old,_lastRebirthRevision:999},old);
 assert.equal(Object.hasOwn(unissued,'_lastRebirthRevision'),false);
 assert.equal(Object.hasOwn(preserveServerResourceRevision({_lastRebirthRevision:999},null),'_lastRebirthRevision'),false);
});
test('concurrent recovery commits once with version and active session, leaving a recoverable pre-reset snapshot',()=>{
 const d=new DatabaseSync(':memory:');d.exec('CREATE TABLE saves(version INTEGER,payload TEXT); CREATE TABLE snapshots(payload TEXT); CREATE TABLE sessions(id TEXT,active INTEGER);');
 const old=pending(),first=finalizePendingRebirth(old,at),second=finalizePendingRebirth(old,at);
 d.prepare('INSERT INTO saves VALUES(0,?)').run(JSON.stringify(old));d.exec("INSERT INTO sessions VALUES('current',1)");
 d.prepare('INSERT INTO snapshots VALUES(?)').run(JSON.stringify(old));
 const write=s=>d.prepare("UPDATE saves SET version=version+1,payload=? WHERE version=0 AND EXISTS(SELECT 1 FROM sessions WHERE id='current' AND active=1)").run(JSON.stringify(s)).changes;
 assert.equal(write(first),1);assert.equal(write(second),0);
 assert.equal(JSON.parse(d.prepare('SELECT payload FROM saves').get().payload).rebirthPoints,3);
 assert.equal(JSON.parse(d.prepare('SELECT payload FROM snapshots').get().payload).level,100);
 d.exec("UPDATE sessions SET active=0; UPDATE saves SET version=0");assert.equal(write(second),0);d.close();
 const route=readFileSync(new URL('../app/api/save/route.ts',import.meta.url),'utf8');
 const branch=route.slice(route.indexOf('const recovered=finalizePendingRebirth'),route.indexOf('// Preserve the pre-cutover'));
 assert.match(branch,/kind:"rebirth_recovery"/);assert.match(branch,/eq\(gameSaves.updatedAt,save.updatedAt\),activeSaveSession/);
});
test('maximum legendary treasure blessing is valid on every map, but excess power is still rejected',()=>{
 for(let map=1;map<=9;map++){
  const s={...base(),level:1,combatPower:1406,exp:0,items:[],loadouts:{1:[],2:[]},mapId:map};
  const g={...gear(map,4),power:dropPowerRange(map,4).maximum+38};g.affixes=rollAffixes(g);
  assert.equal(validateSaveTransition({...s,items:[g]},s,at+10000,at).items[0].power,g.power);
  assert.throws(()=>validateSaveTransition({...s,items:[{...g,power:g.power+1}]},s,at+10000,at),e=>e.reason==='forged_equipment_power');
 }
});
test('unchanged legacy loadout refs are repaired without deleting gear; newly injected bad slots still fail',()=>{
 const s={items:[gear(),{...gear(),id:124}],loadouts:{1:[123,124,999],2:[999,123]}};
 const repaired=repairInheritedLoadout({...s},s);
 assert.deepEqual(repaired.loadouts,{1:[123],2:[123]});assert.equal(repaired.items,s.items);
 assert.deepEqual(s.loadouts[1],[123,124,999]);assert.deepEqual(safeLoadouts(s),repaired.loadouts);
 const bad={...s,loadouts:{1:[123,124],2:[]}};assert.equal(repairInheritedLoadout(bad,s),bad);
 const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 assert.match(page,/setLoadouts\(old=>\(\{1:old\[1\].filter\(id=>id!==item.id\),2:old\[2\].filter\(id=>id!==item.id\)\}\)\)/);
});
test('rejected saves use bounded in-game reload with cancelled stale reads, without forcing the browser out',()=>{
 const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 assert.match(page,/if\(!integrityRecoveryUsedRef.current\)\{integrityRecoveryUsedRef.current=true;retry\(\);\}/);
 assert.match(page,/label:"重新同步"/);assert.match(page,/cancelled=true;controller.abort\(\)/);
 assert.doesNotMatch(page,/window.location.reload\(\)/);
 assert.match(page,/if\(result.save\)\{setSaveReady\(false\);setBattleOn\(false\);setSaveReloadTick/);
});

test('a new drop enhanced before its first save pays the complete path, without exempting unfunded or forged gear',async()=>{
 const {enhancementGoldCost,enhancementStoneCost}=await import('../app/balance.ts');
 const g={...gear(1,0),enhance:3};
 const gold=[1,2,3].reduce((v,n)=>v+enhancementGoldCost(n,g),0),stones=[1,2,3].reduce((v,n)=>v+enhancementStoneCost(n),0);
 const s={...base(),items:[],loadouts:{1:[],2:[]},gold,enhanceStones:stones};
 // The already-issued budget covers just the drop, never the strengthening costs.
 s._saveIntegrity={at,credits:{items:1}};
 const incoming={...s,gold:0,enhanceStones:0,items:[g]};
 assert.equal(validateSaveTransition(incoming,s,at,at).items[0].enhance,3);
 assert.throws(()=>validateSaveTransition({...incoming,enhanceStones:1},s,at,at),e=>e.reason==='unfunded_enhancement');
 assert.throws(()=>validateSaveTransition({...incoming,items:[{...g,power:999999}]},s,at,at),e=>e.reason==='forged_equipment_power');
 assert.throws(()=>validateSaveTransition({...incoming,items:[{...g,reforgeCount:1}]},s,at,at),e=>e.reason==='unissued_reforge');
});

test('real client legacy cleanup agrees with server validation; arbitrary valid rerolls remain rejected',async()=>{
 const {normalizeSceneItem:normalize}=await import('../app/character-power.ts');
 const {canonicalAffixes}=await import('../app/equipment-affixes.ts');
 assert.deepEqual(normalize({...gear(1,3),affixes:undefined}).affixes,[]);
 const g={...gear(1,3),affixes:['攻擊力 +1','元寶掉率 +1%','精英傷害 +1%']};
 const s={...base(),items:[g]},next=JSON.parse(JSON.stringify(normalize(g)));
 assert.ok(!next.affixes.some(a=>a.startsWith('元寶掉率')));
 assert.deepEqual(next.affixes,canonicalAffixes(g));
 assert.equal(validateSaveTransition({...s,items:[next]},s,at,at).items.length,1);
 const tampered={...next,affixes:[...next.affixes,'金幣 +1%']};
 assert.throws(()=>validateSaveTransition({...s,items:[tampered]},s,at,at),e=>e.reason==='unissued_reforge');
 const issued= (await import('../app/equipment-save-policy.ts')).applyEquipmentAction({...s,gold:100000,reforgeStones:100,adminRevision:0},{id:crypto.randomUUID(),kind:'reforge',itemId:g.id});
 assert.ok(issued.accepted);
 assert.doesNotThrow(()=>validateSaveTransition({...issued.save,items:[JSON.parse(JSON.stringify(normalize(issued.item)))]},issued.save,at,at));
});
