import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {emptyElementSigilVisual} from '../app/element-sigil-frames.ts';
import {emptyOverloadVisual} from '../app/arcane-overload-frames.ts';
import {emptyManaShieldVisual} from '../app/mana-shield-frames.ts';
import {CombatPlaybackGuard,COMBAT_PLAYBACK_TIMEOUT_MS} from '../app/combat-playback-guard.ts';
const source=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const initializers=new Map();
function visit(node){if(ts.isVariableDeclaration(node))initializers.set(node.name.getText(ast),node.initializer);ts.forEachChild(node,visit);}visit(ast);
const recovery=initializers.get('recoverInterruptedUltimate').arguments[0].getText(ast);
const complete=initializers.get('finishUltimateAnimation').getText(ast);
const compile=fn=>ts.transpileModule(`return (${fn});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function fixture({tab='主控',visible=true,kind='泰坦',authorized=true}={}){
 const guard={current:new CombatPlaybackGuard()},lock={current:42};let now=1000,display=0,kills=0,visuals=[{key:42}];
 const pending={current:new Map()},published=new Set();
 if(kind==='箭雨')pending.current.set(42,index=>{if(!published.has(index)){published.add(index);display++;}});
 const astral={current:new Map()};
 if(kind==='法師')astral.current.set(42,{count:7,publish(index){if(!published.has(index)){published.add(index);display++;}}});
 const finish=new Function('ultimateAnimationLockRef','ultimatePlaybackGuardRef',compile(complete))(lock,guard);
 let titanPending=kind==='泰坦';let victoryPending=kind==='箭雨';let astralVictory=kind==='法師';
 const recover=new Function('ultimatePlaybackGuardRef','ultimateAnimationLockRef','tab','documentVisible','saveReady','sessionSuperseded',
  'pendingAstralDamageRef','finishAstralVisual','performance','publishTitanImpactDamage','pendingSkyDamageRef','finishSkyRainVisual','finishTitanUltimateVisual','finishUltimateAnimation','setSkillVisualEffects',compile(recovery))(
  guard,lock,tab,visible,authorized,!authorized,astral,key=>{astral.current.delete(key);finish(key);if(astralVictory){kills++;astralVictory=false;}},{now:()=>now},()=>{if(titanPending){display++;titanPending=false;}},pending,
  key=>{pending.current.delete(key);finish(key);if(victoryPending){kills++;victoryPending=false;}},finish,finish,
  update=>{visuals=update(visuals);});
 guard.current.begin(42,now);
 return {guard,lock,finish,recover,step(time){now=time;recover();},read:()=>({display,kills,visuals})};
}
test('a loaded, visible ultimate keeps both attacks paused until its normal completion',()=>{
 const f=fixture();f.step(1500);assert.equal(f.lock.current,42);assert.equal(f.read().display,0);
 f.finish(42);f.step(10000);assert.equal(f.lock.current,null);assert.equal(f.read().display,0);
});
for(const kind of ['泰坦','箭雨','法師'])for(const context of [{tab:'技能',visible:true},{tab:'主控',visible:false}])
 test(`${kind} releases its lock with the Canvas unmounted or browser hidden (${context.tab}/${context.visible})`,()=>{
  const f=fixture({...context,kind});f.step(1100);assert.equal(f.lock.current,null);
  assert.equal(f.read().display,kind==='泰坦'?1:kind==='箭雨'?9:7);assert.equal(f.read().kills,kind==='箭雨'||kind==='法師'?1:0);
  f.step(20000);assert.equal(f.read().kills,kind==='箭雨'||kind==='法師'?1:0);assert.deepEqual(f.read().visuals,[]);
 });
test('a hanging image or lost RAF has a bounded recovery deadline and publishes only once',()=>{
 const f=fixture();f.step(1000+COMBAT_PLAYBACK_TIMEOUT_MS-1);assert.equal(f.lock.current,42);
 f.step(1000+COMBAT_PLAYBACK_TIMEOUT_MS);assert.equal(f.lock.current,null);assert.equal(f.read().display,1);
 f.step(30000);assert.equal(f.read().display,1);
});
test('reset and stale completion cannot unlock or finish a new battle animation',()=>{
 const f=fixture();f.guard.current.clear();f.guard.current.begin(43,2000);f.lock.current=43;
 f.finish(42);assert.equal(f.lock.current,43);assert.equal(f.guard.current.takeRecovery(2001,true),null);
 f.guard.current.clear();assert.equal(f.guard.current.takeRecovery(50000,false),null);
});
test('duplicate begin calls cannot postpone the recovery deadline indefinitely',()=>{
 const g=new CombatPlaybackGuard();g.begin(1,1000);g.begin(1,7000);
 assert.equal(g.takeRecovery(9000,true),1);assert.equal(g.takeRecovery(10000,false),null);
});
test('session replacement remains stopped and cannot use recovery to award a kill',()=>{
 const f=fixture({kind:'箭雨',tab:'技能',authorized:false});f.step(20000);
 assert.equal(f.read().display,0);assert.equal(f.read().kills,0);
 assert.match(source,/if \(!saveReady \|\| sessionSuperseded \|\| !activeBossBattle \|\| bossOutcome\) return/);
});
test('both encounter loops begin guarded playback and all battle resets clear the lease',()=>{
 assert.equal((source.match(/beginUltimateAnimation\(next\)/g)||[]).length,2);
 const reset=initializers.get('resetCombatPerks').getText(ast);
 assert.match(reset,/ultimateAnimationLockRef.current=null/);assert.match(reset,/ultimatePlaybackGuardRef.current.clear\(\)/);
 assert.match(reset,/towerDeathPendingRef.current=false/);
 assert.match(source,/setInterval\(recoverInterruptedUltimate,100\)/);
});

test('entering and leaving a boss while a tower kill is pending clears the actual reset flags',()=>{
 const reset=initializers.get('resetCombatPerks').getText(ast);
 const names=[...new Set(reset.match(/\b(?:\w+Ref|set[A-Z]\w+|window)\b/g))];
 const values=Object.fromEntries(names.map(name=>[name,name==='window'?{clearTimeout(){}}:name.startsWith('set')?()=>{}:{current:new Map([[42,()=>{}]])}]));
 values.pendingEnemyDefeatRef.current={token:'tower:1',finish(){throw new Error('old defeat must not award after reset');}};
 values.towerDeathPendingRef.current=true;values.ultimateAnimationLockRef.current=42;
 values.ultimatePlaybackGuardRef.current=new CombatPlaybackGuard();values.ultimatePlaybackGuardRef.current.begin(42,1000);
 values.skyRainKeyRef.current=null;
 new Function(...names,"emptyElementSigilVisual","emptyManaShieldVisual","emptyOverloadVisual",compile(reset))
   (...names.map(name=>values[name]),emptyElementSigilVisual,emptyManaShieldVisual,emptyOverloadVisual)();
 assert.equal(values.towerDeathPendingRef.current,false);
 assert.equal(values.pendingEnemyDefeatRef.current,null);
 assert.equal(values.ultimateAnimationLockRef.current,null);
 assert.equal(values.ultimatePlaybackGuardRef.current.takeRecovery(20000,false),null);
 assert.equal(values.pendingSkyVictoryRef.current.size,0);
});
