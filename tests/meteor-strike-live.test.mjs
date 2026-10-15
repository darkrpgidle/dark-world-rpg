import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import ts from 'typescript';
import {meteorAmounts} from '../app/meteor-strike-frames.ts';
registerHooks({resolve(s,c,n){return n(s.startsWith('./')&&!s.endsWith('.ts')?`${s}.ts`:s,c)}});
const {syncLiveCombat,resolveLiveCombatAttack}=await import('../app/skill-live-combat.ts');
const build={ranks:{隕星術:5},activeSlots:['隕星術',null,null]};
function battle(){const b=syncLiveCombat(null,'meteor','enemy',build,'法師',100);b.ascended=new Set(['隕星術']);return b}
function cast(b,now,roll=()=>0,hitChance=100){b.combat.session.charge.ready=['隕星術'];return resolveLiveCombatAttack(b,{now,attack:100,healthPercent:100,hitChance,criticalChance:0,criticalDamage:50,roll})}
test('first meteor applies burn without inventing ascension; second on burning enemy carries real extra result',()=>{
 const b=battle(),first=cast(b,100);assert.ok(first.statuses.includes('burn'));assert.equal(first.meteorAfterburst,null);
 const second=cast(b,200);assert.deepEqual(second.meteorAfterburst,{hit:true,critical:false,damagePercent:120});
 assert.equal(second.damagePercent-first.damagePercent,120);
});
test('meteor extra has its own hit and critical rolls and a main miss cannot create it',()=>{
 const b=battle();cast(b,100);
 const rolls=[0,.99,.99];const miss=cast(b,200,()=>rolls.shift()??.99,50);
 assert.ok(miss.hits[0].hit);assert.deepEqual(miss.meteorAfterburst,{hit:false,critical:false,damagePercent:0});
 const mainMiss=cast(b,300,()=>.99,50);assert.equal(mainMiss.damagePercent,0);assert.equal(mainMiss.meteorAfterburst,null);
});
const source=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const initializers=new Map();function visit(n){if(ts.isVariableDeclaration(n))initializers.set(n.name.getText(ast),n.initializer);ts.forEachChild(n,visit)}visit(ast);
const compile=fn=>ts.transpileModule(`return (${fn});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(action,total){
 const pendingMeteorRef={current:new Map()},frostfireGatesRef={current:{}},liveCombatRef={current:{ascended:new Set(),combat:{session:{enemy:{burn:{expiresAt:5000}}}}}};
 let groups=[],visuals=[],extras=0,now=100;const timers=[];
 const setBattleHitGroups=fn=>{groups=fn(groups)},setMeteorVisuals=fn=>{visuals=fn(visuals)};
 const queue=new Function('useCallback','meteorAmounts','pendingMeteorRef','frostfireGatesRef','liveCombatRef','performance','setBattleHitGroups','setMeteorVisuals','window',compile(initializers.get('queueMeteorNumbers').getText(ast)))
 (fn=>fn,meteorAmounts,pendingMeteorRef,frostfireGatesRef,liveCombatRef,{now:()=>now},setBattleHitGroups,setMeteorVisuals,{setTimeout(fn){timers.push(fn)}});
 queue(42,action,total,()=>extras++);
 const recover=new Function('tab','documentVisible','sessionSuperseded','activeBossBattle','bossOutcome','runSummary','performance','pendingMeteorRef','setMeteorVisuals',compile(initializers.get('recoverMeteorDisplay').arguments[0].getText(ast)));
 return{pendingMeteorRef,frostfireGatesRef,read:()=>({groups,visuals,extras}),contact(i){pendingMeteorRef.current.get(42)?.publish(i)},recover({tab='主控',visible=true,superseded=false,time=100}={}){now=time;recover(tab,visible,superseded,null,null,null,{now:()=>now},pendingMeteorRef,setMeteorVisuals)()}};
}
test('real queue publishes settled main and bonus separately, with no duplicate total or extra publication',()=>{
 const b=battle();cast(b,100);const action=cast(b,200),f=fixture(action,997);
 assert.equal(f.read().groups.length,0);assert.equal(f.frostfireGatesRef.current.burn,5000);
 f.contact(0);f.contact(0);assert.equal(f.read().groups.length,1);assert.equal(f.read().extras,1);assert.equal(f.frostfireGatesRef.current.burn,undefined);
 f.contact(1);f.contact(1);assert.equal(f.read().groups.length,2);
 assert.equal(f.read().groups.reduce((sum,g)=>sum+g.hits[0].damage,0),997);assert.ok(f.read().groups.every(g=>g.hits[0].delayMs===0));
 assert.equal(f.read().groups[1].hits[0].label,'天火墜星');
});
test('real queue distinguishes zero overkill hits from misses and background recovery releases each result once',()=>{
 const b=battle();cast(b,100);const action=cast(b,200),zero=fixture(action,0);zero.contact(0);zero.contact(1);assert.equal(zero.read().groups.length,0);
 const f=fixture(action,997);f.contact(0);f.recover({tab:'技能'});f.recover({tab:'技能'});assert.equal(f.read().groups.length,2);assert.equal(f.read().extras,1);assert.equal(f.pendingMeteorRef.current.size,0);assert.equal(f.read().visuals.length,0);
 const missed=fixture(cast(b,300,()=>.99,50),0);missed.contact(0);assert.equal(missed.read().groups[0].hits[0].text,'未命中！');
});
test('visible RAF stall is recovered after four seconds, while superseded login discards pending callbacks',()=>{
 const b=battle();cast(b,100);const action=cast(b,200),f=fixture(action,997);
 f.recover({time:4099});assert.equal(f.read().groups.length,0);f.recover({time:4100});assert.equal(f.read().groups.length,2);
 const old=fixture(action,997);old.recover({superseded:true});assert.equal(old.read().groups.length,0);assert.equal(old.pendingMeteorRef.current.size,0);
});
test('tower and both boss modes share meteor queue and clearing; renderer never alters game state',()=>{
 assert.match(source,/queueMeteorNumbers\(next, liveAction, mainDisplayedDamage, publishDamageDisplay/);
 assert.match(source,/queueMeteorNumbers\(next, liveAction, shownBossMain, publishBossDamage/);
 assert.match(source,/pendingMeteorRef.current.clear\(\)/);
 const renderer=readFileSync(new URL('../app/mage-meteor-strike-vfx.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(renderer,/Math.random|setEnemyHp|setWorldDamage|resolveLiveCombatAttack/);
});
