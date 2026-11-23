import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks,stripTypeScriptTypes} from 'node:module';
import {readFileSync} from 'node:fs';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[cm]?[jt]sx?$/.test(s)?`${s}.ts`:s,c);}});
const {createChapterAssetCache}=await import('../app/real-monster-assets.ts');
const {createRealMonster,advanceRealMonster,realMonsterModifiers}=await import('../app/real-monster-combat.ts');
const {REAL_MONSTER_RULES}=await import('../app/real-monster-rules.ts');
const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
const flush=()=>new Promise(r=>setImmediate(r));

test('chapter preload shares work, survives StrictMode remount, reuses a ready bank, and waits for preparation',async()=>{
 const jobs=[],cache=createChapterAssetCache((chapter,progress,signal)=>new Promise(resolve=>jobs.push({chapter,progress,signal,resolve})));
 const seen=[];let off=cache.subscribe(1,s=>seen.push(s));off();off=cache.subscribe(1,s=>seen.push(s));await flush();
 assert.equal(jobs.length,1);assert.equal(jobs[0].signal.aborted,false);
 jobs[0].progress({done:11,total:12});assert.equal(seen.at(-1).assets,null);
 const bank={chapter:1};jobs[0].resolve(bank);await flush();assert.equal(seen.at(-1).assets,bank);
 off();await flush();const again=[];off=cache.subscribe(1,s=>again.push(s));await flush();assert.equal(jobs.length,1);assert.equal(again.at(-1).assets,bank);off();
});
test('cancelled or failed loading never enters a map and can be retried; evicted chapters do not accumulate',async()=>{
 const jobs=[],cache=createChapterAssetCache((chapter,progress,signal)=>new Promise((resolve,reject)=>{jobs.push({chapter,resolve,reject,signal});signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true});}));
 const seen=[];const off=cache.subscribe(1,s=>seen.push(s));await flush();off();await flush();assert.equal(jobs[0].signal.aborted,true);assert.ok(seen.every(s=>!s.assets));
 let retry=cache.subscribe(1,s=>seen.push(s));await flush();jobs[1].reject(Error('decode failure'));await flush();assert.ok(seen.at(-1).error);retry();
 retry=cache.subscribe(1,s=>seen.push(s));await flush();jobs[2].resolve({chapter:1});await flush();retry();await flush();
 const next=cache.subscribe(2,()=>{});await flush();jobs[3].resolve({chapter:2});await flush();next();await flush();
 const back=cache.subscribe(1,()=>{});await flush();assert.equal(jobs.length,5);jobs[4].resolve({chapter:1});await flush();back();
});

test('production map commit waits for assets and refuses stale login/run completions',()=>{
 const a=page.indexOf('  const finishRealMapEntry=useEffectEvent(()=>{'),b=page.indexOf('\n  useEffect(()=>{finishRealMapEntry()',a);
 const source=page.slice(a,b).replace('const finishRealMapEntry=useEffectEvent(', 'const finishRealMapEntry=(');
 const run=(overrides={})=>{const calls=[],env={pendingMapEntry:{kind:'map',chapter:3,origin:'run1'},saveReady:true,sessionSuperseded:false,mapEntryOrigin:'run1',realMapAssets:{assets:null},setPendingMapEntry:x=>calls.push(['pending',x]),commitWorldMode:x=>calls.push(['world',x]),commitEnterMap:x=>calls.push(['map',x]),...overrides};Function(...Object.keys(env),stripTypeScriptTypes(source)+';finishRealMapEntry();')(...Object.values(env));return calls;};
 assert.deepEqual(run(),[]);
 assert.deepEqual(run({realMapAssets:{assets:{}}}),[['pending',null],['map',3]]);
 assert.deepEqual(run({realMapAssets:{assets:{}},mapEntryOrigin:'new-run'}),[['pending',null]]);
 assert.deepEqual(run({realMapAssets:{assets:{}},sessionSuperseded:true}),[['pending',null]]);
 assert.deepEqual(run({realMapAssets:{assets:{}},saveReady:false}),[['pending',null]]);
 assert.ok(page.includes('runSummary || realMapLoading) return;'));
});

test('real player/enemy clocks continue throughout skills and ultimate playback; normal ultimate pause remains',()=>{
 const a=page.indexOf('        cadence.player += tickMs * realMonsterModifiers'),b=page.indexOf('        if (burningUntil',a);
 const cadenceSource=page.slice(a,b);
 // Execute the actual cadence statements and the actual ultimate early-return gate.
 const gate=page.match(/if \(!realMode && ultimateAnimationLockRef.current !== null\) return;/)[0];
 const step=Function('realMode','ultimateAnimationLockRef','realMonsterRef','cadence','realMonsterModifiers','liveEnemyControl',`${gate}\nconst tickMs=50,combatAttackSpeed=100,monsterAttackSpeed=100,combatPerksRef={current:{dodgeSpeedAttacks:0}},liveCombatRef={current:null};${cadenceSource};return {playerActs,monsterActs};`);
 const monster=createRealMonster('concurrent','charge','boss',30),cadence={player:0,enemy:0};let basics=0,player=0;const hits=[],casts=[];
 for(let t=0;t<9000;t+=50){advanceRealMonster(monster,50,false,{alive:()=>true,hit:(h,id)=>{hits.push({id,at:monster.clock});return {landed:true,damage:10};},heal(){},notify(type,p){if(type==='dark-world-monster-cast')casts.push(p);}});
  const actions=step(true,{current:44},{current:monster},cadence,realMonsterModifiers,()=>({frozen:false,speedMultiplier:1}));if(actions?.playerActs)player++;if(actions?.monsterActs)basics++;
 }
 assert.equal(player,9);assert.equal(basics,9);assert.equal(new Set(hits.map(h=>h.id)).size,hits.length);assert.ok(casts.length>=2);
 assert.equal(step(false,{current:44},{current:null},{player:0,enemy:0},realMonsterModifiers,()=>({frozen:false,speedMultiplier:1})),undefined);
});
test('each two-skill boss keeps alternate skills non-overlapping through freeze and missing renderer',()=>{
 for(const main of ['knight','boneBeast','ironWhip','mireTail']){
  const state=createRealMonster('boss',main,'boss',30),casts=[];
  for(let t=0;t<14000;t+=50)advanceRealMonster(state,50,t>=1700&&t<7700,{alive:()=>true,hit:()=>({landed:true,damage:1}),heal(){},notify(type,p){if(type==='dark-world-monster-cast')casts.push({...p});}});
  assert.ok(casts.length>=2);assert.notEqual(casts[0].ability,casts[1].ability);
  assert.ok(casts[1].start>=casts[0].start+REAL_MONSTER_RULES[casts[0].ability].duration+6000);
 }
});

