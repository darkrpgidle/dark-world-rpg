import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const initializers=new Map();function visit(n){if(ts.isVariableDeclaration(n))initializers.set(n.name.getText(ast),n.initializer);ts.forEachChild(n,visit)}visit(ast);
const compile=fn=>ts.transpileModule(`return (${fn});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(action,total){
 const pendingVoidRef={current:new Map()},frostfireGatesRef={current:{}},liveCombatRef={current:{combat:{session:{enemy:{burn:{expiresAt:5000}}}}}};
 let groups=[],visuals=[],extras=0,now=100;const timers=[];
 const setBattleHitGroups=fn=>{groups=fn(groups)},setVoidVisuals=fn=>{visuals=fn(visuals)};
 const queue=new Function('useCallback','pendingVoidRef','performance','setBattleHitGroups','setVoidVisuals','window',compile(initializers.get('queueVoidNumbers').getText(ast)))
 (fn=>fn,pendingVoidRef,{now:()=>now},setBattleHitGroups,setVoidVisuals,{setTimeout(fn){timers.push(fn)}});
 queue(42,action,total,()=>extras++,true);
 const recover=new Function('tab','documentVisible','sessionSuperseded','activeBossBattle','bossOutcome','runSummary','performance','pendingVoidRef','setVoidVisuals',compile(initializers.get('recoverVoidDisplay').arguments[0].getText(ast)));
 return{pendingVoidRef,frostfireGatesRef,read:()=>({groups,visuals,extras}),contact(i){pendingVoidRef.current.get(42)?.publish(i)},recover({tab='主控',visible=true,superseded=false,time=100}={}){now=time;recover(tab,visible,superseded,null,null,null,{now:()=>now},pendingVoidRef,setVoidVisuals)()}};
}

test('real queue publishes only the settled main at contact and extras once',()=>{
 const f=fixture({hits:[{hit:true}],critical:true},123.4);assert.equal(f.read().groups.length,0);
 f.contact();f.contact();assert.equal(f.read().groups.length,1);assert.equal(f.read().groups[0].hits[0].damage,123.4);
 assert.equal(f.read().groups[0].hits[0].delayMs,0);assert.equal(f.read().extras,1);
});
test('zero overkill remains a hit, miss appears at contact, background and stalled playback recover once',()=>{
 const zero=fixture({hits:[{hit:true}],critical:false},0);zero.contact();assert.equal(zero.read().groups.length,0);
 const miss=fixture({hits:[{hit:false}],critical:false},0);assert.equal(miss.read().groups.length,0);miss.contact();assert.equal(miss.read().groups[0].hits[0].text,'未命中！');
 for(const args of [{tab:'技能'},{visible:false},{time:4100}]){const f=fixture({hits:[{hit:true}]},88);f.recover(args);f.recover(args);assert.equal(f.read().groups.length,1);assert.equal(f.read().extras,1);assert.equal(f.pendingVoidRef.current.size,0);assert.equal(f.read().visuals.length,0)}
 const old=fixture({hits:[{hit:true}]},88);old.recover({superseded:true});assert.equal(old.read().groups.length,0);
});
test('all battle modes use same queue, reset and target changes cancel old callbacks',()=>{
 assert.match(source,/queueVoidNumbers\(next, liveAction, mainDisplayedDamage, publishDamageDisplay/);
 assert.match(source,/queueVoidNumbers\(next, liveAction, shownBossMain/);
 assert.match(source,/pendingVoidRef.current.clear\(\)/);
 const renderer=readFileSync(new URL('../app/mage-void-collapse-vfx.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(renderer,/Math.random|setEnemyHp|setWorldDamage|resolveLiveCombatAttack/);
});
