import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {presentEnemyDamage,enemyDefeatPresentationDelay} from '../app/combat-health-presentation.ts';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('./')&&!s.endsWith('.ts')?`${s}.ts`:s,c)}});
const {settleCombatHealth}=await import('../app/skill-health-settlement.ts');
const {splitAsyncDamageForDisplay,collectCombatFloats}=await import('../app/combat-float-events.ts');

test('fractional DOT ticks cannot leave the lethal final hit at 1 displayed HP',()=>{
 let raw=100,shown=100;
 const maximum=100;
 for(let tick=0;tick<3;tick++){
  const settled=settleCombatHealth(raw,maximum,14.2);raw=settled.remainingPercent;
  const dots=splitAsyncDamageForDisplay([{kind:'burn',damage:14.2}],settled.actualDamage).map((e,key)=>({...e,key}));
  const events=collectCombatFloats({groups:[],elementals:[],dots,player:null,enemy:null,miss:null,counter:null,boss:false});
  shown=presentEnemyDamage(shown,maximum,events,raw);
  assert.ok(Math.abs(shown-raw)<1e-8);
  assert.equal(Math.round(events[0].damage),14);
 }
 const lethal=settleCombatHealth(raw,maximum,60);
 assert.equal(lethal.defeated,true);
 assert.equal(presentEnemyDamage(shown,maximum,[hit(Math.round(lethal.actualDamage))],0),0);
});
const hit=(damage,target='enemy')=>({id:String(damage),target,channel:'primary',damage});
test('visible HP decreases per displayed segment and includes elemental/DOT/counter damage only once',()=>{
 let hp=100;
 for(const damage of [100,200,50])hp=presentEnemyDamage(hp,1000,[hit(damage)],65);
 assert.equal(hp,65);
 assert.equal(presentEnemyDamage(65,1000,[hit(900,'player'),{id:'miss',target:'enemy',channel:'status',text:'未命中'}],65),65);
});
test('overkill is clamped to settled HP and invalid damage cannot corrupt presentation',()=>{
 assert.equal(presentEnemyDamage(10,100,[hit(500)],0),0);
 assert.equal(presentEnemyDamage(100,100,[hit(500)],70),70);
 assert.equal(presentEnemyDamage(80,100,[hit(NaN),hit(-10)],80),80);
 assert.equal(presentEnemyDamage(80,0,[hit(5)],70),80);
});
test('one shared due-event callback drives both HP displays and terminal transitions',()=>{
 const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 const layer=readFileSync(new URL('../app/combat-damage-layer.tsx',import.meta.url),'utf8');
 assert.match(page,/onDamageShown=\{onEnemyDamageShown\}/);
 assert.match(page,/className="enemy-synced-health" value=\{presentedEnemyPercent\}/);
 assert.match(page,/healthFromPercent\(presentedEnemyPercent, activeBossBattle\.hp\)/);
 assert.match(page,/healthFromPercent\(presentedEnemyPercent,currentEnemyMaximumHealth\)/);
 assert.match(page,/enemyDefeatPresentationDelay\(visible,volleyPending\?Math.max\(1,presentedEnemyPercent\):presentedEnemyPercent/);
 assert.match(page,/pendingEnemyDefeatRef\.current=null;pending\.finish\(\)/);
 assert.match(page,/queueTowerKill\(triggered\?\.name/);
 assert.match(page,/pendingEnemyDefeatRef\.current=\{token:activeBossBattle,queuedAt:performance.now\(\),volleyKey,finish:\(\)=>resolveBossVictory/);
 assert.match(layer,/const shown=model\.current\.tick/);
 assert.match(layer,/damageShown\.current\?\.\(shown,previous\.current\.token\)/);
 assert.equal((page.match(/showCounterDamage\(settled.actualDamage,/g)||[]).length,3);
 assert.match(page,/showCounterDamage\(counterSettlement.actualDamage,/);
});

test('final damage clears floating point dust and the settlement rounded final HP',()=>{
 let hp=100;
 for(let i=0;i<10;i++)hp=presentEnemyDamage(hp,10,[hit(1)],0);
 assert.equal(hp,0);
 assert.equal(presentEnemyDamage(33.333,100,[hit(33)],0),0);
 assert.equal(presentEnemyDamage(1,100,[hit(0.51)],0),0);
 assert.equal(presentEnemyDamage(1,100,[hit(0.2)],0),0.8);
 assert.equal(presentEnemyDamage(0.1,100,[hit(0)],0.1),0.1);
});
test('missing final numbers have a bounded target-specific completion deadline',()=>{
 assert.equal(enemyDefeatPresentationDelay(true,1,1000,1000),6000);
 assert.equal(enemyDefeatPresentationDelay(true,1,1000,6900),100);
 assert.equal(enemyDefeatPresentationDelay(true,1,1000,7100),0);
 assert.equal(enemyDefeatPresentationDelay(true,0,1000,1200),120);
 assert.equal(enemyDefeatPresentationDelay(false,1,1000,1200),0);
 assert.equal(enemyDefeatPresentationDelay(true,0,1000,1200,240),240);
});

test('world-boss counter follows each shown hit including extras and DOT, capped by settled score',async()=>{
 const {presentWorldBossDamage}=await import('../app/combat-health-presentation.ts');
 let score=0;
 for(const [damage,expected] of [[100,100],[200,300],[50,350]]) {
  score=presentWorldBossDamage(score,[hit(damage)],350);
  assert.equal(score,expected);
 }
 assert.equal(presentWorldBossDamage(score,[hit(200,'player'),hit(NaN),hit(-1),{id:'miss',target:'enemy',channel:'status',text:'未命中'}],350),350);
 assert.equal(presentWorldBossDamage(300,[hit(999)],350),350);
 assert.equal(presentWorldBossDamage(0,[hit(80)],80),80);
});

test('world-boss score presentation shares HP callback, preserves settlement and resets across views/rounds',()=>{
 const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 assert.match(page, /presentWorldBossDamage\(current.damage, events, worldRoundDamage\)/);
 assert.match(page, /worldScoreToken && token === worldScoreToken && visibleWorldScore/);
 assert.match(page, /presentedWorldScore.token !== worldScoreToken \|\| presentedWorldScore.viewKey !== worldScoreViewKey/);
 assert.match(page, /<small>\{presentedWorldRoundDamage.toLocaleString\(\)\} 傷害<\/small>/);
 assert.match(page, /setWorldRoundDamage\(0\)/);
 const callback=page.slice(page.indexOf('const onEnemyDamageShown='),page.indexOf('const equippedSetGroups'));
 assert.doesNotMatch(callback,/setWorldDamage\(|setWorldRoundDamage\(/);
});
