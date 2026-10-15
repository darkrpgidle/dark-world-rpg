import assert from "node:assert/strict";
import {registerHooks} from "node:module";
import test from "node:test";
registerHooks({resolve(specifier,context,nextResolve){return nextResolve(specifier.startsWith("./")&&!specifier.endsWith(".ts")?`${specifier}.ts`:specifier,context);}});
const {syncLiveCombat,resolveLiveCombatAttack}=await import("../app/skill-live-combat.ts");
const {createSkillAscensions}=await import("../app/skill-ascensions.ts");
function cast({ascended=true,hit=100,crit=100}={}){
 const b=syncLiveCombat(null,{},"enemy",{ranks:{破星狙擊:1,穿雲箭:1,風行領域:1},activeSlots:["破星狙擊","穿雲箭","風行領域"]},"遊俠",100,createSkillAscensions());
 b.ascended=new Set(ascended?["破星狙擊"]:[]);b.combat.session.charge.ready=["破星狙擊"];
 b.combat.session.charge.charges["穿雲箭"]=1;b.combat.session.charge.charges["風行領域"]=1;
 const action=resolveLiveCombatAttack(b,{now:1000,healthPercent:100,attack:100,hitChance:hit,criticalChance:crit,criticalDamage:50,roll:()=>.5});
 return {action,b};
}
test("ascended confirmed critical exposes real recovery without adding extra damage or another hit",()=>{
 const {action,b}=cast();assert.equal(action.starbreakChargeRecovered,true);assert.equal(action.hits.length,1);
 assert.equal(b.combat.session.charge.charges["穿雲箭"],4);assert.equal(b.combat.session.charge.charges["風行領域"],2);
 assert.equal(action.damagePercent,cast({ascended:false}).action.damagePercent);
});
for(const options of [{ascended:false},{hit:0},{crit:0}])test(`no fabricated recovery event ${JSON.stringify(options)}`,()=>{
 assert.equal(cast(options).action.starbreakChargeRecovered,false);
});
