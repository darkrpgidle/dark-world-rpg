import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createCalibrationFixture,sampleMapEncounter,evaluateFixture} from '../scripts/map-power-calibration.mjs';
const {towerCombatValues,realmSuppression}=await import('../app/balance.ts');
const {maps}=await import('../app/game-data.ts');
const report=JSON.parse(readFileSync(new URL('./fixtures/map-power-calibration.json',import.meta.url),'utf8'));

for(const record of report.maps)test(`${record.name}: three-class checkpoint fixtures replay with retained realm suppression`,()=>{
  const advice=maps[record.mapId-1].recommendedAssessedPower;
  assert.deepEqual(advice,record.recommendedAssessedPower);
  for(const cls of record.classResults)for(const [phase,endpoint,floors] of [
    ['entry',0,report.entryFloors],['clear',1,report.clearFloors],
  ]){
    const fixture=createCalibrationFixture(cls[phase]);
    assert.equal(fixture.score,cls[phase].score);
    assert.equal(fixture.legacyPower,cls[phase].legacyPower);
    assert.ok(fixture.score<=advice[endpoint]);
    const result=evaluateFixture(fixture,{floors,trials:report.trialsPerFloor,limitSeconds:report.secondsLimit});
    assert.deepEqual(result,cls[phase].result);
    for(const row of result.byFloor)assert.ok(row.timelyWinRate>=report.minimumTimelyWinRate,
      `${cls.cls} ${phase} floor ${row.floor}: ${row.timelyWinRate}`);
  }
});

test('calibration uses legal reproducible equipment and point allocation without changing random state',()=>{
  const originalRandom=Math.random;
  const options={mapId:7,cls:'遊俠',level:86,quality:'傳奇',enhance:10,affixSeed:1480,gemTier:'advanced'};
  const first=createCalibrationFixture(options),second=createCalibrationFixture(options);
  assert.equal(Math.random,originalRandom);
  assert.deepEqual(first,second);
  assert.ok(first.score>first.legacyPower);
  assert.ok(Object.values(first.stats).every(Number.isFinite));
  const result=sampleMapEncounter(first,{floor:30,seed:17});
  assert.deepEqual(result,sampleMapEncounter(second,{floor:30,seed:17}));
  assert.ok(result.dealt>0);
});

test('realm suppression keeps all five tiers and increases actual enemy damage/defense while reducing hit',()=>{
  const options={recommendedPower:65000,mapId:7,localFloor:30,tier:'boss',attacks:1,
    skillTriggered:false,setTier:0,monsterName:'墜星巨像',playerAttack:2000,
    playerDefense:2000,playerHit:180,monsterEvasionRating:100};
  const rows=[1,.9,.75,.6,.4].map(ratio=>towerCombatValues({...options,combatPower:65000*ratio}));
  assert.deepEqual(rows.map(row=>row.suppression.tier),['none','light','medium','heavy','abyss']);
  for(let i=1;i<rows.length;i++){
    assert.ok(rows[i].monsterDamage>rows[i-1].monsterDamage);
    assert.ok(rows[i].monsterDefense>rows[i-1].monsterDefense);
    assert.ok(rows[i].playerDamage<rows[i-1].playerDamage);
    assert.ok(rows[i].playerHitChance<rows[i-1].playerHitChance);
  }
  for(const [ratio,tier] of [[1,'none'],[.85,'light'],[.7,'medium'],[.5,'heavy'],[.499,'abyss']])
    assert.equal(realmSuppression(65000*ratio,65000).tier,tier);
});

test('a matching hero and seed take longer and receive more damage under abyss suppression',()=>{
  const fixture=createCalibrationFixture({mapId:7,cls:'遊俠',level:86,quality:'傳奇',enhance:10,affixSeed:1480,gemTier:'advanced'});
  const normal=sampleMapEncounter(fixture,{floor:30,seed:31,suppressionPower:65000});
  const abyss=sampleMapEncounter(fixture,{floor:30,seed:31,suppressionPower:26000});
  assert.equal(normal.suppression,'none');assert.equal(abyss.suppression,'abyss');
  assert.ok(abyss.seconds>normal.seconds);
  assert.ok(abyss.received>normal.received);
});
