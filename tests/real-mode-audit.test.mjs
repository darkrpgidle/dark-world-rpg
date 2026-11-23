import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks,stripTypeScriptTypes} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[cm]?[jt]sx?$/.test(s)?`${s}.ts`:s,c);}});
const {balanceConfig}=await import('../app/balance-config.ts');
const balance=await import('../app/balance.ts');
const {realModeScale}=await import('../app/real-mode-progress.ts');
const {settleCombatHealth}=await import('../app/skill-health-settlement.ts');
const {presentEnemyDamage}=await import('../app/combat-health-presentation.ts');
const {createChapterAssetCache}=await import('../app/real-monster-assets.ts');
const {createRealMonster,realMonsterModifiers}=await import('../app/real-monster-combat.ts');
const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('page.tsx',page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const nodes=[];function walk(node){nodes.push(node);ts.forEachChild(node,walk);}walk(ast);
const hpStart=page.indexOf('function monsterMaximumHealth('),hpEnd=page.indexOf('\nfunction baseMonsterName',hpStart);
const deps={balanceConfig,realModeScale,...Object.fromEntries(['monsterProfile','lateGameMonsterScale','firstChapterHealth','secondChapterHealth'].map(n=>[n,balance[n]]))};
const hp=Function(...Object.keys(deps),stripTypeScriptTypes(page.slice(hpStart,hpEnd))+';return effectiveMonsterMaximumHealth;')(...Object.values(deps));
const main=nodes.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)==='enemyMaximumHealth'&&n.initializer?.getText(ast).startsWith('effectiveMonsterMaximumHealth'));
const getMain=Function('effectiveMonsterMaximumHealth','mapId','currentRecommendedPower','tier','currentEnemyBaseName','realMode','wave',`return ${stripTypeScriptTypes(main.initializer.getText(ast))};`);

test('actual primary damage ledger uses the displayed real HP at every chapter/tier/floor, including finishing damage',()=>{
 for(const real of [false,true])for(let chapter=1;chapter<=4;chapter++)for(const tier of ['normal','elite','guardian','boss'])for(let floor=1;floor<=30;floor++){
  const name=['腐骨鼠','骨弓手','礦穴蝠','毒囊蛛'][chapter-1],power=balanceConfig.maps[8].bossPower;
  const maximum=getMain(hp,chapter,power,tier,name,real,floor),displayed=hp(chapter,power,tier,name,real?chapter:0,floor);
  assert.equal(maximum,displayed,`${real}:${chapter}:${tier}:${floor}`);
  let raw=100,shown=100;
  for(const amount of [displayed*.14+.2,displayed*.33+.2,displayed]){
   const result=settleCombatHealth(raw,maximum,amount);raw=result.remainingPercent;
   shown=presentEnemyDamage(shown,displayed,[{id:'hit',target:'enemy',channel:'primary',damage:result.actualDamage}],raw);
   assert.ok(Math.abs(shown-raw)<100/displayed+1e-7); // existing integer HP text boundary
  }
  assert.equal(raw,0);assert.equal(shown,0);
 }
 const game=nodes.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='Game');
 const calls=nodes.filter(n=>ts.isCallExpression(n)&&n.expression.getText(ast)==='effectiveMonsterMaximumHealth'&&n.pos>game.pos&&n.end<game.end);
 assert.ok(calls.length>=6);assert.ok(calls.every(n=>n.arguments.length===6),'all live HP paths must pass world and floor');
});

