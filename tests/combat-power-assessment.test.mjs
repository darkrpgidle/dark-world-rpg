import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
registerHooks({resolve(specifier,context,next){return next(specifier.startsWith('./')&&!specifier.endsWith('.ts')?`${specifier}.ts`:specifier,context);}});
const {assessCombatPower,estimateSkillContribution}=await import('../app/combat-power-assessment.ts');
const {createSkillAscensions}=await import('../app/skill-ascensions.ts');
const {warriorPassiveDefenses}=await import('../app/skill-warrior-passives.ts');
const {rangerPassiveStats}=await import('../app/skill-ranger-passives.ts');
const {balanceConfig}=await import('../app/balance-config.ts');
const {equipmentBaseStats,affixName}=await import('../app/equipment-affixes.ts');
const {equippedSetAttackMultiplier,equippedSetGroups}=await import('../app/set-bonuses.ts');
const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
const {calculateAssessedCombatPower:assessGear}=await import('../app/character-power.ts');
const empty={ranks:{},activeSlots:[null,null,null]},asc=createSkillAscensions();
const talents={combatAttackSpeed:0,combatCritRate:0,combatCritDamage:0,combatBoss:0,combatDamageReduction:0,growthSkill:0};
const permanent={hp:0,attack:0,defense:0},bonuses={attack:0,defense:0},cosmetics={hit:0,dodge:0};
const gearScore=(cls,level,gear=[],build=empty,t=talents)=>assessGear(cls,level,gear,[],build,asc,permanent,bonuses,t,0,cosmetics);
const stats={hp:10000,attack:1000,defense:500,speed:100,hit:100,dodge:5,crit:10,critDamage:50,lifesteal:0,bossDamage:0,damageReduction:0,bossReduction:0,skillDamage:0};
const skill={damageFactor:1,skillShare:.5,protection:1,lifesteal:0};
const score=(s=stats,k=skill,set=0)=>assessCombatPower(s,100,k,set);

test('attack speed is worth more with stronger attacks and crit amplifies its expected output',()=>{
 const gain=s=>score({...s,speed:s.speed+10})-score(s);
 assert.ok(gain({...stats,attack:2000})>gain(stats)*1.9);
 assert.ok(gain({...stats,crit:50,critDamage:150})>gain(stats));
});
test('each effective combat attribute improves assessment and capped percentages stop gaining',()=>{
 for(const [stat,delta] of Object.entries({hp:1000,attack:100,defense:100,speed:10,hit:20,dodge:5,crit:10,critDamage:20,lifesteal:10,bossDamage:10,damageReduction:10,bossReduction:10,skillDamage:10}))assert.ok(score({...stats,[stat]:stats[stat]+delta})>score(),stat);
 assert.equal(score({...stats,crit:100}),score({...stats,crit:150}));
 assert.equal(score({...stats,lifesteal:100}),score({...stats,lifesteal:150}));
});
test('six/eight/ten piece thresholds independently increase rating',()=>{
 assert.ok(score(stats,skill,6)>score(stats,skill,5));
 assert.ok(score(stats,skill,8)>score(stats,skill,7));
 assert.ok(score(stats,skill,10)>score(stats,skill,9));
});
test('all levels use actual class growth; same level naked classes are no longer forced equal',()=>{
 for(const cls of ['戰士','遊俠','法師']){
  let previous=0;
  for(let level=1;level<=100;level++){const next=gearScore(cls,level);assert.ok(next>previous,`${cls} ${level}`);previous=next;}
 }
 assert.equal(new Set(['戰士','遊俠','法師'].map(cls=>gearScore(cls,100))).size,3);
});
test('actual panel adapter includes Ironbone, ranger passive speed/crit and rebirth combat talents',()=>{
 assert.ok(gearScore('戰士',100,[],{ranks:{鐵骨:5},activeSlots:[null,null,null]})>gearScore('戰士',100));
 assert.ok(gearScore('遊俠',100,[],{ranks:{迅捷手感:5,鷹眼:5},activeSlots:[null,null,null]})>gearScore('遊俠',100));
 for(const key of Object.keys(talents))assert.ok(gearScore('遊俠',100,[],{ranks:{穿雲箭:5},activeSlots:['穿雲箭',null,null]},{...talents,[key]:5})>gearScore('遊俠',100,[],{ranks:{穿雲箭:5},activeSlots:['穿雲箭',null,null]}),key);
});
test('actual gear adapter includes affixes and computes reversible replacement differences',()=>{
 const original={name:'測試',slot:'手套',quality:'傳奇',enhance:10,mapId:9,affixes:[]};
 const upgrade={...original,affixes:['攻擊% +10%','攻速 +10%','暴擊傷害 +30%']};
 const before=gearScore('遊俠',100,[original]),after=gearScore('遊俠',100,[upgrade]);
 assert.ok(after>before);assert.equal((after-before)+(before-after),0);
 assert.equal(gearScore('遊俠',100,[{...upgrade}])-after,0);
});
test('normalized skill sample is cached, isolated and learns only legal slotted skills',()=>{
 const build={ranks:{血刃斬:5,裂傷本能:5},activeSlots:['血刃斬',null,null]};
 const original=JSON.stringify(build),a=estimateSkillContribution('戰士',100,build,asc),b=estimateSkillContribution('戰士',100,build,asc);
 assert.equal(a,b);assert.equal(JSON.stringify(build),original);assert.ok(a.damageFactor>1);assert.ok(Object.isFrozen(a));
 assert.deepEqual(estimateSkillContribution('戰士',100,{ranks:{不存在:5},activeSlots:['不存在',null,null]},asc),{damageFactor:1,skillShare:0,protection:1,lifesteal:0});
});
test('assessment feeds panel and gear deltas without replacing saved power or expedition suppression',()=>{
 assert.match(page,/label: "綜合戰力", value: formatAssessedPower\(assessedCombatPower\)/);
 assert.match(page,/assessGearPower\(projectedGear\) - assessedCombatPower/);
 assert.match(page,/currentSuppression = realmSuppression\(combatPower, currentRecommendedPower\)/);
 assert.match(page,/saveSchemaVersion: 7,[\s\S]*?playerClass,\s*combatPower,/);
 assert.doesNotMatch(page,/combatPower:\s*assessedCombatPower/);
});
