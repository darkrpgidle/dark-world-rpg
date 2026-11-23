import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[cm]?[jt]sx?$/.test(s)?`${s}.ts`:s,c)}});
const {syncLiveCombat,resolveLiveCombatAttack,resolveLiveEnemyAttack,advanceLiveCombatEvents}=await import('../app/skill-live-combat.ts');
const {createSkillAscensions}=await import('../app/skill-ascensions.ts');
const {calculateCharacterStats}=await import('../app/character-power.ts');
const {tryActivateMageShield,recordMageIncomingAttack}=await import('../app/skill-mage-shield.ts');
const {settleCombatHealth}=await import('../app/skill-health-settlement.ts');
const options={now:1000,healthPercent:90,attack:100,hitChance:100,criticalChance:0,criticalDamage:50,roll:()=>0};
const battle=(cls,build={ranks:{},activeSlots:[null,null,null]})=>syncLiveCombat(null,'key','target',build,cls,100,createSkillAscensions());
test('all six new gem bonuses enter shared character stats only while equipped',()=>{
 const ids=['thorns','corrosion','rift','battlewill','arcana','bastion'];
 const gear=ids.map((id,i)=>({id:i+1,name:'劍',slot:'武器',quality:'普通',mapId:1,enhance:0,power:0,affixes:[],sockets:{socketCount:1,gems:[{gemId:id,tier:'beginner'}]}}));
 const base=calculateCharacterStats('戰士',1,[],[]),stats=calculateCharacterStats('戰士',1,gear,[]);
 assert.equal(stats.gemThorns,2);assert.equal(stats.gemDotDamage,3);assert.equal(stats.gemBasicDamage,3);assert.equal(stats.gemShieldBonus,4);
 assert.equal(stats.critDamage-base.critDamage,3);assert.equal(stats.skillDamage-base.skillDamage,3);
 assert.equal(base.gemThorns,0);
});
test('basic gem increases original normal attacks for each class and excludes mythic follow-ups',()=>{
 for(const cls of ['戰士','遊俠','法師']){
  const plain=resolveLiveCombatAttack(battle(cls),options),boost=resolveLiveCombatAttack(battle(cls),{...options,gemBasicDamage:40});
  assert.equal(boost.name,null);assert.ok(Math.abs(boost.damagePercent/plain.damagePercent-1.4)<1e-10);
 }
 const a=battle('戰士'),b=battle('戰士');a.fissureNormalsRemaining=2;b.fissureNormalsRemaining=2;
 const plain=resolveLiveCombatAttack(a,{...options,equippedItems:[{mythicId:'skill-warrior-titan-axe'}]}),boost=resolveLiveCombatAttack(b,{...options,gemBasicDamage:40,equippedItems:[{mythicId:'skill-warrior-titan-axe'}]});
 assert.deepEqual(boost.equipmentHits,plain.equipmentHits);
 assert.ok(Math.abs((boost.damagePercent-plain.damagePercent)-40)<1e-10);
});
test('DOT gem affects bleeding and burning once, retains application snapshot and resets on next target',()=>{
 for(const [cls,name,kind] of [['戰士','血刃斬','bleed'],['法師','隕星術','burn']]){
  const build={ranks:{[name]:1},activeSlots:[name,null,null]},a=battle(cls,build),b=battle(cls,build);let appliedAt=0;
  for(let i=0;i<30;i++){
   const now=1000+i*100,plain=resolveLiveCombatAttack(a,{...options,now}),boost=resolveLiveCombatAttack(b,{...options,now,gemDotDamage:40});
   if(boost.statuses.includes(kind)){appliedAt=now;break;}
  }
  assert.ok(appliedAt,`${name} applies status`);
  // No new status application: changing the next attack bonus must not mutate the old DOT snapshot.
  const first=advanceLiveCombatEvents(a,appliedAt+1000).filter(e=>e.kind===kind),second=advanceLiveCombatEvents(b,appliedAt+1000).filter(e=>e.kind===kind);
  assert.ok(first.length);assert.equal(first.length,second.length);
  assert.ok(Math.abs(second[0].damage/first[0].damage-1.4)<1e-10);
  syncLiveCombat(b,'key','next-target',build,cls,100,createSkillAscensions());
  assert.equal(b.gemDotSnapshot[kind],0);assert.deepEqual(advanceLiveCombatEvents(b,appliedAt+2000),[]);
 }
});
test('shield gem grows generated active and passive shields, without changing health threshold or old shields',()=>{
 const build={ranks:{魔力護盾:1,星界護體:5},activeSlots:[null,null,null]};
 const a=battle('法師',build).combat,b=battle('法師',build).combat;
 assert.equal(tryActivateMageShield(a,{currentHealth:600,maxHealth:1000,ascended:false,shieldBonusPercent:50}).activated,false);
 const first=tryActivateMageShield(a,{currentHealth:590,maxHealth:1000,ascended:false}),second=tryActivateMageShield(b,{currentHealth:590,maxHealth:1000,ascended:false,shieldBonusPercent:50});
 assert.equal(second.initialShieldValue,first.initialShieldValue*1.5);
 const again=tryActivateMageShield(second.combat,{currentHealth:500,maxHealth:1000,ascended:false,shieldBonusPercent:100});
 assert.equal(again.combat.shield.value,second.combat.shield.value);
 const p=recordMageIncomingAttack(battle('法師',build).combat,[100],{maxHealth:1000,roll:()=>0});
 const q=recordMageIncomingAttack(battle('法師',build).combat,[100],{maxHealth:1000,roll:()=>0,shieldBonusPercent:50});
 assert.equal(q.combat.shield.value,p.combat.shield.value*1.5);
});
test('thorns reflects effective pre-shield damage, excludes avoidance and cannot exceed 100 percent',()=>{
 for(const cls of ['戰士','遊俠','法師']){
  const hit=resolveLiveEnemyAttack(battle(cls),{damage:100,maxHealth:1000,healthPercent:90,gemThorns:30,roll:()=>.99});
  assert.equal(hit.reflectedDamage,30);
  const dodged=resolveLiveEnemyAttack(battle(cls),{damage:100,maxHealth:1000,healthPercent:90,gemThorns:30,baseDodgeChance:100,roll:()=>0});
  assert.equal(dodged.reflectedDamage,0);
 }
 const mage=battle('法師');mage.combat.shield.value=100;
 const protectedHit=resolveLiveEnemyAttack(mage,{damage:100,maxHealth:1000,healthPercent:90,gemThorns:30,roll:()=>.99});
 assert.equal(protectedHit.damage,0);assert.equal(protectedHit.reflectedDamage,30);
 const capped=resolveLiveEnemyAttack(battle('法師'),{damage:100,maxHealth:1000,healthPercent:90,gemThorns:1000,roll:()=>.99});assert.equal(capped.reflectedDamage,100);
 const kill=settleCombatHealth(1,1000,30);assert.equal(kill.actualDamage,10);assert.equal(kill.defeated,true);
});

test('shared assessed power values new basic, DOT, thorns and shield gems through isolated paired samples',async()=>{
 const {calculateAssessedCombatPower,emptyAssessmentTalents}=await import('../app/character-power.ts');
 const {createSkillBuild}=await import('../app/skill-rework.ts');
 const equipment=id=>[{id:1,name:'舊劍',slot:'武器',quality:'普通',mapId:1,power:0,enhance:0,affixes:[],sockets:{socketCount:1,gems:id?[{gemId:id,tier:'lv5'}]:[null]}}];
 for(const [cls,id,build] of [['戰士','battlewill',createSkillBuild()],['戰士','thorns',createSkillBuild()],['戰士','corrosion',{ranks:{血刃斬:5},activeSlots:['血刃斬',null,null]}],['法師','bastion',{ranks:{魔力護盾:5,星界護體:5},activeSlots:[null,null,null]}]]){
  const score=gem=>calculateAssessedCombatPower(cls,100,equipment(gem),[],build,createSkillAscensions(),{hp:0,attack:0,defense:0},{attack:0,defense:0},emptyAssessmentTalents,0,{hp:0,attack:0,defense:0,hit:0,dodge:0});
  assert.ok(score(id)>score(null),`${id} contributes to assessed power`);
 }
});
