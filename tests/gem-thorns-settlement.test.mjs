import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes,registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[cm]?[jt]sx?$/.test(s)?`${s}.ts`:s,c)}});
const {settleCombatHealth}=await import('../app/skill-health-settlement.ts');
const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
let position=0;
for(let phase=0;phase<2;phase++){
 const start=page.indexOf('                if (liveDefense.reflectedDamage > 0)',position);
 const end=page.indexOf('                if (liveDefense.counterDamagePercent > 0',start);
 assert.ok(start>0&&end>start);position=end;
 const code=stripTypeScriptTypes(page.slice(start,end));
 test(`tower thorns phase ${phase} settles lethal hit and float once if React replays the updater`,()=>{
  const floats=[],results=[];let kills=0;
  const env={liveDefense:{reflectedDamage:500},effectiveMonsterMaximumHealth:()=>100,settleCombatHealth,mapId:1,currentRecommendedPower:1,tier:'normal',currentEnemyBaseName:'鼠',realMode:false,wave:1,targetKey:'one',
   readTowerEncounter:()=>true,towerDeathPendingRef:{current:false},towerVictoryGuardRef:{current:new Set()},
   showCounterDamage:(damage,label)=>floats.push({damage,label}),queueTowerKill:()=>{kills++;env.towerDeathPendingRef.current=true;return 0;},
   setEnemyHp:fn=>{results.push(fn(100));results.push(fn(100));}};
  vm.runInNewContext(code,env);assert.equal(kills,1);assert.deepEqual(floats,[{damage:100,label:'荊棘反傷'}]);assert.deepEqual(results,[0,0]);
 });
 test(`tower thorns phase ${phase} ignores an old encounter without damage or rewards`,()=>{
  let calls=0;const env={liveDefense:{reflectedDamage:500},effectiveMonsterMaximumHealth:()=>100,settleCombatHealth,mapId:1,currentRecommendedPower:1,tier:'normal',currentEnemyBaseName:'鼠',realMode:false,wave:1,targetKey:'one',
   readTowerEncounter:()=>false,towerDeathPendingRef:{current:false},towerVictoryGuardRef:{current:new Set()},showCounterDamage:()=>calls++,queueTowerKill:()=>calls++,setEnemyHp:fn=>assert.equal(fn(100),100)};
  vm.runInNewContext(code,env);assert.equal(calls,0);
 });
}
