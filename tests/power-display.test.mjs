import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[cm]?[jt]sx?$/.test(s)?`${s}.ts`:s,c);}});
const {formatAssessedPower}=await import('../app/power-display.ts');
const {createCalibrationFixture}=await import('../scripts/map-power-calibration.mjs');
const {maps}=await import('../app/game-data.ts');
const report=JSON.parse(readFileSync(new URL('./fixtures/map-power-calibration.json',import.meta.url),'utf8'));
const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');

test('display uses compact full integers and symmetric loss/gain rounding without negative zero',()=>{
 for(const [raw,shown] of [[5800,'580'],[65000,'6,500'],[550000,'55,000'],[1200000,'120,000'],[15,'2'],[-15,'-2'],[-1,'0'],[0,'0']])assert.equal(formatAssessedPower(raw),shown);
});
test('all existing class/map calibration scores and advice retain raw precision after formatting',()=>{
 for(const map of report.maps){
  assert.deepEqual(maps[map.mapId-1].recommendedAssessedPower,map.recommendedAssessedPower);
  for(const cls of map.classResults)for(const phase of ['entry','clear']){
   const f=createCalibrationFixture(cls[phase]),before=JSON.stringify(f);
   assert.equal(f.score,cls[phase].score);assert.equal(f.legacyPower,cls[phase].legacyPower);
   assert.equal(formatAssessedPower(f.score),Math.round(f.score/10).toLocaleString('zh-TW'));
   assert.equal(JSON.stringify(f),before);
  }
 }
});
test('all score surfaces use common formatting but raw sorting, map comparison and upgrade protection remain',()=>{
 assert.match(page,/label: "綜合戰力", value: formatAssessedPower\(assessedCombatPower\)/);
 assert.match(page,/formatAssessedPower\(recommendedPower\[0\]\)/);
 assert.match(page,/formatAssessedPower\(recommendedPower\[1\]\)/);
 assert.match(page,/formatAssessedPower\(powerDifferenceForItem\(currentItem\)\)/);
 assert.match(page,/formatAssessedPower\(r.power\)/);
 assert.match(page,/formatAssessedPower\(selectedRank.power\)/);
 assert.match(page,/formatAssessedPower\(combatPower\)/);
 assert.match(page,/assessGearPower\(projectedGear\) - assessedCombatPower/);
 assert.match(page,/powerDifferenceForItem\(b\) - powerDifferenceForItem\(a\)/);
 assert.match(page,/\(!worn \|\| powerDifferenceForItem\(item\) > 0\)/);
 assert.match(page,/assessedCombatPower < recommendedPower\[0\]/);
 assert.doesNotMatch(page,/(?:assessedCombatPower|actualDifference|selectedRank\.power|r\.power|recommendedPower\[[01]\])\.toLocaleString/);
});
