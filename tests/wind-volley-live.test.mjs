import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith("./") && !specifier.endsWith(".ts") ? `${specifier}.ts` : specifier, context);
} });
const { syncLiveCombat, resolveLiveCombatAttack } = await import("../app/skill-live-combat.ts");
const { createSkillAscensions } = await import("../app/skill-ascensions.ts");

function cast({ascended=true,hit=100,crit=0,rolls=[]}={}) {
 const b=syncLiveCombat(null,{},"enemy",{ranks:{疾風連射:1},activeSlots:["疾風連射",null,null]},"遊俠",100,createSkillAscensions());
 b.ascended=new Set(ascended?["疾風連射"]:[]);b.combat.session.charge.ready=["疾風連射"];b.combat.session.charge.charges["疾風連射"]=100;
 return resolveLiveCombatAttack(b,{now:1000,healthPercent:100,attack:100,hitChance:hit,criticalChance:crit,criticalDamage:50,roll:()=>rolls.shift()??.5});
}
test("five confirmed primary arrows expose exact actual damage without ascension",()=>{
 const a=cast({ascended:false});assert.equal(a.volleyArrows.length,5);assert.deepEqual(a.volleyArrows.map(x=>x.damagePercent),[60,60,60,60,60]);
 assert.equal(a.volleyArrows.reduce((sum,x)=>sum+x.damagePercent,0),a.damagePercent);
});
test("ascended sixth arrow keeps its independent hit and critical result",()=>{
 const a=cast({crit:100});assert.equal(a.volleyArrows.length,6);assert.equal(a.volleyArrows[5].sixth,true);
 assert.equal(a.volleyArrows[5].damagePercent,135);assert.equal(a.volleyArrows.reduce((sum,x)=>sum+x.damagePercent,0),a.damagePercent);
});
test("one missed primary arrow suppresses sixth arrow and keeps zero damage",()=>{
 const a=cast({hit:50,rolls:[.99,0,.99,0,.99,0,.99,0,.99]});assert.equal(a.volleyArrows.length,5);
 assert.equal(a.volleyArrows[0].hit,false);assert.equal(a.volleyArrows[0].damagePercent,0);
});
test("sixth arrow may miss even after all five primary arrows hit",()=>{
 const a=cast({hit:50,rolls:[0,.99,0,.99,0,.99,0,.99,0,.99,.99]});assert.equal(a.volleyArrows.length,6);
 assert.equal(a.volleyArrows[5].hit,false);assert.equal(a.volleyArrows[5].damagePercent,0);
});
