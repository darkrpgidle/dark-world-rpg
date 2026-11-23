import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes,registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[cm]?[jt]sx?$/.test(s)?`${s}.ts`:s,c)}});
const {applyGemAction}=await import('../app/gem-save-policy.ts');
const {gemInventoryDelta,normalizeGemInventory}=await import('../app/gem-system.ts');
const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
const start=page.indexOf('  const runGemAction ='),end=page.indexOf('  const socketSelectedGem =',start);
assert.ok(start>=0&&end>start);
const actionCode=stripTypeScriptTypes(page.slice(start,end));
const input={kind:'fuse',targetLevel:2,reserve:0,maxMaterials:2};
function fixture(){
 let inventory=[{gemId:'redIron',tier:'beginner',quantity:4}],server={gemInventory:structuredClone(inventory),items:[],gemPowder:0},snapshots=0;
 const requests=[];let held,release,lose=false;
 const env={gemInventory:inventory,playerId:'player',loginId:'session',saveReady:true,sessionSuperseded:false,crypto,
  normalizeGemInventory,gemInventoryDelta,Date,loginHeaders:()=>({}),
  gemSessionRef:{current:{playerId:'player',loginId:'session',saveReady:true,sessionSuperseded:false}},gemContextEpochRef:{current:1},
  gemActionBusyRef:{current:false},gemPendingRef:{current:null},lastSavedGemInventoryRef:{current:structuredClone(inventory)},
  equipmentBusyRef:{current:false},equipmentPendingRef:{current:null},skillActionInFlightRef:{current:false},
  shopPurchaseInFlightRef:{current:false},offlineClaimPendingRef:{current:false},
  prioritySaveRef:{current:false},saveInFlightRef:{current:false},saveRequestIdRef:{current:null},
  window:{setTimeout:fn=>queueMicrotask(fn)},setGemActionBusy:()=>{},setGemPending:()=>{},setEquipmentBusy:()=>{},
  setSaveStatus:()=>{},setSaveUpdatedAt:()=>{},setGemPowder:()=>{},setGemRevision:()=>{},setItems:()=>{},pauseSupersededSession:()=>{},
  toast:{success:()=>{},error:()=>{}},pushLog:()=>{},
  setGemInventory:fn=>{inventory=fn(inventory);env.gemInventory=inventory;},
  requestPrioritySave(){snapshots++;server.gemInventory=structuredClone(inventory);env.lastSavedGemInventoryRef.current=structuredClone(inventory);},
  async saveJsonWithTimeout(url,options){
   const a=JSON.parse(options.body).gemAction;requests.push(a);
   const result=applyGemAction(server,a,()=>0);assert.ok(result);server=result.save;
   if(held)await held;
   if(lose){lose=false;throw new Error('injected_lost_response');}
   return {response:{ok:true,status:200},result:{ok:true,accepted:result.accepted,gemInventory:server.gemInventory,items:server.items,gemPowder:0,gemRevision:server._gemRevision,summary:result.summary}};
  },
 };
 vm.createContext(env);vm.runInContext(`${actionCode};globalThis.run=runGemAction`,env);
 return {env,requests,run:()=>env.run(input),get inventory(){return inventory;},get snapshots(){return snapshots;},
  hold(){held=new Promise(resolve=>release=resolve);},release(){release();},lose(){lose=true;},drop(){inventory=[...inventory,{gemId:'thorns',tier:'beginner',quantity:1}];env.gemInventory=inventory;},
  async flush(){for(let i=0;i<12;i++)await Promise.resolve();}};
}
test('gem action drains snapshot, reserves simultaneous clicks, and preserves new drops during response',async()=>{
 const f=fixture();f.hold();const first=f.run();await f.flush();assert.equal(f.requests.length,1);
 await assert.rejects(f.run(),/其他操作/);f.drop();f.release();await first;
 assert.equal(f.snapshots,1);assert.equal(f.inventory.find(g=>g.gemId==='thorns').quantity,1);
 assert.equal(f.inventory.find(g=>g.tier==='beginner'&&g.gemId==='redIron').quantity,2);
 assert.equal(f.inventory.find(g=>g.tier==='intermediate').quantity,1);assert.equal(f.env.gemPendingRef.current,null);
});
test('lost committed response retries same id without a stale snapshot or a second charge',async()=>{
 const f=fixture();f.lose();await assert.rejects(f.run(),/lost_response/);assert.ok(f.env.gemPendingRef.current);
 f.drop();await f.run();assert.equal(f.snapshots,1);assert.equal(f.requests[0].id,f.requests[1].id);
 assert.equal(f.inventory.find(g=>g.gemId==='redIron'&&g.tier==='beginner').quantity,2);
 assert.equal(f.inventory.find(g=>g.gemId==='thorns').quantity,1);assert.equal(f.env.gemPendingRef.current,null);
});
test('old transaction response after a reload cannot apply to the new canonical state',async()=>{
 const f=fixture();f.hold();const first=f.run();await f.flush();f.env.gemContextEpochRef.current++;
 f.release();await first;assert.equal(f.inventory[0].quantity,4);assert.equal(f.env.gemPendingRef.current,null);
 assert.equal(f.env.gemActionBusyRef.current,false);assert.equal(f.env.equipmentBusyRef.current,false);
});