test('actual blood shield guards share one encounter consumption across simultaneous basic and skill hits',()=>{
 const basic=nodes.find(n=>ts.isIfStatement(n)&&n.expression.getText(ast).startsWith('hasBlessing("blood") && bloodShieldReady &&'));
 const skill=nodes.find(n=>ts.isIfStatement(n)&&n.expression.getText(ast).startsWith("!request.dot&&hasBlessing('blood')"));
 const run=(source,env,damageName)=>Function(...Object.keys(env),`let ${damageName}=100;${stripTypeScriptTypes(source)};return ${damageName};`)(...Object.values(env));
 for(const order of ['basic-first','skill-first']){
  const runtime={identity:'monster'},env={realMode:true,realMonsterRef:{current:runtime},runtime,request:{dot:false},bloodShieldReady:true,hasBlessing:()=>true,blessingUpgraded:()=>false,setBloodShieldReady(){},setCausePrompt(){}};
  const a=()=>run(basic.getText(ast),env,'monsterDamage'),b=()=>run(skill.getText(ast),env,'damage');
  assert.deepEqual(order==='basic-first'?[a(),b()]:[b(),a()],[20,100]);
  assert.equal(runtime.bloodShieldUsed,true);
 }
});

test('weaken and fracture affect live real counters and defenses, expire normally, and do not leak into boss battles',()=>{
 const basicCounters=nodes.filter(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)==='counter'&&n.initializer?.getText(ast).includes('liveDefense.counterDamagePercent'));
 const skillCounter=nodes.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)==='amount'&&n.initializer?.getText(ast).includes('result.counterDamagePercent'));
 const defenses=nodes.filter(n=>ts.isCallExpression(n)&&n.expression.getText(ast)==='resolveLiveEnemyAttack').map(n=>n.arguments[1]).filter(n=>n&&ts.isObjectLiteralExpression(n));
 const basicDefenses=defenses.filter(n=>n.properties.some(p=>p.name?.getText(ast)==='healthPercent'&&p.initializer?.getText(ast)==='playerHealth'));
 const skillDefense=defenses.find(n=>n.properties.some(p=>p.name?.getText(ast)==='healthPercent'&&p.initializer?.getText(ast)==='health'));
 const bossDefense=defenses.find(n=>n.properties.some(p=>p.name?.getText(ast)==='healthPercent'&&p.initializer?.getText(ast)==='bossPlayerHpRef.current'));
 assert.equal(basicCounters.length,2);assert.equal(basicDefenses.length,2);assert.ok(skillCounter&&skillDefense&&bossDefense);
 const defenseExpression=n=>n.properties.find(p=>p.name?.getText(ast)==='defense').initializer.getText(ast);
 const runtime=createRealMonster('target','miasmaBreath','normal',1);runtime.weakenUntil=3000;runtime.fractureUntil=3000;
 for(const [realMode,clock,expectedAttack,expectedDefense]of [[true,0,85,80],[true,3000,100,100],[false,0,100,100]]){
  runtime.clock=clock;
  const mods=realMonsterModifiers(realMode?runtime:null),env={realMode,realMonsterRef:{current:runtime},realMonsterModifiers,mods,characterStats:{attack:100,defense:100},liveDefense:{counterDamagePercent:100,equipmentDamage:20},result:{counterDamagePercent:100,equipmentDamage:20}};
  const value=source=>Function(...Object.keys(env),`return ${stripTypeScriptTypes(source)};`)(...Object.values(env));
  for(const counter of [...basicCounters,skillCounter])assert.equal(value(counter.initializer.getText(ast)),expectedAttack+20);
  for(const defense of [...basicDefenses,skillDefense])assert.equal(value(defenseExpression(defense)),expectedDefense);
  assert.equal(value(defenseExpression(bossDefense)),100,'personal/world boss does not inherit tower debuffs');
 }
});

