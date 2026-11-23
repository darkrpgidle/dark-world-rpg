import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
registerHooks({resolve(specifier,context,nextResolve){return nextResolve(specifier.startsWith("./")&&!specifier.endsWith(".ts")?`${specifier}.ts`:specifier,context);}});
const {syncLiveCombat,resolveLiveCombatAttack}=await import("../app/skill-live-combat.ts");
const {createSkillAscensions}=await import("../app/skill-ascensions.ts");
const {skyMarksAt,skyRainDisplayAmounts}=await import("../app/sky-queen-rain-timing.ts");
function cast({ascended=false,hit=100,crit=0,rolls=[],rank=1,extra=false}={}){
 const b=syncLiveCombat(null,{},"enemy",{ranks:{蒼穹箭雨:rank,...(extra?{蒼穹餘響:1}:{})},activeSlots:[null,null,null]},"遊俠",100,createSkillAscensions());
 b.ascended=new Set(ascended?["蒼穹箭雨"]:[]);b.combat.session.charge.ready=["蒼穹箭雨"];b.combat.session.charge.ultimateEnergy=100;
 const action=resolveLiveCombatAttack(b,{now:1000,healthPercent:100,attack:100,hitChance:hit,criticalChance:crit,criticalDamage:50,roll:()=>rolls.shift()??.5});
 return {action,b};
}
test("normal nine arrows expose actual segment values and consume ultimate once",()=>{
 const {action,b}=cast();assert.equal(action.name,"蒼穹箭雨");assert.equal(action.skyArrows.length,9);
 assert.deepEqual(action.skyArrows.map(a=>a.damagePercent),[30,30,30,30,30,30,30,30,160]);
 assert.equal(action.damagePercent,400);assert.equal(b.combat.session.charge.ultimateEnergy,0);
});
test("ascended rain criticals strengthen only main arrow, matching live settled damage",()=>{
 const {action}=cast({ascended:true,crit:100});assert.equal(action.skyArrows[8].damagePercent,(160+48)*1.5);
 assert.equal(action.skyArrows.reduce((sum,a)=>sum+a.damagePercent,0),action.damagePercent);
 assert.equal(skyMarksAt(action.skyArrows,1319,true),0);assert.equal(skyMarksAt(action.skyArrows,1420,true),2);
 assert.equal(skyMarksAt(action.skyArrows,2440,true),8);assert.equal(skyMarksAt(action.skyArrows,2440,false),0);
});
test("missed rain and main produce no invented damage or marks",()=>{
 const {action}=cast({ascended:true,hit:50,crit:100,
   rolls:Array.from({length:9},(_,index)=>[0,3,8].includes(index)?[.99]:[0,0]).flat()});
 assert.equal(action.skyArrows[0].damagePercent,0);assert.equal(action.skyArrows[3].damagePercent,0);
 assert.equal(action.skyArrows[8].hit,false);assert.equal(action.skyArrows[8].damagePercent,0);
 assert.equal(skyMarksAt(action.skyArrows,2440,true),6);
});
test("display allocation conserves clamped HP totals without giving misses damage",()=>{
 const arrows=[{hit:true,damagePercent:30},{hit:false,damagePercent:0},{hit:true,damagePercent:208}];
 for(const total of [0,1,19,1000]){
 const amounts=skyRainDisplayAmounts(total,arrows,45);assert.equal(amounts.reduce((a,b)=>a+b,0),total);assert.equal(amounts[1],0);
 }
 assert.deepEqual(skyRainDisplayAmounts(0,[{hit:false}],0),[0,0]);
});
test("passive followup stays separate from nine arrow metadata",()=>{
 const {action}=cast({extra:true});assert.equal(action.skyArrows.length,9);
 assert.equal(action.skyArrows.reduce((sum,a)=>sum+a.damagePercent,0),400);assert.equal(action.damagePercent,445);
});
test("tower and boss route dedicated callbacks, delay victory and clean pending queues",()=>{
 const s=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
 assert.equal((s.match(/updateSkyRainVisual\(liveCombat, liveAction, next\)/g)||[]).length,2);
 assert.equal((s.match(/queueSkyRainNumbers\(next, liveAction,/g)||[]).length,2);
 assert.match(s,/const victoryRef = liveAction.name === "星界寂滅" \? pendingAstralVictoryRef : pendingSkyVictoryRef/);assert.match(s,/pendingSkyVictoryRef.current.set\(skyKey/);
 assert.match(s,/pendingSkyDamageRef.current.clear\(\); pendingSkyVictoryRef.current.clear\(\)/);
 assert.match(s,/if \(!monsterActs \|\| !realMode && \(liveAction\?\.name === "蒼穹箭雨" \|\| liveAction\?\.name === "星界寂滅"\)\)/);
 assert.match(s,/onImpact=\{publishSkyRainImpact\} onComplete=\{finishSkyRainVisual\}/);
});
