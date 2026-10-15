import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import ts from 'typescript';
import {collectCombatFloats} from '../app/combat-float-events.ts';
import {CombatFloatLayout} from '../app/combat-float-layout.ts';
import {presentEnemyDamage} from '../app/combat-health-presentation.ts';
const source=readFileSync(new URL('../app/combat-damage-layer.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.React,jsxFactory:'jsx'}}).outputText.replace(/import\s*\{([^}]+)\}\s*from\s*"[^"]+";/g,(_,names)=>`const {${names}}=globalThis.__floatRuntime;`);
let serial=0;
const empty=()=>({groups:[],elementals:[],dots:[],player:null,enemy:null,miss:null,counter:null,boss:false});
async function runtime({strict=false,reduced=false,onShown}={}){
 const keys=['window','document','performance','ResizeObserver','requestAnimationFrame','cancelAnimationFrame','IS_REACT_ACT_ENVIRONMENT','__floatRuntime'];
 const original=new Map(keys.map(k=>[k,globalThis[k]]));
 let now=1000,frames=new Map(),frameId=0,staged=[],rendered=[],resize,token='tower:1',enabled=true,input=empty();
 const errors=[],notifications=[];
 const onDamageShown=(events,token)=>{notifications.push({events,token});onShown?.(events,token);};
 const doc={nodeType:9,activeElement:null,addEventListener(){},removeEventListener(){},createElement(){return {getContext(){return {measureText(s){return {width:s.length*13};}};}};}};
 const win={document:doc,event:undefined,HTMLIFrameElement:class{},addEventListener(){},removeEventListener(){},matchMedia(){return {matches:reduced};}};
 doc.defaultView=win;
 const stage={querySelector(s){return {getBoundingClientRect(){return {left:s.includes('enemy')?240:35,top:10,width:65,height:210};}};}};
 const layer={clientWidth:360,clientHeight:280,closest(){return stage;},getBoundingClientRect(){return {left:0,top:0,width:360,height:280};}};
 globalThis.window=win;globalThis.document=doc;globalThis.performance={now:()=>now,measure(){},mark(){},clearMeasures(){},clearMarks(){}};globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 globalThis.ResizeObserver=class{constructor(fn){resize=fn;}observe(){}disconnect(){}};
 globalThis.requestAnimationFrame=fn=>{frames.set(++frameId,fn);return frameId;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
 globalThis.__floatRuntime={useEffect:React.useEffect,useLayoutEffect:React.useLayoutEffect,useRef:React.useRef,useState:React.useState,CombatFloatLayout,collectCombatFloats,
 jsx(type,props){if(typeof type==='function'&&props.item)staged.push(props.item);
 if(type==='div'&&props.ref){props.ref.current=layer;rendered=staged;staged=[];}return null;}};
 const mod=await import(`data:text/javascript;base64,${Buffer.from('const {jsx}=globalThis.__floatRuntime;\n'+compiled+`\n//${++serial}`).toString('base64')}`);
 const container={nodeType:1,ownerDocument:doc,tagName:'DIV',namespaceURI:'http://www.w3.org/1999/xhtml',addEventListener(){},removeEventListener(){},textContent:''};
 const root=createRoot(container,{onUncaughtError:e=>errors.push(e.message)});
 const render=()=>root.render(strict?React.createElement(React.StrictMode,null,React.createElement(mod.CombatDamageLayer,{inputs:input,resetToken:token,enabled,onDamageShown})):React.createElement(mod.CombatDamageLayer,{inputs:input,resetToken:token,enabled,onDamageShown}));
 await React.act(async()=>{flushSync(render);});
 return {errors,read:()=>rendered,notifications:()=>notifications,
 async update(i,{reset=token,on=enabled}={}){input=i;token=reset;enabled=on;await React.act(async()=>{flushSync(render);});},
 async step(t){now=t;await React.act(async()=>{const pending=[...frames.values()];frames.clear();for(const fn of pending)fn(now);});},
 pending:()=>frames.size,
 async resize(){resize();},
 async cleanup(){await React.act(async()=>{flushSync(()=>root.unmount());});assert.equal(frames.size,0);for(const[k,v]of original){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
 };
}
for(const strict of [false,true])test(`real React ${strict?'StrictMode':'client'} layer captures each hit once and cleans its frame loop`,async()=>{
 const r=await runtime({strict});try{await r.step(1000);const i=empty();i.groups=[{key:1,hits:[{damage:123456,critical:true,delayMs:0}]}];
 await r.update(i);await r.step(1000);assert.deepEqual(r.errors,[]);assert.equal(r.read().length,1);assert.equal(r.read()[0].text,'-123,456');
 await r.update({...i});await r.step(1050);assert.equal(r.read().length,1);assert.equal(r.read()[0].born,1000);
 await r.step(1810);assert.equal(r.read().length,0);assert.equal(r.pending(),0);assert.deepEqual(r.errors,[]);
 }finally{await r.cleanup();}
});
test('source cleanup does not cancel a queued hit; reset discards stale displays and accepts new reused legacy keys',async()=>{
 const r=await runtime();try{await r.step(1000);const i=empty();i.groups=[{key:1,hits:[{damage:12,critical:false,delayMs:110}]}];
 await r.update(i);await r.step(1000);assert.equal(r.read().length,0);await r.update(empty());await r.step(1110);assert.equal(r.read().length,1);
 await r.update(i,{reset:'boss:1'});await r.step(1120);assert.equal(r.read().length,0);
 const j=empty();j.groups=[{key:1,hits:[{damage:34,critical:false,delayMs:0}]}];await r.update(j);await r.step(1120);
 assert.equal(r.read()[0].text,'-34');assert.deepEqual(r.errors,[]);
 }finally{await r.cleanup();}
});
test('session supersession cancels pending numbers and does not replay them on re-enable',async()=>{
 const r=await runtime({reduced:true});try{await r.step(1000);const i=empty();i.groups=[{key:1,hits:[{damage:12,critical:false,delayMs:100}]}];
 await r.update(i);await r.step(1000);await r.update(i,{on:false});await r.step(1100);assert.equal(r.read().length,0);assert.equal(r.pending(),0);
 await r.update(i,{on:true});await r.step(1200);assert.equal(r.read().length,0);assert.deepEqual(r.errors,[]);
 }finally{await r.cleanup();}
});

test('health presentation and each delayed number update on the same real React frame, once in StrictMode',async()=>{
 let hp=100;const r=await runtime({strict:true,onShown:events=>{hp=presentEnemyDamage(hp,100,events,40);}});
 try{
  await r.step(1000);const i=empty();i.groups=[{key:8,hits:[{damage:20,critical:false,delayMs:100},{damage:10,critical:false,delayMs:210},{damage:30,critical:false,delayMs:350}]}];
  await r.update(i);assert.equal(hp,100);await r.step(1099);assert.equal(hp,100);assert.equal(r.read().length,0);
  await r.step(1100);assert.equal(hp,80);assert.ok(r.read().some(item=>item.damage===20));
  await r.update({...i});await r.step(1209);assert.equal(hp,80);
  await r.step(1210);assert.equal(hp,70);assert.ok(r.read().some(item=>item.damage===10));
  await r.step(1350);assert.equal(hp,40);assert.ok(r.read().some(item=>item.damage===30));
  await r.resize();await r.step(1360);assert.equal(hp,40);assert.equal(r.notifications().length,3);assert.deepEqual(r.errors,[]);
 }finally{await r.cleanup();}
});
test('switching targets or superseding the session cannot deliver old damage to the new health bar',async()=>{
 const r=await runtime();try{
  await r.step(1000);const i=empty();i.groups=[{key:1,hits:[{damage:90,critical:false,delayMs:300}]}];await r.update(i);
  await r.update(empty(),{reset:'new-target'});await r.step(1400);assert.equal(r.notifications().length,0);
  const j=empty();j.groups=[{key:2,hits:[{damage:10,critical:false,delayMs:100}]}];await r.update(j);
  await r.update(j,{on:false});await r.step(1600);assert.equal(r.notifications().length,0);
 }finally{await r.cleanup();}
});

test('six rapid volley callbacks use compact measured text and update HP on each same frame',async()=>{
 let hp=100;const r=await runtime({strict:true,onShown:events=>{hp=presentEnemyDamage(hp,100,events,40);}});
 try{
  await r.step(1000);
  for(let index=0;index<6;index++){
   const i=empty();i.groups=[{key:index,skillName:'疾風連射',hits:[{damage:10,critical:index===2,label:index===5?'六重風葬':undefined,delayMs:0}]}];
   await r.update(i);assert.equal(hp,100-index*10);
   await r.step(1190+index*70);assert.equal(hp,90-index*10);
   const item=r.read().find(x=>x.label===(index===5?'六重風葬':'疾風連射')&&x.born===1190+index*70);
   assert.ok(item);assert.equal(item.font,index===5?30:index===2?26:23);
   assert.equal(item.duration,950);assert.equal(item.travel,18);
  }
  assert.equal(r.notifications().length,6);assert.deepEqual(r.errors,[]);
 }finally{await r.cleanup();}
});
