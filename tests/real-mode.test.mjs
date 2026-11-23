import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks,stripTypeScriptTypes} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[cm]?[jt]sx?$/.test(s)?`${s}.ts`:s,c);}});
const progress=await import('../app/real-mode-progress.ts');
const combat=await import('../app/real-monster-combat.ts');
const {REAL_MONSTER_RULES}=await import('../app/real-monster-rules.ts');
const {balanceConfig}=await import('../app/balance-config.ts');
const {towerCombatValues,monsterProfile,lateGameMonsterScale,firstChapterHealth,secondChapterHealth}=await import('../app/balance.ts');
const {invalidSaveField}=await import('../app/save-field-schema.ts');
const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
const hpStart=page.indexOf('function monsterMaximumHealth('),hpEnd=page.indexOf('\nfunction baseMonsterName',hpStart);
const deps={balanceConfig,monsterProfile,lateGameMonsterScale,firstChapterHealth,secondChapterHealth,realModeScale:progress.realModeScale};
const hp=Function(...Object.keys(deps),stripTypeScriptTypes(page.slice(hpStart,hpEnd))+';return effectiveMonsterMaximumHealth;')(...Object.values(deps));
const base={combatPower:1e12,recommendedPower:balanceConfig.maps[8].bossPower,mapId:9,localFloor:30,tier:'boss',attacks:1,skillTriggered:false,setTier:0,playerAttack:1000000,playerDefense:6000,monsterName:'時墟主宰',roll:0};

test('every real entry exceeds the ordinary ninth-chapter final boss, with actual attack/armor/HP growth',()=>{
 const normal=towerCombatValues(base),normalHP=hp(9,base.recommendedPower,'boss','時墟主宰');
 for(let chapter=1;chapter<=4;chapter++)for(const tier of ['normal','elite','guardian','boss'])for(let floor=1;floor<=30;floor++){
  const values=towerCombatValues({...base,mapId:chapter,localFloor:floor,tier,monsterName:'腐骨鼠',realModeChapter:chapter});
  const health=hp(chapter,base.recommendedPower,tier,'腐骨鼠',chapter,floor);
  assert.ok(values.monsterAttack>normal.monsterAttack);assert.ok(values.monsterDefense>normal.monsterDefense);assert.ok(values.monsterDamage>normal.monsterDamage);assert.ok(health>normalHP);
  if(chapter>1){const previous=towerCombatValues({...base,mapId:chapter-1,localFloor:floor,tier,realModeChapter:chapter-1});assert.ok(values.monsterAttack>previous.monsterAttack);assert.ok(values.monsterDefense>previous.monsterDefense);assert.ok(health>hp(chapter-1,base.recommendedPower,tier,'腐骨鼠',chapter-1,floor));}
 }
 assert.ok(towerCombatValues({...base,realModeChapter:1,mapId:1,localFloor:1,tier:'normal'}).playerDamage<normal.playerDamage);
});

test('progress has safe legacy defaults, earned access, separate positions and sequential chapter gates',()=>{
 const old={mapBestFloors:{9:30},finalBossDefeated:true},r=progress.normalizeRealMode(undefined,old.mapBestFloors,old.finalBossDefeated);assert.equal(r.unlocked,true);assert.equal(r.mode,'normal');
 assert.equal(progress.normalizeRealMode(undefined,{9:30},false).unlocked,false);
 const entered={...r,acknowledged:true,mode:'real',bestFloors:{1:30},unlockedMapId:2,mapId:2};
 assert.equal(progress.validateRealModeTransition({mapBestFloors:{9:30},finalBossDefeated:true,realMode:entered},old).mapId,2);
 assert.throws(()=>progress.validateRealModeTransition({mapBestFloors:{9:29},realMode:entered},{mapBestFloors:{9:29}}));
 assert.throws(()=>progress.validateRealModeTransition({mapBestFloors:{9:30},finalBossDefeated:true,realMode:{...entered,unlockedMapId:4}},old));
 assert.throws(()=>progress.validateRealModeTransition({mapBestFloors:{9:30},finalBossDefeated:true,realMode:{...entered,bestFloors:{1:29}}},old));
 assert.equal(progress.validateRealModeTransition({mapBestFloors:{9:30}}, {...old,realMode:entered}).mode,'normal');
 assert.equal(progress.validateRealModeTransition({}, {...old,realMode:entered},true).unlocked,true);
 assert.equal(progress.validateRealModeTransition({}, {...old,realMode:entered},true).unlockedMapId,1);
 for(const mutation of [{wave:31},{bestFloors:{5:1}},{mapId:'2'},{mode:'other'},{acknowledged:1}])assert.equal(invalidSaveField({realMode:{...r,...mutation}}),'realMode');
});

test('rebirth permanently unlocks legacy saves and server validates the migration',()=>{
 const legacy={rebirthCount:1,mapBestFloors:{1:1},finalBossDefeated:false};
 const restored=progress.normalizeRealMode(undefined,legacy.mapBestFloors,false,legacy.rebirthCount);
 assert.equal(restored.unlocked,true);
 assert.equal(progress.normalizeRealMode(undefined,{},false,0).unlocked,false);
 assert.equal(progress.normalizeRealMode(undefined,{},false,'1').unlocked,false);
 assert.equal(progress.validateRealModeTransition({...legacy,realMode:{...restored,acknowledged:true,mode:'real'}},legacy).mode,'real');
 assert.equal(progress.validateRealModeTransition({...legacy,realMode:progress.emptyRealMode()},legacy).unlocked,true);
 assert.equal(progress.validateRealModeTransition({},legacy).unlocked,true);
 assert.equal(progress.validateRealModeTransition({}, {rebirthCount:0,mapBestFloors:{9:30}},true).unlocked,true);
 assert.throws(()=>progress.validateRealModeTransition({realMode:{...restored,acknowledged:true,mode:'real'}},{rebirthCount:0}));
});

