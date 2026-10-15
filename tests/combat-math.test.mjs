import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks,stripTypeScriptTypes} from 'node:module';
import {readFileSync} from 'node:fs';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[cm]?[jt]sx?$/.test(s)?`${s}.ts`:s,c);}});
const math=await import('../app/combat-math.ts');
const {armorThreshold,armorMitigation,monsterArmorRating,additiveDamageMultiplier}=math;
const {balanceConfig}=await import('../app/balance-config.ts');
const {towerCombatValues,monsterProfile,hitChanceFromRatings}=await import('../app/balance.ts');
const {assessCombatPower}=await import('../app/combat-power-assessment.ts');
const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
const start=page.indexOf('function personalBossCombatValues('),end=page.indexOf('\n}\n',start)+2;
const deps={...math,balanceConfig,monsterProfile,hitChanceFromRatings};
const boss=Function(...Object.keys(deps),stripTypeScriptTypes(page.slice(start,end))+'\nreturn personalBossCombatValues;')(...Object.values(deps));
const tower={mapId:5,localFloor:20,tier:'guardian',combatPower:50000,recommendedPower:50000,attacks:1,skillTriggered:false,setTier:0,playerAttack:100000,playerDefense:5000,monsterName:'永夜樹妖',roll:0};
const bossInput={mapId:5,localFloor:20,attack:100000,speed:100,crit:0,critDamage:50,hit:1000,bossDamage:0,defense:5000,damageReduction:0,dodge:0,skillDamage:0,comboChance:0,bossReduction:0,lowHealthDamage:0,lowHealthReduction:0,lowHealth:false,playerLevel:100,bossLevel:100,monsterName:'永夜樹妖',roll:.9,attackRoll:0,counterRoll:0,monsterMultiplier:1};

test('armor grows smoothly beyond the former cap and both sides share the exact curve',()=>{
 for(const map of [1,5,9])for(const floor of [1,10,20,30]){
  const k=armorThreshold(map,floor);let last=0;
  for(const defense of [1,100,1000,3000,10000,100000,1e9]){const dr=armorMitigation(defense,k);assert.ok(dr>last&&dr<.85);last=dr;}
  assert.ok(Math.abs(armorMitigation(k,k)-.425)<1e-12);
  const t=towerCombatValues({...tower,mapId:map,localFloor:floor,playerDefense:k});
  assert.ok(Math.abs(t.defenseMitigation-.425)<1e-12);
  const attack=towerCombatValues({...tower,mapId:map,localFloor:floor,playerAttack:100000});
  const expected=Math.round(100000*(1-armorMitigation(attack.monsterDefense,k))*(1-balanceConfig.combat.monsterDamageReductionByMap[map]/100));
  assert.equal(attack.playerDamage,expected);
 }
});
test('armor break is applied once, capped and identical for tower and personal boss attacks',()=>{
 const base=towerCombatValues(tower),k=armorThreshold(5,20);
 for(const ignore of [0,35,60,80,100]){
  const actual=towerCombatValues({...tower,defenseIgnore:ignore});
  assert.equal(actual.monsterDefense,base.monsterDefense);
  assert.equal(actual.playerDamage,Math.round(tower.playerAttack*(1-armorMitigation(base.monsterDefense,k,ignore))*.95));
  const b=boss({...bossInput,monsterDefense:base.monsterDefense,defenseIgnore:ignore});
  assert.equal(b.playerDamage,Math.round(bossInput.attack*(1-armorMitigation(base.monsterDefense,k,ignore))));
 }
 assert.equal(towerCombatValues({...tower,defenseIgnore:80}).playerDamage,towerCombatValues({...tower,defenseIgnore:100}).playerDamage);
 assert.equal(armorMitigation(1000,k,35),armorMitigation(650,k));
 assert.ok(monsterArmorRating(100,k)>0);
});
test('personal boss incoming damage uses the same player armor curve exactly once',()=>{
 const raw=100000,k=armorThreshold(5,20);
 for(const defense of [0,500,5000,50000]){
  const b=boss({...bossInput,defense,monsterAttack:raw});
  assert.equal(b.counterDamage,Math.round(raw*(1-armorMitigation(defense,k))));
 }
});
test('ordinary bonus sources add by condition, while skill and special multipliers remain separate',()=>{
 assert.equal(additiveDamageMultiplier({skillDamage:40,bossDamage:30,lowHealthDamage:20,skillTriggered:true,bossTarget:true,lowHealth:true}),1.9);
 assert.equal(additiveDamageMultiplier({skillDamage:40,bossDamage:30}),1);
 const t=towerCombatValues({...tower,skillTriggered:true,skillDamage:40,bossDamage:30,lowHealthDamage:20,lowHealth:true,skillMultiplier:2,playerDamageMultiplier:1.5});
 const b=towerCombatValues(tower);
 assert.ok(Math.abs(t.playerDamage-b.playerDamage*1.9*2*1.5)<=4);
 const p=boss({...bossInput,skillTriggered:true,skillDamage:40,bossDamage:30,lowHealthDamage:20,lowHealth:true,playerDamageMultiplier:3});
 const p0=boss(bossInput);
 assert.ok(Math.abs(p.playerDamage-p0.playerDamage*1.9*3)<=4);
 const normal=towerCombatValues({...tower,tier:'normal',bossDamage:1000,skillDamage:1000});
 assert.equal(normal.playerDamage,towerCombatValues({...tower,tier:'normal'}).playerDamage);
});
test('assessment follows shared armor and additive bonus rules, preserving post-cap defense value',()=>{
 const s={hp:10000,attack:1000,defense:500,speed:100,hit:100,dodge:5,crit:10,critDamage:50,lifesteal:0,bossDamage:0,damageReduction:0,bossReduction:0,skillDamage:0};
 const k={damageFactor:1,skillShare:.5,protection:1,lifesteal:0};
 const score=x=>assessCombatPower(x,100,k,0);
 assert.ok(score({...s,defense:20000})>score({...s,defense:10000}));
 const individual=score({...s,bossDamage:20})+score({...s,skillDamage:20})-2*score(s);
 assert.ok(Math.abs(score({...s,bossDamage:20,skillDamage:20})-score(s)-individual)<=2);
});
