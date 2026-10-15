import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {retainCombatCadence} from '../app/combat-cadence.ts';
import {isDuplicateSaveSnapshot} from '../app/save-sync-disposition.ts';
import {enemyDefeatPresentationDelay} from '../app/combat-health-presentation.ts';
const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
const start=page.indexOf('  const recoverPendingEnemyDefeat=useEffectEvent(()=>{');
const body=page.slice(start+'  const recoverPendingEnemyDefeat=useEffectEvent(()=>{'.length,page.indexOf('\n  });',start));
// Execute the actual main-loop recovery body with a deterministic clock.
const makeRecovery=new Function('env',`with(env){return ()=>{${body}}}`);
function fixture({volley=false}={}){
 let now=1000,kills=0;
 const token='run:1:1';
 const env={saveReady:true,sessionSuperseded:false,enemyPresentationToken:token,settledEnemyPercent:0,
  presentedEnemyPercent:0,tab:'主控',documentVisible:true,pendingEnemyDefeatRef:{current:null},
  pendingVolleyDamageRef:{current:new Map()},performance:{now:()=>now},enemyDefeatPresentationDelay,
  setPresentedEnemyHealth(fn){const state=fn({token,percent:env.presentedEnemyPercent});env.presentedEnemyPercent=state.percent;}};
 const recover=makeRecovery(env);
 return {env,recover,at(t){now=t;recover();},queue(){env.pendingEnemyDefeatRef.current={token,queuedAt:now,...(volley?{volleyKey:123}:{}),finish(){kills++;}};},kills:()=>kills};
}
test('already-zero HP loaded from cloud still finishes when a pending death is queued without changing HP',()=>{
 const f=fixture();f.recover();f.queue();f.at(1000);assert.equal(f.kills(),0);
 f.at(1119);assert.equal(f.kills(),0);f.at(1120);assert.equal(f.kills(),1);
 for(let t=1150;t<2500;t+=50)f.at(t);assert.equal(f.kills(),1);
 assert.equal(f.env.pendingEnemyDefeatRef.current,null);
 assert.match(page,/setInterval\(recoverPendingEnemyDefeat,50\)/);
});
test('one displayed HP with missing VFX is bounded and target/session checks prevent stale or unauthorized wins',()=>{
 const f=fixture();f.env.presentedEnemyPercent=1;f.queue();f.at(6999);assert.equal(f.kills(),0);
 f.at(7000);assert.equal(f.kills(),1);assert.equal(f.env.presentedEnemyPercent,0);
 for(const patch of [{saveReady:false},{sessionSuperseded:true},{settledEnemyPercent:1},{enemyPresentationToken:'other'}]){
  const g=fixture();g.queue();Object.assign(g.env,patch);g.at(10000);assert.equal(g.kills(),0);
 }
});
test('volley waits for its completed impacts and 240ms tail; hidden view does not depend on a mounted VFX',()=>{
 const f=fixture({volley:true});f.queue();f.env.pendingVolleyDamageRef.current.set(123,()=>{});
 f.at(1300);assert.equal(f.kills(),0);f.env.pendingVolleyDamageRef.current.delete(123);
 f.at(1500);f.at(1739);assert.equal(f.kills(),0);f.at(1740);assert.equal(f.kills(),1);
 const g=fixture();g.queue();g.env.documentVisible=false;g.at(1000);assert.equal(g.kills(),1);
});
test('restarting a combat effect during every sync/status render does not starve a slow attack',()=>{
 let cadence=null,attacks=0;
 for(let t=0;t<5000;t+=100){cadence=retainCombatCadence(cadence,'run:1:1');cadence.player+=100;cadence.enemy+=100;
  if(cadence.player>=2000){cadence.player%=2000;attacks++;}}
 assert.equal(attacks,2);assert.equal(cadence.player,1000);assert.equal(cadence.enemy,5000);
 const same=retainCombatCadence(cadence,'run:1:1');assert.equal(same,cadence);
 const next=retainCombatCadence(cadence,'run:1:2');assert.deepEqual(next,{token:'run:1:2',player:0,enemy:0});
 const boss={name:'boss'};const b=retainCombatCadence(null,boss);b.player=900;
 assert.equal(retainCombatCadence(b,boss).player,900);assert.equal(retainCombatCadence(b,{name:'boss'}).player,0);
 assert.match(page,/retainCombatCadence\(towerCadenceRef.current/);assert.match(page,/retainCombatCadence\(bossCadenceRef.current/);
});
test('same-session duplicate saves acknowledge without reloading, but new snapshots and rebirth barriers still reconcile',()=>{
 const server={_saveSessionId:'session',_saveClientId:'client',_saveSequence:10};
 const incoming={_saveClientId:'client',_saveSequence:10};
 assert.equal(isDuplicateSaveSnapshot(incoming,server,'session'),true);
 assert.equal(isDuplicateSaveSnapshot({...incoming,_saveSequence:9},server,'session'),true);
 for(const patch of [{_saveSequence:11},{_saveSequence:'10'},{_saveSequence:NaN},{_saveSequence:-1},{_saveSequence:0},{_saveClientId:'other'}])assert.equal(isDuplicateSaveSnapshot({...incoming,...patch},server,'session'),false);
 assert.equal(isDuplicateSaveSnapshot(incoming,server,'other-session'),false);
 assert.equal(isDuplicateSaveSnapshot(incoming,{...server,_lastRebirthRevision:3},'session'),false);
 const route=readFileSync(new URL('../app/api/save/route.ts',import.meta.url),'utf8');
 assert.match(route,/accepted:false,reason:"already_applied",updatedAt:save.updatedAt/);
 assert.match(route,/return snapshotResponse\(current,normalizedIncoming,sessionId\)/);
 assert.match(route,/activeSaveSession/);
 const layer=readFileSync(new URL('../app/combat-damage-layer.tsx',import.meta.url),'utf8');
 assert.match(layer,/useLayoutEffect\(\(\)=>\{damageShown.current=onDamageShown/);
});

test("autosaves do not capture the zero-HP window before kill rewards and next wave commit",()=>{
 assert.match(page,/if\(!activeBossBattle && enemyHp<=0 && towerDeathPendingRef.current\)return;/);
 const branch=page.slice(page.indexOf("const timer = setTimeout(() => {",page.indexOf("if (!saveReady || !playerId || sessionSuperseded || skillActionBusy")),page.indexOf("const sequenceKey ="));
 assert.ok(branch.indexOf("enemyHp<=0")<branch.indexOf("saveInFlightRef.current = true"));
});
