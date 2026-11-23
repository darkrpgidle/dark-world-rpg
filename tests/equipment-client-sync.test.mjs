import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
const start=page.indexOf('  const submitEquipmentAction = async ');
const end=page.indexOf('\n  const reforge =',start);
assert.ok(start>=0&&end>start);
const actionCode=stripTypeScriptTypes(page.slice(start,end));

function fixture(){
 let gold=100000,stones=100,revision=0,prioritySaves=0;
 let items=[{id:123,name:'舊劍',quality:'傳奇',reforgeCount:0,affixes:['攻擊 +10']}];
 const requests=[],messages=[];
 const env={currentItem:items[0],saveReady:true,sessionSuperseded:false,playerId:'player',loginId:'session',
  crypto:{randomUUID:()=>crypto.randomUUID()},loginHeaders:()=>({}),
  gemActionBusyRef:{current:false},gemPendingRef:{current:null},equipmentPendingRef:{current:null},equipmentBusyRef:{current:false},saveInFlightRef:{current:false},
  skillActionInFlightRef:{current:false},shopPurchaseInFlightRef:{current:false},offlineClaimPendingRef:{current:false},
  setEquipmentBusy:()=>{},setSaveStatus:()=>{},setSaveUpdatedAt:()=>{},pushLog:()=>{},pauseSupersededSession:()=>{},
  requestPrioritySave:()=>{prioritySaves++;},
  setItems:fn=>{items=fn(items);env.currentItem=items[0];},setGold:fn=>{gold=fn(gold);},
  setReforgeStones:fn=>{stones=fn(stones);},setAdminRevision:value=>{revision=value;},
  toast:Object.fromEntries(['info','error','success'].map(kind=>[kind,(message)=>messages.push({kind,message})])),
  async fetch(url,options){
   const action=JSON.parse(options.body).equipmentAction;requests.push(action);
   return Response.json({ok:true,item:{...items[0],reforgeCount:items[0].reforgeCount+1,affixes:[`攻擊 +${requests.length+10}`]},
    receipt:{gold:600,stones:1},adminRevision:revision+1,updatedAt:`version-${revision+1}`});
  },
 };
 vm.createContext(env);vm.runInContext(`${actionCode};globalThis.submit=submitEquipmentAction;`,env);
 return {env,requests,messages,submit:(...args)=>env.submit(...args),
  get state(){return {gold,stones,revision,items,prioritySaves};}};
}

test('consecutive successful reforges update results and costs without requesting another priority snapshot',async()=>{
 const f=fixture();await f.submit('reforge');await f.submit('reforge',1);await f.submit('reforge');
 assert.equal(f.requests.length,3);assert.equal(new Set(f.requests.map(a=>a.id)).size,3);
 assert.equal(f.state.items[0].reforgeCount,3);assert.equal(f.state.gold,98200);
 assert.equal(f.state.stones,97);assert.equal(f.state.revision,3);assert.equal(f.state.prioritySaves,0);
 assert.equal(f.env.equipmentPendingRef.current,null);assert.equal(f.env.equipmentBusyRef.current,false);
 assert.equal(f.messages.filter(m=>m.kind==='success').length,3);
});

test('clicks during an existing snapshot do not queue further priority snapshots',async()=>{
 const f=fixture();f.env.saveInFlightRef.current=true;
 await f.submit('reforge');await f.submit('reforge');
 assert.equal(f.requests.length,0);assert.equal(f.state.prioritySaves,0);
 f.env.saveInFlightRef.current=false;await f.submit('reforge');assert.equal(f.requests.length,1);
});

test('unknown equipment outcomes retain the same request id and prevent overlapping actions',async()=>{
 const f=fixture();const success=f.env.fetch;let fail=true;
 f.env.fetch=async(...args)=>{if(fail)throw new TypeError('offline');return success(...args);};
 await f.submit('reforge');const id=f.env.equipmentPendingRef.current.id;
 assert.equal(f.state.gold,100000);assert.equal(f.env.equipmentBusyRef.current,false);
 await f.submit('drill');assert.equal(f.env.equipmentPendingRef.current.id,id);
 fail=false;await f.submit('reforge');assert.equal(f.requests[0].id,id);
 assert.equal(f.state.stones,99);assert.equal(f.env.equipmentPendingRef.current,null);
});