function run(ability,{landed=()=>true,until=5000,killAt=Infinity,frozen=()=>false,tier='normal',floor=1}={}){
 const state=combat.createRealMonster('test',ability,tier,floor),hits=[],events=[],heals=[];let alive=true;
 const c={alive:()=>alive,hit:(r,id)=>{const hit=landed(r);hits.push({...r,id,at:state.clock,landed:hit});if(hits.length>=killAt)alive=false;return {landed:hit,damage:hit?10:0}},heal:f=>heals.push(f),notify:(type,detail)=>events.push({type,detail})};
 for(let t=0;t<until;t+=20)combat.advanceRealMonster(state,20,frozen(t),c);
 return {state,hits,events,heals,c};
}
test('all 24 approved skills settle every segment once at its configured contact time',()=>{
 for(const ability of Object.keys(REAL_MONSTER_RULES)){
  const rule=REAL_MONSTER_RULES[ability],duration=1500+rule.duration+40;
  const result=run(ability,{until:duration});const direct=result.hits.filter(h=>!h.dot);
  assert.equal(direct.length,rule.hitAt.length,ability);assert.equal(new Set(direct.map(h=>h.id)).size,direct.length);
  for(const[i,h]of direct.entries()){assert.ok(h.at>=1500+rule.hitAt[i]&&h.at<1520+rule.hitAt[i],ability);assert.equal(h.scale,rule.scales?.[i]??rule.scale)}
 }
});
test('twin serpents independently attach and refresh weakness only for landed bites',()=>{
 for(const a of [false,true])for(const b of [false,true]){
  const {state,hits}=run('serpentHex',{until:3000,landed:r=>r.index===0?a:b});assert.equal(hits.length,2);assert.equal(state.serpentGrip.mask,(a?1:0)|(b?2:0));assert.equal(state.fractureUntil,b?5780:a?5540:0);
 }
});
test('poison requires explosion contact; no poison on attachment alone or two misses',()=>{
 const attachment=run('venomPierce',{until:6000,landed:r=>r.index===0});assert.equal(attachment.state.poison,null);assert.equal(attachment.hits.filter(h=>h.dot).length,0);
 const burst=run('venomPierce',{until:6000,landed:r=>r.index===1});assert.equal(burst.hits.filter(h=>h.dot).length,3);assert.ok(burst.hits.filter(h=>h.dot).every(h=>h.scale===.2));
});
test('boss second skills alternate and death interrupts future segments/status/healing',()=>{
 for(const[main,extra]of [['knight','charge'],['boneBeast','boneBurial'],['ironWhip','ironExecution'],['mireTail','mireTide']]){
  const {events}=run(main,{until:11000,tier:'boss',floor:30});const cast=events.filter(e=>e.type==='dark-world-monster-cast');assert.equal(cast[0].detail.ability,main);assert.equal(cast[1].detail.ability,extra);
 }
 const dead=run('charge',{until:7000,killAt:1});assert.equal(dead.hits.length,1);
 assert.deepEqual(run('mireTail',{until:4000}).heals,[.3]);assert.deepEqual(run('mireTail',{until:4000,landed:()=>false}).heals,[]);assert.deepEqual(run('mireTail',{until:4000,killAt:1}).heals,[]);
});
test('freeze pauses in-flight animation/hits without accumulating an attack burst',()=>{
 const {hits}=run('claw',{until:2600,frozen:t=>t>=1600&&t<2000});assert.equal(hits.length,1);assert.ok(hits[0].at>=2080);assert.equal(combat.realMonsterModifiers(null).attack,1);
 const {state}=run('hound',{until:1800});assert.equal(combat.realMonsterModifiers(state).enemySpeed,1.2);
});
test('only the current chapter artwork is requested, every image exists, and renderer cleanup releases listeners',()=>{
 let total=0;for(let chapter=1;chapter<=4;chapter++){
  const sheets=JSON.parse(readFileSync(new URL(`../public/vfx/real-mode/chapter-${chapter}.json`,import.meta.url),'utf8'));
  assert.deepEqual(Object.keys(sheets.manifest),Object.keys(sheets.images));
  for(const[k,path]of Object.entries(sheets.images)){assert.ok(readFileSync(new URL(`../public${path}`,import.meta.url)).length>0);if(sheets.manifest[k].individual){assert.equal(sheets.manifest[k].cols,1);assert.equal(sheets.manifest[k].rows,1)}total++;}
 }
 assert.equal(total,142);const renderer=readFileSync(new URL('../app/real-monster-renderer.ts',import.meta.url),'utf8');assert.ok(renderer.includes('for(const release of listeners)release()'));assert.ok(!renderer.includes('getImageData'));assert.ok(!renderer.includes('img.decode'));assert.ok(!renderer.includes('images.clear()'));
 assert.ok(page.includes('custom:realCombatFloats'));assert.ok(page.includes('normalMapBestFloors[selectedBoss.mapId]'));assert.ok(page.includes('realMode:realProgress'));
});
