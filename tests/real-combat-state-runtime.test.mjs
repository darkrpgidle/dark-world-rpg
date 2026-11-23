import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {readFileSync} from 'node:fs';
import {useCombatState} from '../app/use-combat-state.ts';
async function runtime(synchronous=true){
 const original=new Map(['window','document','IS_REACT_ACT_ENVIRONMENT'].map(k=>[k,globalThis[k]]));
 const doc={nodeType:9,activeElement:null,addEventListener(){},removeEventListener(){}};
 const win={document:doc,event:undefined,HTMLIFrameElement:class{},addEventListener(){},removeEventListener(){}};doc.defaultView=win;
 globalThis.window=win;globalThis.document=doc;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 let api,view,settlements=0,allowedReads=0;const errors=[];
 function Harness(){
  const [sync,setSync]=React.useState(synchronous),[hp,setHp,readHp]=useCombatState(100,sync),[pulse,setPulse]=useCombatState(0,sync);
  const allowed=React.useEffectEvent(()=>{allowedReads++;return true;});
  view={hp,pulse};api={setSync,setHp,setPulse,readHp,attack:()=>setPulse(p=>{if(allowed()){settlements++;setHp(h=>h-10);}return p+1;})};return null;
 }
 const container={nodeType:1,ownerDocument:doc,tagName:'DIV',namespaceURI:'http://www.w3.org/1999/xhtml',addEventListener(){},removeEventListener(){},textContent:''};
 const root=createRoot(container,{onUncaughtError:e=>errors.push(e.message)});
 await React.act(async()=>flushSync(()=>root.render(React.createElement(React.StrictMode,null,React.createElement(Harness)))));
 return {read:()=>view,errors,counts:()=>({settlements,allowedReads}),api:()=>api,
  async act(fn){await React.act(async()=>fn(api));},
  async cleanup(){await React.act(async()=>flushSync(()=>root.unmount()));for(const[k,v]of original){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
 };
}

test('real React StrictMode batches simultaneous actions without replaying combat, reading Effect Events in render, or losing HP',async()=>{
 const r=await runtime();try{
  await r.act(api=>{api.attack();api.attack();api.setHp(h=>Math.min(100,h+5));api.attack();assert.equal(api.readHp(),75,"combat reads settled HP before a React commit");});
  assert.deepEqual(r.errors,[]);assert.deepEqual(r.read(),{hp:75,pulse:3});assert.deepEqual(r.counts(),{settlements:3,allowedReads:3});
  await r.act(api=>{api.setHp(100);api.setPulse(0);api.attack();});assert.deepEqual(r.read(),{hp:90,pulse:1});assert.equal(r.counts().settlements,4);
 }finally{await r.cleanup();}
});
test('ordinary-to-real load and real-to-ordinary transitions retain the latest committed HP',async()=>{
 const r=await runtime(false);try{
  await r.act(api=>{api.setHp(63);api.setSync(true);});
  await r.act(api=>api.attack());assert.deepEqual(r.read(),{hp:53,pulse:1});assert.deepEqual(r.errors,[]);
  await r.act(api=>{api.setHp(88);api.setSync(false);});await r.act(api=>api.setHp(h=>h-3));assert.equal(r.read().hp,85);
  await r.act(api=>api.setSync(true));await r.act(api=>api.attack());assert.equal(r.read().hp,75);
 }finally{await r.cleanup();}
});
test('actual Game wires all three replay-sensitive tower state setters to the synchronous real combat hook',()=>{
 const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 for(const [name,value]of [['enemyHp',100],['playerHp',100],['battlePulse',0]]){const read=name==='enemyHp'?',readEnemyHp':name==='playerHp'?',readPlayerHp':'';assert.ok(page.includes(`const [${name}, set${name[0].toUpperCase()+name.slice(1)}${read}] = useCombatState(${value},realMode);`));}
});
