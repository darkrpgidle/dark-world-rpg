import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createCalibrationFixture,sampleMapEncounter} from '../scripts/map-power-calibration.mjs';
const {towerCombatValues}=await import('../app/balance.ts');
const {balanceConfig}=await import('../app/balance-config.ts');
const report=JSON.parse(readFileSync(new URL('./fixtures/monster-strength-calibration.json',import.meta.url)));
test('same-build pre-unification replay retains overall class pressure and avoids large win-rate regressions',()=>{
 assert.equal(report.scenarios,243);assert.equal(report.totalBattles,14580);
 for(const c of report.classes){assert.ok(Math.abs(c.currentSeconds/c.oldSeconds-1)<.15,`${c.cls} duration`);
  assert.ok(Math.abs(c.currentReceived/c.oldReceived-1)<.2,`${c.cls} pressure`);
  assert.ok(c.currentWinRate>=c.oldWinRate-.02,`${c.cls} win rate`);}
 for(const r of report.rows)assert.ok(r.current.winRate>=r.old.winRate-.1,`${r.mapId} ${r.cls} ${r.floor}`);
});
test('elite calibration replay includes independent holdout seeds and real legal gear',()=>{
 for(const mapId of [1,5,9])for(const cls of ['戰士','遊俠','法師']){
  const r=report.rows.find(r=>r.mapId===mapId&&r.cls===cls&&r.floor===25);
  const fixture=createCalibrationFixture(r.fixtureInput),results=[];
  for(let trial=0;trial<30;trial++)results.push(sampleMapEncounter(fixture,{floor:25,profileIndex:4,seed:20261007+trial*100003+25*101}));
  assert.equal(results.reduce((s,x)=>s+x.seconds,0)/30,r.current.seconds);
  assert.equal(results.reduce((s,x)=>s+x.received,0)/30,r.current.received);
  assert.equal(results.slice(10).filter(x=>x.won).length/20,r.current.holdoutWinRate);
 }
});
test('fixed monster calibration does not feed assessed power or player stats back into enemy armor; boss baseline can opt out',()=>{
 for(let mapId=1;mapId<=9;mapId++)for(const tier of ['normal','elite','guardian','boss']){
  const input={mapId,localFloor:30,tier,combatPower:999999,recommendedPower:1000,attacks:1,skillTriggered:false,setTier:0,playerAttack:10000,playerDefense:0};
  const original=towerCombatValues({...input,calibrateMonsterStats:false}),calibrated=towerCombatValues(input);
  assert.ok(Math.abs(calibrated.monsterDefense-original.monsterDefense*balanceConfig.combat.monsterCalibrationByMap[mapId-1][tier].defense)<1e-8);
  assert.equal(calibrated.monsterDefense,towerCombatValues({...input,playerAttack:1,playerDefense:100000}).monsterDefense);
  assert.equal(calibrated.suppression.tier,original.suppression.tier);
 }
 const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 assert.match(page,/const bossBaseline = towerCombatValues\(\{\s+calibrateMonsterStats: false,/);
 assert.equal(balanceConfig.combat.worldBoss.damagePerHit,1);
 assert.equal(balanceConfig.combat.worldBoss.attacksPerSecond,1.25);
});
