import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
registerHooks({resolve(s,c,n){return n(s.startsWith('./')&&!s.endsWith('.ts')?`${s}.ts`:s,c);}});
const { refreshCombatStatusCountdowns } = await import('../app/combat-status-countdown.ts');
const { syncLiveCombat } = await import('../app/skill-live-combat.ts');
const { applyEnemyDebuff } = await import('../app/skill-debuff-timer.ts');
const { activateMageOverload, consumeMageOverload } = await import('../app/skill-mage-rules.ts');
const build = {ranks:{焰脈:1},activeSlots:[null,null,null]};
for (const owner of ['tower:1', {mode:'personal',name:'首領'}, {mode:'world',name:'深淵王'}]) {
 test(`countdown reads expiry in ${typeof owner === 'string' ? 'tower' : owner.mode} combat without applying damage`,()=>{
  const battle=syncLiveCombat(null,owner,'enemy',build,'法師',100);
  for(const kind of ['burn','bleed','freeze','paralysis','armorBreak','bloodBrand','hunterMark','elementSigil'])
   battle.combat.session.enemy=applyEnemyDebuff(battle.combat.session.enemy,{kind,level:1},100).state;
  const before=JSON.stringify(battle);
  let rows=refreshCombatStatusCountdowns([],battle,100);
  assert.equal(rows.find(s=>s.name==='burn').remaining,5);
  rows=refreshCombatStatusCountdowns(rows,battle,1100);
  assert.equal(rows.find(s=>s.name==='burn').remaining,4);
  // Long gaps/animation locks need no incremental calls or attack events.
  rows=refreshCombatStatusCountdowns(rows,battle,3100);
  assert.equal(rows.find(s=>s.name==='burn').remaining,2);
  assert.ok(!rows.some(s=>['freeze','paralysis'].includes(s.name)));
  rows=refreshCombatStatusCountdowns(rows,battle,5100);
  assert.ok(!rows.some(s=>['burn','bleed'].includes(s.name)));
  assert.equal(JSON.stringify(battle),before);
 });
}
test('refresh and target transition use current enemy, including passive-only burn',()=>{
 const battle=syncLiveCombat(null,'tower','first',build,'法師',100);
 battle.combat.session.enemy=applyEnemyDebuff({}, {kind:'burn'},0).state;
 const old=refreshCombatStatusCountdowns([],battle,3000);
 battle.combat.session.enemy=applyEnemyDebuff(battle.combat.session.enemy,{kind:'burn'},3000).state;
 assert.equal(refreshCombatStatusCountdowns(old,battle,3000)[0].remaining,5);
 const transitioned=syncLiveCombat(battle,'tower','second',build,'法師',100);
 assert.deepEqual(refreshCombatStatusCountdowns(old,transitioned,3000),[]);
 assert.deepEqual(refreshCombatStatusCountdowns(old,null,3000),[]);
});
test('exhaustion countdown uses exact expiry; action counts stay unchanged',()=>{
 const battle=syncLiveCombat(null,'boss','enemy',build,'法師',100);
 let state=activateMageOverload(1,false);
 for(let i=0;i<3;i++) state=consumeMageOverload(state,{kind:"skill",hits:[{hit:true}]},0,100).state;
 battle.combat.overload=state;
 const count={name:'下一擊',target:'player',remaining:3,unit:'次',tone:'gold'};
 let rows=refreshCombatStatusCountdowns([count],battle,1100);
 assert.equal(rows.find(s=>s.name==='枯竭').remaining,4);
 assert.deepEqual(rows.find(s=>s.name==='下一擊'),count);
 rows=refreshCombatStatusCountdowns(rows,battle,5100);
 assert.deepEqual(rows,[count]);
});
test('legacy second-based display expires by timestamp instead of combat ticks',()=>{
 const status={name:'測試效果',target:'player',remaining:5,unit:'秒',tone:'blue',expiresAt:5000};
 assert.equal(refreshCombatStatusCountdowns([status],null,4100)[0].remaining,1);
 assert.deepEqual(refreshCombatStatusCountdowns([status],null,5000),[]);
});
