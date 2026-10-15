import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import ts from 'typescript';
import {astralAmounts} from '../app/astral-annihilation-frames.ts';
registerHooks({resolve(s,c,n){return n(s.startsWith('./')&&!s.endsWith('.ts')?`${s}.ts`:s,c)}});
const {syncLiveCombat,resolveLiveCombatAttack}=await import('../app/skill-live-combat.ts');
const build={ranks:{星界寂滅:5,星界回爆:5},activeSlots:[null,null,null]};
function cast({miss=false,ascended=false}={}){
 const b=syncLiveCombat(null,'astral','enemy',build,'法師',100);
 if(ascended)b.ascended=new Set(['星界寂滅']);
 b.combat.session.charge.ready=["星界寂滅"];
 b.combat.session.charge.ultimateEnergy=100;
 return resolveLiveCombatAttack(b,{now:100,attack:100,healthPercent:100,hitChance:miss?0:100,criticalChance:0,criticalDamage:50,roll:()=>.5});
}
test('live ultimate exposes six independent beams, final explosion and actual passive return blast',()=>{
 const a=cast();assert.equal(a.name,'星界寂滅');assert.equal(a.hits.length,7);
 assert.equal(a.astralSegments.length,8);assert.equal(a.astralSegments[7].label,'星界回爆');
 const beam=a.astralSegments.slice(0,6).reduce((n,p)=>n+p.damagePercent,0),tail=a.astralSegments[6].damagePercent;
 assert.ok(Math.abs(beam/(beam+tail)-.4)<1e-9);
 assert.ok(Math.abs(a.astralSegments.reduce((n,p)=>n+p.damagePercent,0)-a.damagePercent)<1e-9);
 const asc=cast({ascended:true});assert.equal(asc.astralSegments[0].damagePercent,a.astralSegments[0].damagePercent);
 assert.ok(asc.astralSegments[6].damagePercent>a.astralSegments[6].damagePercent);
});
test('missed original beams keep individual results and never invent passive return blast',()=>{
 const a=cast({miss:true});assert.equal(a.astralSegments.length,7);assert.ok(a.astralSegments.every(p=>!p.hit&&p.damagePercent===0));
 assert.equal(a.damagePercent,0);
});
test('display allocation retains overkill fractions and missed segments receive zero',()=>{
 const parts=[{hit:true,damagePercent:60},{hit:false,damagePercent:0},{hit:true,damagePercent:900}];
 for(const total of [0,.3,1,123.4,99999]){const values=astralAmounts(parts,total);assert.equal(values[1],0);assert.ok(Math.abs(values.reduce((a,b)=>a+b,0)-total)<1e-8)}
});
const source=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const initializers=new Map();function visit(n){if(ts.isVariableDeclaration(n))initializers.set(n.name.getText(ast),n.initializer);ts.forEachChild(n,visit)}visit(ast);
const compile=fn=>ts.transpileModule(`return (${fn});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function queue(action,total){
 const pending={current:new Map()};let groups=[],extras=0;
 const fn=new Function('useCallback','astralAmounts','pendingAstralDamageRef','setBattleHitGroups','window',compile(initializers.get('queueAstralNumbers').getText(ast)))
 (f=>f,astralAmounts,pending,f=>{groups=f(groups)},{setTimeout(){}});
 fn(42,action,total,()=>extras++);
 return {read:()=>({groups,extras}),contact(i){pending.current.get(42)?.publish(i)},pending};
}
test('real page queue publishes all six on simultaneous contact, only tail is ultimate, no duplicate total',()=>{
 const a=cast(),f=queue(a,123.4);assert.equal(f.read().groups.length,0);
 for(let i=0;i<6;i++){f.contact(i);f.contact(i)}assert.equal(f.read().groups.length,6);assert.equal(f.read().extras,0);
 f.contact(6);f.contact(6);f.contact(7);assert.equal(f.read().groups.length,8);assert.equal(f.read().extras,1);
 assert.equal(f.read().groups.filter(g=>g.ultimate).length,1);
 assert.ok(Math.abs(f.read().groups.reduce((n,g)=>n+g.hits[0].damage,0)-123.4)<1e-9);
 assert.ok(f.read().groups.every(g=>g.hits[0].delayMs===0));
 const miss=queue(cast({miss:true}),0);for(let i=0;i<7;i++)miss.contact(i);
 assert.equal(miss.read().groups.length,7);assert.ok(miss.read().groups.every(g=>g.hits[0].text==='未命中！'));
 const zero=queue(a,0);for(let i=0;i<8;i++)zero.contact(i);assert.equal(zero.read().groups.length,0);
});
test('actual finish releases its own animation and victory once, while stale completion cannot unlock new event',()=>{
 const pendingAstralDamageRef={current:new Map([[42,{}]])},pendingAstralVictoryRef={current:new Map()};
 const astralKeyRef={current:42},ultimateAnimationLockRef={current:43};let kills=0,visual={key:43};
 pendingAstralVictoryRef.current.set(42,()=>kills++);
 const finish=new Function('pendingAstralDamageRef','pendingAstralVictoryRef','astralKeyRef','ultimateAnimationLockRef','ultimatePlaybackGuardRef','setAstralVisual',compile(initializers.get('finishAstralVisual').getText(ast)))
 (pendingAstralDamageRef,pendingAstralVictoryRef,astralKeyRef,ultimateAnimationLockRef,{current:{complete(){}}},f=>{visual=f(visual)});
 finish(42);finish(42);assert.equal(kills,1);assert.equal(ultimateAnimationLockRef.current,43);assert.equal(visual.key,43);
 assert.equal(pendingAstralDamageRef.current.size,0);
});
test('both encounters queue the ultimate and wait for keyed cinematic victory',()=>{
 assert.equal((source.match(/updateAstralVisual\(liveCombat, liveAction, next\)/g)||[]).length,2);
 assert.match(source,/queueAstralNumbers\(next, liveAction, mainDisplayedDamage/);
 assert.match(source,/queueAstralNumbers\(next, liveAction, shownBossMain/);
 assert.match(source,/pendingAstralVictoryRef.current.set\(astralKey/);
 assert.match(source,/const victoryRef = liveAction.name === "星界寂滅"/);
 assert.match(source,/pendingAstralDamageRef.current.clear\(\)/);
});
