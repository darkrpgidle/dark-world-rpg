import assert from 'node:assert/strict';
import test from 'node:test';
import {createAssetWorkBudget} from '../app/asset-work-budget.ts';

test('small preparation chunks share a bounded slice instead of yielding on every row group',async()=>{
 let clock=0,yields=0;
 const work=createAssetWorkBudget(undefined,{now:()=>clock,yieldTask:async()=>{yields++;},budgetMs:4});
 for(let i=0;i<2000;i++){clock+=.05;await work();}
 assert.ok(yields>=24&&yields<=25,`${yields} yields for 100ms of work`);
});
test('slow work yields at the next boundary and a delayed browser task does not consume the next slice',async()=>{
 let clock=0,yields=0;
 const work=createAssetWorkBudget(undefined,{now:()=>clock,yieldTask:async()=>{yields++;clock+=1000;}});
 clock=8;await work();assert.equal(yields,1);
 clock+=3;await work();assert.equal(yields,1);
 clock+=2;await work();assert.equal(yields,2);
});
test('cancellation rejects before work, during a pending yield, and between short chunks',async()=>{
 for(const at of ['before','during','between']){
  const controller=new AbortController();let clock=0,yields=0;
  const work=createAssetWorkBudget(controller.signal,{now:()=>clock,yieldTask:async()=>{yields++;controller.abort();}});
  if(at==='during')clock=4;else{if(at==='between')await work();controller.abort();}
  await assert.rejects(work(),{name:'AbortError'});assert.equal(yields,at==='during'?1:0);
 }
});
test('native task scheduling and timer fallback both complete and preserve the scheduler receiver',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'scheduler');
 try{
  for(const native of [true,false]){
   let clock=0,calls=0;
   const scheduler={async yield(){assert.equal(this,scheduler);calls++;}};
   Object.defineProperty(globalThis,'scheduler',{value:native?scheduler:undefined,configurable:true});
   const work=createAssetWorkBudget(undefined,{now:()=>clock});clock=5;await work();assert.equal(calls,native?1:0);
  }
 }finally{if(descriptor)Object.defineProperty(globalThis,'scheduler',descriptor);else delete globalThis.scheduler;}
});