test('stale completion, death, execution and blessing timers cannot mutate a new real encounter',()=>{
 const callbacks=nodes.filter(n=>ts.isCallExpression(n)&&/^(window\.)?setTimeout$/.test(n.expression.getText(ast))&&n.arguments[0]&&ts.isArrowFunction(n.arguments[0]))
  .map(n=>n.arguments[0].getText(ast));
 for(const name of ['finishRun("complete"','advanceToNextEnemy()','offerBlessings()']){
  const source=callbacks.find(s=>s.includes(name)&&s.includes('readTowerEncounter'));
  assert.ok(source,name);
  for(const valid of [false,true]){
   const calls=[],env={realMode:true,readTowerEncounter:()=>valid,targetKey:'old',runStartedAt:1,mapId:1,nextWave:11,readTowerHealth:()=>100,MAP_FLOORS:30,finishRun:()=>calls.push('finish'),advanceToNextEnemy:()=>calls.push('advance'),offerBlessings:()=>calls.push('bless')};
   Function(...Object.keys(env),`(${stripTypeScriptTypes(source)})();`)(...Object.values(env));
   assert.equal(calls.length,valid?1:0,name);
  }
 }
 const deaths=callbacks.filter(s=>/finishRun\(['"]death['"]/.test(s));assert.equal(deaths.length,3);
 for(const source of deaths)for(const [valid,health,expected]of [[false,0,0],[true,0,1],[true,100,0]]){
  let called=0;const env={realMode:true,readTowerEncounter:()=>valid,readTowerHealth:()=>health,targetKey:'old',wave:1,finishRun:()=>called++};
  Function(...Object.keys(env),`(${stripTypeScriptTypes(source)})();`)(...Object.values(env));assert.equal(called,expected);
 }
});

test('image timeout exits loading and supports retry even if decode/fetch never acknowledges abort',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const jobs=[],seen=[];
 const cache=createChapterAssetCache(()=>new Promise(resolve=>jobs.push(resolve)),1000);
 const off=cache.subscribe(1,s=>seen.push(s));await new Promise(r=>setImmediate(r));
 t.mock.timers.tick(1000);await new Promise(r=>setImmediate(r));assert.ok(seen.at(-1).error);assert.equal(seen.at(-1).assets,null);off();
 const retry=cache.subscribe(1,s=>seen.push(s));await new Promise(r=>setImmediate(r));jobs[1]({ready:true});await new Promise(r=>setImmediate(r));assert.equal(seen.at(-1).assets.ready,true);
 jobs[0]({stale:true});await new Promise(r=>setImmediate(r));assert.equal(seen.at(-1).assets.ready,true);retry();
 // Completion and timeout may share the same microtask turn. Neither ordering
 // may leave a subscriber permanently pending without assets or an error.
 for(let microtasks=0;microtasks<9;microtasks++){
  let latest;const racing=createChapterAssetCache(()=>Promise.resolve({ready:true}),1000);
  const release=racing.subscribe(1,s=>latest=s);
  for(let i=0;i<microtasks;i++)await Promise.resolve();
  t.mock.timers.tick(1000);await new Promise(r=>setImmediate(r));
  assert.ok(latest.assets||latest.error,`completion/timeout order ${microtasks} must settle`);release();
 }
});

test('renderer ignores late impact callbacks owned by a previous monster',()=>{
 const source=readFileSync(new URL('../app/real-monster-renderer.ts',import.meta.url),'utf8');
 const tree=ts.createSourceFile('renderer.ts',source,ts.ScriptTarget.Latest,true);let callback;
 function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(tree)==='addEventListener'&&n.arguments[0]?.text==='dark-world-monster-hit')callback=n.arguments[1].getText(tree);ts.forEachChild(n,visit);}visit(tree);
 let impacts=0,wakes=0;const fx={hits:[]},handler=Function('identity','active','impact','__monsterWake',`return ${callback};`)('new',new Map([['cast',fx]]),()=>impacts++,()=>wakes++);
 handler({detail:{identity:'old',castId:'cast',index:0,damage:99,landed:true}});assert.equal(impacts,0);assert.equal(fx.hits.length,0);
 handler({detail:{identity:'new',castId:'cast',index:0,damage:10,landed:true}});assert.equal(impacts,1);assert.equal(wakes,1);assert.equal(fx.hits[0].damage,10);
});
