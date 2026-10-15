import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import test from 'node:test';
import {isDuplicateSaveSnapshot} from '../app/save-sync-disposition.ts';
const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
const start=page.indexOf('  useEffect(() => {\n    if (!saveReady || !playerId || sessionSuperseded || adminOpen');
const end=page.indexOf('\n  }, [',start);
assert.ok(start>=0&&end>start);
const effect=page.slice(start+'  useEffect(() => {'.length,end);
const debounce=Number(page.match(/const SAVE_DEBOUNCE_MS = ([\d_]+)/)[1].replaceAll('_',''));
const maxInterval=Number(page.match(/const SAVE_MAX_INTERVAL_MS = ([\d_]+)/)[1].replaceAll('_',''));
function fixture(){
 let now=1000, timerId=0;const timers=new Map(),storage=new Map(),requests=[];
 const statuses=[],battles=[],reloads=[];
 const env={worldBossMailDeliveryId:'delivery-test',saveReady:true,playerId:'test-player',sessionSuperseded:false,adminOpen:false,
  skillActionBusy:false,offlineClaimPending:false,equipmentBusy:false,
  activeBossBattle:null,enemyHp:100,playerHp:100,battleOn:true,
  SAVE_DEBOUNCE_MS:debounce,SAVE_MAX_INTERVAL_MS:maxInterval,
  Date:{now:()=>now},crypto:{randomUUID:()=>`request-${requests.length}`},
  sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  setTimeout(fn,ms){const id=++timerId;timers.set(id,{at:now+ms,fn});return id;},clearTimeout:id=>timers.delete(id),
  setSaveStatus:value=>statuses.push(value),loginId:'session',loginHeaders:()=>({}),
  normalizeSceneItem:x=>x,safeLoadouts:()=>[],items:[],loadouts:[],
  PERSONAL_BOSS_RESET_VERSION:'test',WORLD_BOSS_RESET_VERSION:'test',
  setSaveRetryTick(fn){env.saveRetryTick=fn(env.saveRetryTick??0);},
  setSaveUpdatedAt:()=>{},reconcileStoredTime:()=>{},pauseSupersededSession:()=>{},
  setSaveReady:v=>{env.saveReady=v;},setBattleOn:v=>battles.push(v),setSaveReloadTick:fn=>reloads.push(fn(0)),
  toast:{error:()=>{}},
  fetch(url,options){let resolve,reject;const promise=new Promise((res,rej)=>{resolve=res;reject=rej;});requests.push({url,options,resolve,reject});return promise;},
 };
 // Supply the page's payload state, while preserving the explicit controls above.
 const payload=effect.slice(effect.indexOf('const payload = {'),effect.indexOf('saveJsonWithTimeout("/api/save"'));
 for(const match of payload.matchAll(/^        (\w+),$/gm))if(!(match[1] in env))env[match[1]]=0;
 for(const name of ['saveInFlight','saveQueued','prioritySave','offlineClaimPending','skillActionInFlight','equipmentBusy','equipmentPending','towerDeathPending','integrityRecoveryUsed'])env[`${name}Ref`]={current:false};
 for(const name of ['lastSaveStartedAt','saveSequence','saveRetryAfter','saveFailureCount'])env[`${name}Ref`]={current:0};
 for(const name of ['saveRequestId','saveClientId','lastIdleClaimId'])env[`${name}Ref`]={current:null};
 env.idleStorageClockRef={current:{epoch:0}};
 env.AbortController=AbortController;
 env.Math=Object.assign(Object.create(Math),{random:()=>0.5});
 vm.createContext(env);
 const helper=stripTypeScriptTypes(readFileSync(new URL('../app/save-request.ts',import.meta.url),'utf8')).replace('export async function','async function');
 vm.runInContext(`${helper};globalThis.saveJsonWithTimeout=saveJsonWithTimeout;`,env);
 vm.runInContext(`globalThis.runEffect=()=>{${effect}}`,env);
 const flush=async()=>{for(let n=0;n<20;n++)await Promise.resolve();};
 return {env,requests,statuses,battles,reloads,render:()=>env.runEffect(),flush,
  async advance(ms){now+=ms;for(const [id,timer]of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}await flush();},
  async success(index=0){requests[index].resolve(Response.json({ok:true,accepted:true,updatedAt:'2026-10-11T00:00:00Z'}));await flush();},
 };
}

