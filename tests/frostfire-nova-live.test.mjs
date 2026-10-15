import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('./')&&!s.endsWith('.ts')?`${s}.ts`:s,c)}});
const {syncLiveCombat,resolveLiveCombatAttack,advanceLiveCombatEvents}=await import('../app/skill-live-combat.ts');
const {applyEnemyDebuff}=await import('../app/skill-debuff-timer.ts');
const build={ranks:{霜火新星:5},activeSlots:['霜火新星',null,null]};
function cast(rolls,{burning=true,ascended=true,hitChance=100}={}) {
 const battle=syncLiveCombat(null,'frostfire','enemy',build,'法師',100);
 if(ascended)battle.ascended=new Set(['霜火新星']);
 if(burning){battle.combat.session.enemy=applyEnemyDebuff({}, {kind:'burn'},0).state;battle.dotAttack.burn=100}
 battle.combat.session.charge.ready=['霜火新星'];
 return {battle,action:resolveLiveCombatAttack(battle,{now:100,attack:100,healthPercent:100,hitChance,criticalChance:0,criticalDamage:50,roll:()=>{assert.ok(rolls.length);return rolls.shift()}})};
}
test('ascended warm afterburst keeps independent hit outcome and existing total damage',()=>{
 const {action}=cast([0,.99,1,0,.99]);assert.equal(action.damagePercent,275);
 assert.deepEqual(action.frostfireAfterburst,{hit:true,critical:false,damagePercent:70});assert.deepEqual(action.statuses,[]);
 const miss=cast([0,.99,1,.99],{hitChance:50}).action;
 assert.equal(miss.damagePercent,205);assert.deepEqual(miss.frostfireAfterburst,{hit:false,critical:false,damagePercent:0});
});
test('freeze branch suppresses warm afterburst and emits ice shatter only at actual final expiry',()=>{
 const {battle,action}=cast([0,.99,0,.8]);assert.deepEqual(action.statuses,['freeze']);assert.equal(action.frostfireAfterburst,null);
 assert.equal(advanceLiveCombatEvents(battle,3099).filter(e=>e.kind==='freeze').length,0);
 const shatters=advanceLiveCombatEvents(battle,3100).filter(e=>e.kind==='freeze');assert.deepEqual(shatters,[{kind:'freeze',damage:70}]);
 assert.equal(advanceLiveCombatEvents(battle,3200).filter(e=>e.kind==='freeze').length,0);
});
test('ordinary burn/none/miss branches use existing combat result without VFX rerolls',()=>{
 const burn=cast([0,.99,0,0],{burning:false,ascended:false}).action;assert.deepEqual(burn.statuses,['burn']);assert.equal(burn.frostfireAfterburst,null);
 const none=cast([0,.99,1],{burning:false,ascended:false}).action;assert.deepEqual(none.statuses,[]);assert.equal(none.damagePercent,205);
 const miss=cast([1],{burning:false,ascended:false}).action;assert.equal(miss.damagePercent,0);assert.deepEqual(miss.statuses,[]);
});
test('tower and boss numbers use shared contact callback; reset/background cancel stale effects',()=>{
 const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 assert.equal((page.match(/updateFrostfireVisual\(liveCombat, liveAction, next\)/g)||[]).length,2);
 assert.match(page,/pendingFrostfireDamageRef.current.set\(next, publishDamageDisplay\)/);
 assert.match(page,/pendingFrostfireDamageRef.current.set\(next, publishBossDamage\)/);
 assert.match(page,/onImpact=\{publishFrostfireImpact\}/);
 assert.match(page,/mainDisplayedDamage -= frostfireAfterburstDisplayed/);
 assert.match(page,/hunterBurstDisplayed - frostfireAfterburstDisplayed, critical:/);
 assert.match(page,/\}, \[enemyPresentationToken\]\)/);
 assert.match(page,/pendingFrostfireDamageRef.current.clear\(\); pending.forEach\(publish => publish\(\)\)/);
 assert.match(page,/if \(skill === "霜火新星"\) return/);
 assert.doesNotMatch(page,/triggerFrostfireImpact|frostfireImpactDelayTimerRef/);
 const vfx=readFileSync(new URL('../app/mage-frostfire-nova-vfx.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(vfx,/resolveLiveCombatAttack|Math.random|setEnemyHp|setWorldDamage/);
});
