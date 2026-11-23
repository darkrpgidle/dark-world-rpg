import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[cm]?[jt]sx?$/.test(s)?`${s}.ts`:s,c);}});
const {balanceConfig}=await import('../app/balance-config.ts');
const {maps}=await import('../app/game-data.ts');
const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
test('map advice is fixed across players and rises with chapter difficulty',()=>{
 assert.equal(maps.length,9);
 for(let i=0;i<maps.length;i++){
  const range=maps[i].recommendedAssessedPower;
  assert.equal(range,balanceConfig.maps[i].recommendedAssessedPower);
  assert.equal(range.length,2);
  assert.ok(range.every(v=>Number.isSafeInteger(v)&&v>0));
  assert.ok(range[0]<range[1]);
  if(i)for(let endpoint=0;endpoint<2;endpoint++)assert.ok(range[endpoint]>maps[i-1].recommendedAssessedPower[endpoint]);
 }
 assert.match(page,/const recommendedPower = realMode\?[\s\S]*?:map\.recommendedAssessedPower;/);
 assert.doesNotMatch(page,/assessedPowerAtSuppressionThreshold|suppressionRequirements/);
 assert.match(page,/建議戰力 \{formatAssessedPower\(recommendedPower\[0\]\)\}～/);
 assert.match(page,/assessedCombatPower < recommendedPower\[0\]/);
 assert.match(page,/assessedCombatPower <= recommendedPower\[1\]/);
});
test('display advice does not alter legacy combat requirements or checkpoint HP',()=>{
 assert.deepEqual(balanceConfig.maps.map(({power,phasePower,bossPower})=>[power,phasePower,bossPower]),[
  [[1000,5500],[4000,5200],5800],[[3000,7600],[6500,7500],8000],
  [[6000,12300],[10500,12000],13000],[[10000,18000],[15000,17500],19000],
  [[16000,26500],[21500,25500],28000],[[24000,38000],[29000,35000],42000],
  [[35000,58000],[42000,50000],65000],[[50000,85000],[60000,70000],95000],
  [[70000,120000],[85000,100000],140000],
 ]);
 assert.deepEqual(balanceConfig.mapFloors.monsterHealth.combatMultiplier,{normal:.78,elite:1.05,guardian:1.45,boss:.48});
 assert.deepEqual(balanceConfig.firstChapter.anchors.filter(([floor])=>floor%5===0).map(([floor,,hp])=>[floor,hp]),[[5,650],[10,1260],[15,1610],[20,2850],[25,3500],[30,7200]]);
 assert.deepEqual(balanceConfig.secondChapter.anchors.filter(([floor])=>floor%5===0).map(([floor,,hp])=>[floor,hp]),[[5,4951],[10,13007],[15,14000],[20,15008],[25,18000],[30,24000]]);
 const balance=readFileSync(new URL('../app/balance.ts',import.meta.url),'utf8');
 assert.doesNotMatch(balance,/recommendedAssessedPower/);
 assert.match(page,/currentSuppression = realmSuppression\(combatPower, currentRecommendedPower\)/);
 assert.match(page,/saveSchemaVersion: 7,[\s\S]*?playerClass,\s*combatPower,/);
 assert.match(page,/recommendedAssessedPower:maps\[8\]\.recommendedAssessedPower/);
 assert.match(page,/const currentRecommendedPower = realMode\?Math\.round\(balanceConfig\.maps\[8\]\.bossPower/);
});
