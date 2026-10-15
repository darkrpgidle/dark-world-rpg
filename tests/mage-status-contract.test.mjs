import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { readFileSync } from 'node:fs';
registerHooks({resolve(s,c,n){return n(s.startsWith('./')&&!s.endsWith('.ts')?`${s}.ts`:s,c);}});
const { applyEnemyDebuff, advanceEnemyDebuffs, calculateDebuffTickRawDamage, countEnemyAbnormalKinds } = await import('../app/skill-debuff-timer.ts');
const { createMageCombat, resolveMageTurn, transitionMageCombat } = await import('../app/skill-mage-combat.ts');
const { activateMageOverload, consumeMageOverload, advanceMageOverload } = await import('../app/skill-mage-rules.ts');
const { restoreSkillBuild } = await import('../app/skill-rework.ts');
const { restoreSkillAscensions, createSkillAscensions } = await import('../app/skill-ascensions.ts');
const { syncLiveCombat, resolveLiveCombatAttack, advanceLiveCombatEvents, liveEnemyControl } = await import('../app/skill-live-combat.ts');
const { recordMageIncomingAttack, tryActivateMageShield } = await import('../app/skill-mage-shield.ts');
const { collectCombatFloats, splitAsyncDamageForDisplay } = await import('../app/combat-float-events.ts');
function mage(ranks,slots=Object.keys(ranks).filter(n=>['霜火新星','閃電鏈','隕星術','元素蝕印','奧術超載'].includes(n)).slice(0,3)) {
 return createMageCombat({ranks,activeSlots:[...slots,...Array(3-slots.length).fill(null)]},100);
}
function cast(combat,skill,{now=100,roll=()=>0,hits=[{hit:true}],ascended=new Set()}={}) {
 combat={...combat,session:{...combat.session,charge:{...combat.session.charge,ready:[skill]}}};
 return resolveMageTurn(combat,{skill,now,roll,hits,ascended,attackSnapshot:200});
}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('ordinary duration overrides cannot bypass shared burn/bleed; all five ticks use multiplicative scaling',()=>{
 for(const [kind,damage] of [['burn',72],['bleed',36]]) {
  const applied=applyEnemyDebuff({}, {kind,durationSeconds:99,effectMultiplier:1.2},0);
  assert.equal(applied.state[kind].expiresAt,5000);
  const ticks=advanceEnemyDebuffs(applied.state,9000);
  assert.equal(ticks.ticks.length,5);assert.deepEqual(ticks.state,{});
  for(const tick of ticks.ticks)close(calculateDebuffTickRawDamage(tick,100),damage);
 }
});
test('blood blade ascension explicitly extends shared three-stack cap to five',()=>{
 let ordinary={},ascended={};
 for(let i=0;i<8;i++) {
  ordinary=applyEnemyDebuff(ordinary,{kind:'bleed'},i).state;
  ascended=applyEnemyDebuff(ascended,{kind:'bleed',ascendedBleed:true},i).state;
 }
 assert.equal(ordinary.bleed.stacks,3);assert.equal(ascended.bleed.stacks,5);
 close(calculateDebuffTickRawDamage(advanceEnemyDebuffs(ascended,1000).ticks[0],100),150);
});
test('freeze refresh replaces duration and emits exactly one delayed ascension shatter',()=>{
 let state=applyEnemyDebuff({}, {kind:'freeze',freezeBurstPercent:70,attackSnapshot:200,effectMultiplier:1.2},0).state;
 assert.equal(state.freeze.expiresAt,3600);
 const refreshed=applyEnemyDebuff(state,{kind:'freeze',freezeBurstPercent:70,attackSnapshot:200},2000);
 assert.deepEqual(refreshed.ticks,[]);assert.equal(refreshed.state.freeze.expiresAt,5000);
 assert.deepEqual(advanceEnemyDebuffs(refreshed.state,4999).ticks,[]);
 const end=advanceEnemyDebuffs(refreshed.state,5000);assert.equal(end.ticks.length,1);
 close(calculateDebuffTickRawDamage(end.ticks[0],end.ticks[0].attackSnapshot),140);
 assert.deepEqual(advanceEnemyDebuffs(end.state,9999).ticks,[]);
});
test('frost makes one affliction roll then a mutually exclusive burn/freeze choice',()=>{
 const combat=mage({'霜火新星':5});
 for(const [choice,kind]of [[0.49,'burn'],[0.5,'freeze']]) {
  const rolls=[0.49,choice];const out=cast(combat,'霜火新星',{roll:()=>rolls.shift(),ascended:new Set(['霜火新星'])});
  assert.deepEqual(out.statusApplications.map(s=>s.kind),[kind]);assert.equal(rolls.length,0);
  if(kind==='freeze')assert.equal(out.combat.session.enemy.freeze.freezeBurstPercent,70);
 }
 assert.deepEqual(cast(combat,'霜火新星',{roll:()=>0.5}).statusApplications,[]);
 assert.deepEqual(cast(combat,'霜火新星',{hits:[{hit:false}],roll:()=>{throw Error('miss rolled')}}).statusApplications,[]);
});
test('chain rolls paralysis per original hit and precision is multiplicative, not percentage points',()=>{
 const combat=mage({'閃電鏈':5,'精密咒式':5});let draws=0;
 const out=cast(combat,'閃電鏈',{hits:[{hit:true},{hit:false},{hit:true}],roll:()=>{draws++;return 0.22;}});
 assert.equal(draws,2);assert.equal(out.statusApplications.length,2);
 assert.equal(out.combat.session.enemy.paralysis.strength,30);
 const failed=cast(combat,'閃電鏈',{hits:[{hit:true},{hit:true},{hit:true}],roll:()=>0.24});
 assert.deepEqual(failed.statusApplications,[]);assert.deepEqual(failed.damageSegmentPercents,[100,100,100]);
});
test('sigil and overload multiply abnormal strength but leave burn and paralysis duration fixed',()=>{
 let combat=mage({'隕星術':1,'奧術超載':5});
 combat.session.enemy=applyEnemyDebuff({}, {kind:'elementSigil',strength:14,effectBonusPercent:30},0).state;
 combat.overload=activateMageOverload(5,false);
 const out=cast(combat,'隕星術',{roll:()=>{throw Error('guaranteed meteor should not roll')}});
 const burn=out.combat.session.enemy.burn;assert.equal(burn.expiresAt,5100);close(burn.effectMultiplier,1.69);
 close(calculateDebuffTickRawDamage(advanceEnemyDebuffs(out.combat.session.enemy,1100).ticks[0],100),101.4);
 const slow=applyEnemyDebuff({}, {kind:'paralysis',effectMultiplier:1.69},0).state;
 assert.equal(slow.paralysis.expiresAt,3000);close(slow.paralysis.strength,50.7);
});
test('frozen and slowed enemies share the same control clock in tower and boss, and release at expiry',()=>{
 const battle={combat:{session:{enemy:applyEnemyDebuff({}, {kind:'paralysis'},0).state}}};
 close(liveEnemyControl(battle,2000).speedMultiplier,0.7);
 battle.combat.session.enemy=applyEnemyDebuff(battle.combat.session.enemy,{kind:'freeze'},0).state;
 assert.equal(countEnemyAbnormalKinds(battle.combat.session.enemy),2);
 assert.equal(liveEnemyControl(battle,2999).speedMultiplier,0);assert.equal(liveEnemyControl(battle,3000).speedMultiplier,1);
 const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 assert.match(page,/cadence\.enemy = enemyControl.frozen \? 0 : cadence\.enemy \+ tickMs \* enemyControl.speedMultiplier/);
 assert.match(page,/cadence\.enemy = enemyControl.frozen \? 0 : cadence\.enemy \+ tickMs \* enemyControl.speedMultiplier/);
});
test('overload misses consume no cast; fifth-second deadline releases exhaustion even without an attack',()=>{
 let state=activateMageOverload(5,false);
 state=consumeMageOverload(state,{kind:'skill',hits:[{hit:false}]},5,100).state;
 assert.equal(state.remainingSuccessfulCasts,3);
 for(let i=0;i<3;i++)state=consumeMageOverload(state,{kind:'skill',hits:[{hit:true}]},5,100+i*100).state;
 assert.equal(state.expiresAt,5300);
 close(consumeMageOverload(state,{kind:'skill',hits:[{hit:true}]},5,5299).skillDamagePenaltyPercent,7.5);
 assert.equal(advanceMageOverload(state,5300).phase,'idle');
});
test('passive barriers amplify each grant and stack with existing shields without a cap or retroactive absorption',()=>{
 let combat=mage({'星界護體':5,'屏障續航':5,'魔力護盾':1},[]);
 for(let i=0;i<12;i++)combat=recordMageIncomingAttack(combat,[1],{maxHealth:1000,roll:()=>0.049}).combat;
 close(combat.shield.value,1549); // first grant 130, then 11 grants less eleven absorbed damage
 const low=tryActivateMageShield(combat,{currentHealth:500,maxHealth:1000,ascended:false});
 assert.equal(low.activated,true);close(low.combat.shield.value,1705);
 const next=transitionMageCombat(low.combat,'normal-kill');assert.equal(next.shieldActivatedThisBattle,false);
 close(next.shield.value,1705);
});
test('old missile skill rank, loadout and ascension migrate without spending or losing points',()=>{
 const raw={ranks:{'奧術飛彈':5},activeSlots:['奧術飛彈',null,null]};
 const restored=restoreSkillBuild(raw,'法師',100);
 assert.deepEqual(restored,{ranks:{'閃電鏈':5},activeSlots:['閃電鏈',null,null]});assert.equal(raw.ranks['奧術飛彈'],5);
 assert.deepEqual(restoreSkillBuild({ranks:{'奧術飛彈':5},activeSlots:'bad'},'法師',100),{ranks:{},activeSlots:[null,null,null]});
 const asc=restoreSkillAscensions({rebirthCount:1,choices:['奧術飛彈',null,null,null,null],selectionOpen:false},'法師');
 assert.equal(asc.choices[0],'閃電鏈');assert.equal(asc.rebirthCount,1);
});
test('ember echo advances one step at a time, never recharges, and target changes cancel the chain',()=>{
 const build={ranks:{'霜火新星':1,'餘燼回響':5,'星界寂滅':1},activeSlots:['霜火新星',null,null]};
 const battle=syncLiveCombat(null,'echo','enemy-1',build,'法師',100,createSkillAscensions());
 battle.combat.session.charge.ready=['霜火新星'];
 battle.combat.session.enemy=applyEnemyDebuff({}, {kind:'burn'},100).state;battle.dotAttack.burn=100;
 const action=resolveLiveCombatAttack(battle,{now:100,attack:100,healthPercent:100,hitChance:100,criticalChance:0,criticalDamage:50,roll:()=>0});
 assert.equal(action.damagePercent,155);assert.equal(battle.emberEchoes.length,1);
 const charge=structuredClone(battle.combat.session.charge);
 assert.deepEqual(advanceLiveCombatEvents(battle,279),[]);
 assert.deepEqual(advanceLiveCombatEvents(battle,280),[{kind:'echo',damage:65}]);
 assert.deepEqual(advanceLiveCombatEvents(battle,280),[]);
 assert.deepEqual(battle.combat.session.charge,charge);
 assert.equal(advanceLiveCombatEvents(battle,900).filter(e=>e.kind==='echo').length,1);
 syncLiveCombat(battle,'echo','enemy-2',build,'法師',100,createSkillAscensions());
 assert.deepEqual(advanceLiveCombatEvents(battle,10000),[]);
});

