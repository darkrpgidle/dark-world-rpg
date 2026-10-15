import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('./')&&!s.endsWith('.ts')?`${s}.ts`:s,c)}});
const {syncLiveCombat,resolveLiveCombatAttack}=await import('../app/skill-live-combat.ts');
const build={ranks:{閃電鏈:5},activeSlots:['閃電鏈',null,null]};
function cast(rolls,{ascended=true,hitChance=50,criticalChance=0}={}) {
 const battle=syncLiveCombat(null,'lightning','enemy',build,'法師',100);
 if(ascended)battle.ascended=new Set(['閃電鏈']);
 battle.combat.session.charge.ready=['閃電鏈'];
 const action=resolveLiveCombatAttack(battle,{now:100,attack:100,healthPercent:100,hitChance,criticalChance,criticalDamage:50,roll:()=>{assert.ok(rolls.length,'Unexpected extra combat roll');return rolls.shift()}});
 assert.equal(rolls.length,0);return {battle,action};
}
test('three independent lightning hits retain critical weights and resonance remains separate',()=>{
 const {action}=cast([0,.99,0,0,0,.99,1,1,1,0,.99],{criticalChance:50});
 assert.equal(action.damagePercent,430);assert.deepEqual(action.lightningSegments.map(p=>p.damagePercent),[100,150,100,80]);
 assert.deepEqual(action.lightningSegments.map(p=>p.critical),[false,true,false,false]);
});
test('partial and complete misses never generate resonance and retain their original three contacts',()=>{
 const partial=cast([0,.99,.99,0,.99,1,1]).action;
 assert.equal(partial.damagePercent,200);assert.equal(partial.lightningSegments.length,3);assert.deepEqual(partial.lightningSegments.map(p=>p.hit),[true,false,true]);
 const missed=cast([.99,.99,.99]).action;assert.equal(missed.damagePercent,0);assert.equal(missed.lightningSegments.length,3);assert.ok(missed.lightningSegments.every(p=>!p.hit));
});
test('resonance miss remains an independent fourth result without adding damage',()=>{
 const {action}=cast([0,.99,0,.99,0,.99,1,1,1,.99]);
 assert.equal(action.damagePercent,300);assert.deepEqual(action.lightningSegments[3],{hit:false,critical:false,damagePercent:0});
});
test('paralysis reflects actual existing combat state, with ordinary cast retaining only three hits',()=>{
 const {battle,action}=cast([0,.99,0,.99,0,.99,0,1,1],{ascended:false});
 assert.equal(action.lightningSegments.length,3);assert.equal(action.damagePercent,300);assert.deepEqual(action.statuses,['paralysis']);
 assert.equal(battle.combat.session.enemy.paralysis.expiresAt,3100);
});
test('tower and bosses queue per-contact display and cleanup without any renderer combat rolls',()=>{
 const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 assert.match(page,/queueLightningNumbers\(next, liveAction, mainDisplayedDamage, publishDamageDisplay/);
 assert.match(page,/queueLightningNumbers\(next, liveAction, shownBossMain, publishBossDamage/);
 assert.match(page,/queueLightningNumbers\(next, liveAction, 0, \(\) => \{\}/);
 assert.match(page,/published.has\(index\)/);assert.match(page,/delayMs: 0/);assert.match(page,/pendingLightningRef.current.clear\(\)/);
 assert.match(page,/lightning.forEach\(publish => \{ for \(let index = 0; index < 4; index\+\+\) publish\(index\)/);
 const renderer=readFileSync(new URL('../app/mage-lightning-chain-vfx.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(renderer,/Math.random|setEnemyHp|setWorldDamage|resolveLiveCombatAttack/);
});