test('unanswered autosave times out, releases the guard and schedules a bounded retry',async()=>{
 const f=fixture();f.render();await f.advance(debounce);assert.equal(f.requests.length,1);
 for(let i=0;i<100;i++){f.env.gold=i;f.render();}
 await f.advance(120000);
 assert.equal(f.env.saveInFlightRef.current,false);
 assert.equal(f.env.saveQueuedRef.current,false);
 assert.equal(f.requests.length,1);
 assert.equal(f.env.saveRetryTick,1);
 assert.equal(f.statuses.at(-1),'等待連線');
 assert.equal(f.requests[0].options.signal.aborted,true);
 f.render();await f.advance(1400);assert.equal(f.requests.length,2);
 await f.success(1);await f.success(0);
 assert.equal(f.env.saveInFlightRef.current,false);
 assert.equal(f.battles.length,0);assert.equal(f.reloads.length,0);
});

test('when service answers again, 100 queued changes collapse to one latest snapshot and stop retrying',async()=>{
 const f=fixture();f.render();await f.advance(debounce);
 for(let i=1;i<=100;i++){f.env.gold=i;f.env.wave=i;f.render();}
 assert.equal(f.requests.length,1);
 await f.advance(10000);await f.success();
 assert.equal(f.env.saveInFlightRef.current,false);assert.equal(f.env.saveRetryTick,1);
 f.render();await f.advance(debounce);
 assert.equal(f.requests.length,2);
 const body=JSON.parse(f.requests[1].options.body);
 assert.equal(body.save.gold,100);assert.equal(body.save.wave,100);assert.equal(body.save._saveSequence,2);
 await f.success(1);await f.advance(120000);
 assert.equal(f.requests.length,2);assert.equal(f.env.saveQueuedRef.current,false);
 assert.equal(f.statuses.at(-1),'雲端已同步');assert.equal(f.battles.length,0);assert.equal(f.reloads.length,0);
});

test('network rejection releases the in-flight guard and one queued retry can recover',async()=>{
 const f=fixture();f.render();await f.advance(debounce);f.env.gold=77;f.render();
 f.requests[0].reject(new TypeError('injected network failure'));await f.flush();
 assert.equal(f.env.saveInFlightRef.current,false);assert.equal(f.statuses.at(-1),'等待連線');
 f.render();await f.advance(debounce);assert.equal(f.requests.length,2);
 assert.equal(JSON.parse(f.requests[1].options.body).save.gold,77);
 await f.success(1);assert.equal(f.statuses.at(-1),'雲端已同步');
});

test('old same-writer sequence is treated as already applied after the newer snapshot',()=>{
 const server={_saveClientId:'client',_saveSessionId:'session',_saveSequence:2,gold:100};
 assert.equal(isDuplicateSaveSnapshot({_saveClientId:'client',_saveSequence:1,gold:0},server,'session'),true);
 assert.equal(server.gold,100);
});


test('headers arrive but JSON body stalls: deadline releases the lock and a late body cannot reload or update UI',async()=>{
 const f=fixture();f.render();await f.advance(debounce);
 let completeBody;
 f.requests[0].resolve({ok:true,status:200,json:()=>new Promise(resolve=>{completeBody=resolve;})});
 await f.flush();await f.advance(15000);
 assert.equal(f.env.saveInFlightRef.current,false);assert.equal(f.statuses.at(-1),'等待連線');
 completeBody({ok:true,accepted:false,save:{gold:0}});await f.flush();
 assert.equal(f.reloads.length,0);assert.equal(f.battles.length,0);assert.equal(f.statuses.at(-1),'等待連線');
 f.render();await f.advance(1400);await f.success(1);assert.equal(f.statuses.at(-1),'雲端已同步');
});

test('repeated failures back off and never allow multiple logical saves in flight',async()=>{
 const f=fixture();f.render();await f.advance(debounce);
 for(let n=0;n<7;n++){
  f.requests[n].reject(new TypeError('offline'));await f.flush();
  const pause=Math.min(30000,1000*2**Math.min(5,n));
  f.render();await f.advance(Math.max(1400,pause)-1);assert.equal(f.requests.length,n+1);
  await f.advance(1);assert.equal(f.requests.length,n+2);
  assert.equal(f.env.saveInFlightRef.current,true);
 }
 await f.success(7);assert.equal(f.env.saveFailureCountRef.current,0);assert.equal(f.env.saveRetryAfterRef.current,0);
});
