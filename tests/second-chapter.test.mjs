import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('./')&&!s.endsWith('.ts')?`${s}.ts`:s,c)}});
const {secondChapterPower,secondChapterHealth,secondChapterOriginalCombatPower,towerCombatValues}=await import('../app/balance.ts');
test('chapter 2 attack and defense exactly match the original formula while new HP remains',()=>{
 for(let floor=1;floor<=30;floor++){
  const tier=floor===30?'boss':floor%10===0?'guardian':floor%5===0?'elite':'normal';
  for(const monsterName of ['骨弓手','骸骨犬','荒原亡兵','咒骸','白骨巨獸']){
   const args={combatPower:5500,mapId:2,localFloor:floor,tier,monsterName,attacks:1,skillTriggered:false,setTier:0,playerAttack:400,playerDefense:300};
   const old=towerCombatValues({...args,recommendedPower:secondChapterOriginalCombatPower(floor),secondChapterTuning:false});
   const restored=towerCombatValues({...args,recommendedPower:secondChapterPower(floor),secondChapterTuning:true});
   for(const key of ['monsterDamage','monsterDefense','monsterAttack','tierDefense','progressionDamageFloor','playerDamage'])assert.equal(restored[key],old[key],`${floor}: ${key}`);
  }
 }
});
const {balanceConfig}=await import('../app/balance-config.ts');
test('chapter 2 power and HP never reverse, and existing checkpoint HP is never lowered',()=>{
 let oldPower=0,oldHp=0;
 const previous=new Map([[5,4951],[10,13007],[15,7743],[20,15008],[25,8409],[30,6889]]);
 for(let floor=1;floor<=30;floor++){
  const tier=floor===30?'boss':floor%10===0?'guardian':floor%5===0?'elite':'normal';
  const power=secondChapterPower(floor),hp=secondChapterHealth(power,tier);
  assert.ok(power>oldPower);assert.ok(hp>=oldHp);
  if(previous.has(floor)){assert.ok(hp>=previous.get(floor));assert.ok(hp/oldHp<1.3);}
  oldPower=power;oldHp=hp;
 }
 assert.equal(secondChapterHealth(secondChapterPower(10),'guardian'),13007);
 assert.equal(secondChapterHealth(secondChapterPower(20),'guardian'),15008);
 assert.ok(secondChapterHealth(secondChapterPower(30),'boss')>oldHp*0.99);
});
test('second chapter tuning cannot affect chapter 1, later chapters or personal boss baseline',()=>{
 const base={combatPower:10000,recommendedPower:5000,localFloor:10,tier:'guardian',monsterName:'白骨巨獸',attacks:1,skillTriggered:false,setTier:0};
 const cases=[{...base,mapId:1},{...base,mapId:3},{...base,mapId:2,secondChapterTuning:false}];
 const before=cases.map(towerCombatValues),old=balanceConfig.secondChapter.profileVariation;
 try{balanceConfig.secondChapter.profileVariation=0.001;cases.forEach((args,i)=>assert.deepEqual(towerCombatValues(args),before[i]));}
 finally{balanceConfig.secondChapter.profileVariation=old;}
});