test('prepared sprite bank warms isolated poses, jaws and eye textures before reporting ready',async()=>{
 const {prepareRealMonsterSheets}=await import('../app/real-monster-sprites.ts');
 const original={Image:globalThis.Image,document:globalThis.document};let allocations=0,reads=0,decodes=0;
 class Canvas{width=12;height=8;getContext(){return {drawImage(){},getImageData:()=>{reads++;return {data:new Uint8ClampedArray(this.width*this.height*4).fill(150)};},putImageData(){},beginPath(){},rect(){},clip(){}}}}
 globalThis.document={createElement(){allocations++;return new Canvas();}};
 globalThis.Image=class{naturalWidth=12;naturalHeight=8;async decode(){decodes++;}};
 try{
  const meta={cols:3,rows:2,frames:6,file:'sample.webp'};
  const sheets={manifest:{cavalry:meta,boneMaw:meta,houndHaste:{...meta,eyeAnchors:Array.from({length:6},()=>[[1,1],[3,1]]),portraitWidth:12,portraitHeight:8,sockets:[[.3,.3],[.7,.3]]}},images:{cavalry:'cavalry.webp',boneMaw:'maw.webp',houndHaste:'hound.webp'}};
  const progress=[];const bank=await prepareRealMonsterSheets(sheets,p=>progress.push(p),new AbortController().signal);
  assert.equal(decodes,3);assert.deepEqual(progress.at(-1),{done:3,total:3});
  const preparedAt=allocations,readAt=reads;
  for(let frame=0;frame<6;frame++){
   assert.ok(bank.cavalryFrame(bank.images.get('cavalry'),meta,frame));
   for(const part of ['upper','lower','all'])assert.ok(bank.mawTexture(frame,part));
   assert.equal(bank.houndTextures(frame).length,2);
  }
  assert.equal(allocations,preparedAt,'first cast must not allocate textures');assert.equal(reads,readAt,'first cast must not scan pixels');
  assert.equal(bank.images.get('cavalry').getContext,undefined,'full atlas pixels are released after warming');
 }finally{for(const [key,value]of Object.entries(original)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});

test('actual giant-crocodile heal captures Effect Event reads before React replays its state updater',()=>{
 const start=page.indexOf('            heal:fraction=>{'),end=page.indexOf('\n            },\n          });',start);
 assert.ok(start>0&&end>start);
 const body=page.slice(start+'            heal:fraction=>{'.length,end);
 const runtime={identity:'croc',serial:1,clock:2400};let rendering=false,hp=50,floats=[],reads=0;const queued=[];
 const env={runtime,towerCombatValues:()=>({monsterAttack:100}),combatPower:1,currentRecommendedPower:1,mapId:4,wave:30,currentCombatTier:'boss',currentEnemyBaseName:'腐沼巨鱷',currentEnemyMaximumHealth:1000,
  readRealFloatsVisible:()=>{assert.equal(rendering,false,'Effect Events are forbidden during state updater replay');reads++;return true;},
  realMonsterRef:{current:runtime},towerDeathPendingRef:{current:false},setEnemyHp:fn=>queued.push(fn),setRealCombatFloats:fn=>{floats=fn(floats);}};
 const heal=Function(...Object.keys(env),`return fraction=>{${stripTypeScriptTypes(body)}}`)(...Object.values(env));
 heal(.3);assert.equal(reads,1);assert.equal(queued.length,1);
 // State updaters can run later in React render, after the engine clock moves.
 runtime.clock=2450;runtime.serial=2;rendering=true;hp=queued[0](hp);assert.equal(hp,53);
 assert.equal(queued[0](50),53);assert.equal(floats.length,1);assert.equal(floats[0].id,'croc:heal:1:2400');
 env.towerDeathPendingRef.current=true;assert.equal(queued[0](0),0);
 env.towerDeathPendingRef.current=false;env.realMonsterRef.current={identity:'new-target'};assert.equal(queued[0](20),20);
});

test('pre-map loading includes the current class normal/ascended/ultimate artwork with valid sources',async()=>{
 const {PLAYER_SKILL_ASSETS}=await import('../app/player-skill-assets.ts');
 for(const cls of ['戰士','遊俠','法師']){
  assert.ok(PLAYER_SKILL_ASSETS[cls].length>=20);
  for(const path of PLAYER_SKILL_ASSETS[cls])assert.ok(readFileSync(new URL('../public'+path,import.meta.url)).length>0,path);
 }
 const hook=readFileSync(new URL('../app/use-real-map-assets.ts',import.meta.url),'utf8');
 assert.ok(hook.includes('assets:own?.assets?current?.assets??null:null'));
 assert.ok(page.includes('useRealMapAssets(requestedRealChapter,playerClass)'));
});
