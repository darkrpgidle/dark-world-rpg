import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('./')&&!s.endsWith('.ts')?`${s}.ts`:s,c)}});
const {emptyElementSigilVisual,updateElementSigilVisual,elementSigilUv}=await import('../app/element-sigil-frames.ts');
const snapshot=(extra={})=>({target:'enemy',expiresAt:8000,ascended:false,firstAnomalyUsed:false,...extra});
test('landed cast attaches after travel without extending actual debuff lifetime',()=>{
 const next=updateElementSigilVisual(emptyElementSigilVisual(),snapshot(),1000,{name:'元素蝕印',hit:true,statuses:['elementSigil']});
 assert.equal(next.castAt,1000);assert.equal(next.attachedAt,1300);assert.equal(next.expiresAt,8000);
});
test('a missed cast cannot create a sigil, and does not remove a previous mark',()=>{
 const missing=updateElementSigilVisual(emptyElementSigilVisual(),snapshot({expiresAt:0}),1000,{name:'元素蝕印',hit:false,statuses:[]});
 assert.equal(missing.attachedAt,0);assert.equal(missing.expiresAt,0);assert.equal(missing.castHit,false);
 const existing=updateElementSigilVisual(emptyElementSigilVisual(),snapshot(),1000);
 const missed=updateElementSigilVisual(existing,snapshot(),2000,{name:'元素蝕印',hit:false,statuses:[]});
 assert.equal(missed.attachedAt,1000);assert.equal(missed.expiresAt,8000);
});
test('successful anomalies pulse corresponding elements after projectile contact, with chaos once',()=>{
 const first=updateElementSigilVisual(emptyElementSigilVisual(),snapshot({ascended:true}),1000);
 const next=updateElementSigilVisual(first,snapshot({ascended:true,firstAnomalyUsed:true}),2000,{name:'霜火新星',hit:true,statuses:['freeze']});
 assert.deepEqual(next.pulses,{freeze:3240});assert.equal(next.chaosAt,3240);
 const repeated=updateElementSigilVisual(next,snapshot({ascended:true,firstAnomalyUsed:true}),4000,{name:'閃電鏈',hit:true,statuses:['paralysis']});
 assert.equal(repeated.pulses.paralysis,4500);assert.equal(repeated.chaosAt,3240);
});
test('ordinary target changes clear old pending elemental pulses and chaos',()=>{
 const old={...emptyElementSigilVisual(),target:'enemy',expiresAt:8000,pulses:{burn:7000},chaosAt:7000};
 const next=updateElementSigilVisual(old,snapshot({target:'next',expiresAt:0}),4000);
 assert.equal(next.expiresAt,0);assert.deepEqual(next.pulses,{});assert.equal(next.chaosAt,0);assert.equal(next.castAt,0);
});
test('expiry keeps its original timestamp for fading instead of restarting the mark',()=>{
 const first=updateElementSigilVisual(emptyElementSigilVisual(),snapshot(),1000);
 const expired=updateElementSigilVisual(first,snapshot({expiresAt:0}),8100);
 assert.equal(expired.expiresAt,8000);assert.equal(expired.attachedAt,1000);
});
test('24 UV rectangles have padding and remain inside their own atlas cells',()=>{
 for(let i=0;i<24;i++){const [x,y,w,h]=elementSigilUv(i);assert.ok(x>=0&&y>=0&&x+w<=1&&y+h<=1);assert.ok(w<1/6&&h<1/4)}
});
