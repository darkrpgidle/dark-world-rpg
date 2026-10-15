// Read-only combat replay against the last version before unified armor.
// Run: node scripts/monster-strength-calibration.mjs [--write]
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createCalibrationFixture,sampleMapEncounter} from './map-power-calibration.mjs';
const basisCommit='8331dab8ac194c856dadcb292b13c10a1915c6e1';
const root=new URL('../',import.meta.url),temporary=mkdtempSync(join(tmpdir(),'monster-strength-'));
const oldFile=path=>execFileSync('git',['show',`${basisCommit}:${path}`],{cwd:root,encoding:'utf8'});
try {
 writeFileSync(join(temporary,'package.json'),'{"type":"module"}');
 writeFileSync(join(temporary,'legacy-config.ts'),oldFile('app/balance-config.ts'));
 writeFileSync(join(temporary,'legacy-balance.ts'),oldFile('app/balance.ts').replace('"./balance-config"','"./legacy-config.ts"'));
 const {towerCombatValues:legacy}=await import(pathToFileURL(join(temporary,'legacy-balance.ts')));
 const data=JSON.parse(oldFile('tests/fixtures/map-power-calibration.json'));
 const rows=[];
 for(const map of data.maps)for(const c of map.classResults)for(const kind of ['entry','clear']){
  const fixture=createCalibrationFixture(c[kind]);
  for(const floor of kind==='entry'?[1,5,9,10]:[15,20,25,29,30]){
   const tier=floor===30?'boss':floor%10===0?'guardian':floor%5===0?'elite':'normal';
   const old=[],current=[];
   for(let trial=0;trial<30;trial++){
    const options={floor,profileIndex:tier==='normal'?trial%5:4,seed:20261007+trial*100003+floor*101};
    old.push(sampleMapEncounter(fixture,{...options,combatValues:legacy}));
    current.push(sampleMapEncounter(fixture,options));
   }
   const summarize=list=>({seconds:list.reduce((s,r)=>s+r.seconds,0)/30,received:list.reduce((s,r)=>s+r.received,0)/30,
    winRate:list.filter(r=>r.won).length/30,hp:list.reduce((s,r)=>s+r.hp,0)/30,
    holdoutWinRate:list.slice(10).filter(r=>r.won).length/20});
   rows.push({mapId:map.mapId,cls:c.cls,kind,tier,floor,
    fixtureInput:Object.fromEntries(['mapId','cls','level','quality','enhance','gearMapId','affixSeed','gemTier'].map(k=>[k,c[kind][k]])),
    old:summarize(old),current:summarize(current)});
  }
 }
 const classes=['戰士','遊俠','法師'].map(cls=>{
  const group=rows.filter(r=>r.cls===cls),mean=(side,key)=>group.reduce((s,r)=>s+r[side][key],0)/group.length;
  return {cls,oldSeconds:mean('old','seconds'),currentSeconds:mean('current','seconds'),
   oldReceived:mean('old','received'),currentReceived:mean('current','received'),oldWinRate:mean('old','winRate'),currentWinRate:mean('current','winRate')};
 });
 const report={basisCommit,trialsPerScenario:30,scenarios:rows.length,totalBattles:rows.length*30*2,
  conditions:'Identical legal gear, level, skills, HP, suppression and seeds. Fit seeds 0-9; holdout seeds 10-29. No rebirth, ascensions, blessing, title, mythic or epithet. Formula simulation, not browser gameplay. Unified math retained; map/tier monster stats are fixed and do not depend on the entering player.',classes,rows};
 if(process.argv.includes('--write'))writeFileSync(new URL('../tests/fixtures/monster-strength-calibration.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({basisCommit,scenarios:report.scenarios,totalBattles:report.totalBattles,classes},null,2));
} finally {rmSync(temporary,{recursive:true,force:true});}