test('asynchronous echoes and ice shatters keep separate numbers, labels, crits and settled HP rounding',()=>{
 const raw=[{kind:'echo',damage:0.4},{kind:'echo',damage:0.4,critical:true}];
 const display=splitAsyncDamageForDisplay(raw,1);assert.equal(display.reduce((sum,e)=>sum+e.damage,0),1);
 const separated=splitAsyncDamageForDisplay([{kind:'echo',damage:65},{kind:'echo',damage:65,critical:true},{kind:'freeze',damage:140}],180);
 assert.deepEqual(separated.map(e=>e.damage),[65,65,50]);
 const events=collectCombatFloats({groups:[],elementals:[],dots:separated.map((e,key)=>({...e,key})),player:null,enemy:null,miss:null,counter:null,boss:false});
 assert.equal(events.length,3);assert.equal(events[0].label,'餘燼回響');assert.equal(events[1].critical,true);
 assert.equal(events[2].label,'冰碎');assert.equal(events[2].tone,'ice');
});

test('independent direct passive bonuses multiply while resonance categories add within that passive',()=>{
 const combat=mage({'霜火新星':1,'奧術感知':1,'護盾轉流':1,'燃燼導引':1,'元素共振':1});
 combat.shield.value=100;combat.session.enemy=applyEnemyDebuff({}, {kind:'burn'},0).state;
 const result=cast(combat,'霜火新星',{roll:()=>1});
 close(result.passiveDirectDamageMultiplier,1.05*1.05*1.06*1.05);
 assert.equal(result.passiveDamageProcs.length,0);
});
