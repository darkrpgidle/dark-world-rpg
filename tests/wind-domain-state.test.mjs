import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
registerHooks({resolve(specifier,context,nextResolve){return nextResolve(specifier.startsWith("./")&&!specifier.endsWith(".ts")?`${specifier}.ts`:specifier,context);}});
const {windDomainVisualState}=await import("../app/ranger-wind-domain-state.ts");
const {activateRangerWindDomain,consumeRangerWindDomain,createRangerWindDomain}=await import("../app/skill-ranger-rules.ts");
const {syncLiveCombat,resolveLiveCombatAttack}=await import("../app/skill-live-combat.ts");
const {createSkillAscensions}=await import("../app/skill-ascensions.ts");
test("eight real player actions drive lifetime and actual critical stacks",()=>{
let domain=activateRangerWindDomain(1,true),visual=windDomainVisualState(domain,null,42,true,false);
assert.equal(visual.remainingActions,8);assert.equal(visual.galeStacks,0);
for(let i=1;i<=8;i++){
domain=consumeRangerWindDomain(domain,{kind:"normal",hits:[{hit:true,critical:true}]}).state;
visual=windDomainVisualState(domain,visual,42+i,false,true);
assert.equal(visual.castKey,42);assert.equal(visual.remainingActions,8-i);
if(i<8)assert.equal(visual.galeStacks,Math.min(5,i));
}
assert.equal(visual.ending,true);
});
test("missed critical does not invent a golden stack",()=>{
const domain=consumeRangerWindDomain(activateRangerWindDomain(1,true),{kind:"normal",hits:[{hit:false,critical:true}]}).state;
assert.equal(windDomainVisualState(domain,null,42,false,true).galeStacks,0);
});
test("inactive skill never creates a visual and reactivation gets a new cast key",()=>{
assert.equal(windDomainVisualState(createRangerWindDomain(),null,42,false,false),null);
const old={...activateRangerWindDomain(1,true),castKey:42,pulseKey:0,ending:true};
const next=windDomainVisualState(activateRangerWindDomain(1,true),old,50,true,false);
assert.equal(next.castKey,50);assert.equal(next.ending,false);
});
test("ordinary monster transition preserves wind-domain lifetime",()=>{
const owner={};let battle=syncLiveCombat(null,owner,"one",{ranks:{風行領域:1},activeSlots:["風行領域",null,null]},"遊俠",100,createSkillAscensions());
battle.combat.windDomain=activateRangerWindDomain(1,true);
const previous=windDomainVisualState(battle.combat.windDomain,null,42,true,false);
battle=syncLiveCombat(battle,owner,"two",battle.build,"遊俠",100,createSkillAscensions());
const next=windDomainVisualState(battle.combat.windDomain,previous,43,false,false);
assert.equal(next.remainingActions,8);assert.equal(next.castKey,42);
});
test("live activation exposes zero direct damage while buff becomes active",()=>{
const battle=syncLiveCombat(null,{},"enemy",{ranks:{風行領域:1},activeSlots:["風行領域",null,null]},"遊俠",100,createSkillAscensions());
battle.combat.session.charge.ready=["風行領域"];
const action=resolveLiveCombatAttack(battle,{now:1000,healthPercent:100,attack:100,hitChance:100,criticalChance:0,criticalDamage:50,roll:()=>.5});
assert.equal(action.damagePercent,0);const visual=windDomainVisualState(battle.combat.windDomain,null,42,action.name==="風行領域",false);
assert.equal(visual.remainingActions,8);assert.equal(visual.ending,false);
});
