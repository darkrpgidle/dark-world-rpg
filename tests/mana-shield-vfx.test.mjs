import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('./')&&!s.endsWith('.ts')?`${s}.ts`:s,c)}});
const {emptyManaShieldVisual,updateManaShieldVisual,manaShieldUv}=await import('../app/mana-shield-frames.ts');
const {syncLiveCombat,resolveLiveEnemyAttack}=await import('../app/skill-live-combat.ts');
test('ordinary target changes fade shields without false break feedback',()=>{
 const first=updateManaShieldVisual(emptyManaShieldVisual(),'one',100,false,1000);
 const next=updateManaShieldVisual(first,'two',0,false,2000);
 assert.equal(next.resetAt,2000);assert.equal(next.brokenAt,0);assert.equal(next.hitAt,0);
});
test('break and same-hit passive regrant keep both visuals without losing remaining shield',()=>{
 const first=updateManaShieldVisual(emptyManaShieldVisual(),'one',100,true,1000);
 const next=updateManaShieldVisual(first,'one',50,false,2000,{activated:false,absorbed:true,broke:true,stacked:true});
 assert.equal(next.value,50);assert.equal(next.hitAt,2000);assert.equal(next.brokenAt,2000);assert.equal(next.stackedAt,2000);
 assert.equal(next.resetAt,0);
});
test('all atlas cells stay inside the image and never sample adjacent frames',()=>{
 for(let i=0;i<24;i++) {const [x,y,w,h]=manaShieldUv(i);assert.ok(x>=0&&y>=0&&x+w<=1&&y+h<=1);assert.ok(w<1/6&&h<1/4)}
});
test('mage incoming event reflects actual absorption and immediate break without extra damage',()=>{
 const build={ranks:{魔力護盾:1},activeSlots:['魔力護盾',null,null]};
 const battle=syncLiveCombat(null,'shield','enemy',build,'法師',100);
 const first=resolveLiveEnemyAttack(battle,{healthPercent:50,maxHealth:1000,damage:1,roll:()=>.99});
 assert.equal(first.manaShield.activated,true);assert.equal(first.manaShield.absorbed,true);assert.equal(first.damage,0);
 const value=battle.combat.shield.value;
 const second=resolveLiveEnemyAttack(battle,{healthPercent:50,maxHealth:1000,damage:value+20,roll:()=>.99});
 assert.deepEqual(second.manaShield,{activated:false,absorbed:true,broke:true,stacked:false});assert.equal(second.damage,20);assert.equal(battle.combat.shield.value,0);
});
test('remaining shield carries to next ordinary monster without replaying formation',()=>{
 const first=updateManaShieldVisual(emptyManaShieldVisual(),'one',100,true,1000);
 const next=updateManaShieldVisual(first,'two',100,true,2000);
 assert.equal(next.value,100);assert.equal(next.formedAt,1000);assert.equal(next.resetAt,0);assert.equal(next.brokenAt,0);
});
