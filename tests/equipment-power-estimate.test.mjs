import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks,stripTypeScriptTypes} from 'node:module';
import {readFileSync} from 'node:fs';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[cm]?[jt]sx?$/.test(s)?s+'.ts':s,c);}});
const {estimateSkillContribution}=await import('../app/combat-power-assessment.ts');
const {estimateEquipmentSkillContribution:estimate}=await import('../app/equipment-power-estimate.ts');
const {calculateAssessedCombatPower,emptyAssessmentTalents,normalizeSceneItem}=await import('../app/character-power.ts');
const {createSkillAscensions}=await import('../app/skill-ascensions.ts');
const {assessedRankingPower}=await import('../app/ranking-power.ts');
const {equipmentBaseStats,affixOptions,canonicalAffixes}=await import('../app/equipment-affixes.ts');
const {SKILL_MYTHICS,findEquipmentDefinition}=await import('../app/mythic-data.ts');
const {maps}=await import('../app/game-data.ts');
const asc=createSkillAscensions();
const layouts={戰士:['裂地斬','鮮血怒吼','不屈戰意','泰坦斷界斬','鐵骨','堅盾反射','破鎧追擊','重刃專精','格擋精通','泰坦餘震'],遊俠:['穿雲箭','疾風連射','獵殺標記','蒼穹箭雨','鷹眼','迅捷手感','精準連射','狩獵節奏','要害穿透','蒼穹餘響'],法師:['霜火新星','魔力護盾','隕星術','星界寂滅','奧術循環','奧術感知','焰脈','星界護體','護盾轉流','餘燼回響']};
const build=cls=>({ranks:Object.fromEntries(layouts[cls].map(n=>[n,5])),activeSlots:layouts[cls].slice(0,3)});
const stats={hp:10000,attack:1000,defense:1000,speed:150,hit:100,dodge:5,crit:35,critDamage:100,lifesteal:0,bossDamage:0,damageReduction:0,bossReduction:0,skillDamage:0};
const base=cls=>estimateSkillContribution(cls,100,build(cls),asc);
const calculate=(cls,items)=>calculateAssessedCombatPower(cls,100,items,[],build(cls),asc,{hp:0,attack:0,defense:0},{attack:0,defense:0},emptyAssessmentTalents,0,{hit:0,dodge:0});

test('equipped mechanisms add measured damage without an unconditional rarity bonus',()=>{
 for(const cls of Object.keys(layouts))for(const d of SKILL_MYTHICS.filter(d=>d.className===cls&&d.id!=='skill-ranger-queen-contract')){
  const b=base(cls),e=estimate(cls,100,build(cls),asc,[{mythicId:d.id}],stats,b);
  assert.ok(e.damageFactor>b.damageFactor,d.id);
  assert.ok(Object.values(e).every(Number.isFinite));assert.ok(Object.isFrozen(e));
 }
 const b=base('戰士');
 assert.equal(estimate('戰士',100,build('戰士'),asc,[{mythicId:'general-mythic-abyss-blade'}],stats,b),b);
 assert.equal(estimate('戰士',100,build('戰士'),asc,[{mythicId:'skill-ranger-sky-piercer'}],stats,b),b);
});

test('inactive equipment earns no skill bonus and legacy catalog names resolve consistently',()=>{
 const empty={ranks:{},activeSlots:[null,null,null]},b=estimateSkillContribution('遊俠',100,empty,asc);
 assert.equal(estimate('遊俠',100,empty,asc,[{mythicId:'skill-ranger-sky-piercer'}],stats,b),b);
 const passive={ranks:{迅捷手感:5},activeSlots:[null,null,null]},p=estimateSkillContribution('遊俠',100,passive,asc);
 assert.deepEqual(estimate('遊俠',100,passive,asc,[{mythicId:'skill-ranger-sky-piercer'}],stats,p),p);
 const cls='遊俠',id='skill-ranger-sky-piercer',name=SKILL_MYTHICS.find(d=>d.id===id).name;
 assert.deepEqual(estimate(cls,100,build(cls),asc,[{name}],stats,base(cls)),estimate(cls,100,build(cls),asc,[{mythicId:id}],stats,base(cls)));
});

test('paired samples are deterministic, order-independent and cannot mutate combat inputs or global RNG',()=>{
 const cls='戰士',gear=[{mythicId:'skill-warrior-titan-axe'},{mythicId:'skill-warrior-fallen-city'}];
 const original=JSON.stringify([gear,build(cls),asc,stats]),random=Math.random;
 const a=estimate(cls,100,build(cls),asc,gear,stats,base(cls));
 const b=estimate(cls,100,build(cls),asc,[...gear].reverse(),stats,base(cls));
 assert.deepEqual(a,b);assert.equal(JSON.stringify([gear,build(cls),asc,stats]),original);assert.equal(Math.random,random);
 assert.deepEqual(a,estimate(cls,100,build(cls),asc,[...gear,gear[0]],stats,base(cls)));
 const inactive=estimate(cls,100,build(cls),asc,[],stats,base(cls));assert.equal(inactive,base(cls));
});

test('HP explosions and defense counters respond to the actual permanent stat ratios',()=>{
 const cls='法師',gear=[{mythicId:'skill-mage-eternal-core'}];
 const low=estimate(cls,100,build(cls),asc,gear,stats,base(cls));
 const high=estimate(cls,100,build(cls),asc,gear,{...stats,hp:stats.hp*2},base(cls));
 assert.ok(high.damageFactor>low.damageFactor);
 const w=[{mythicId:'skill-warrior-fallen-city'}];
 assert.ok(estimate('戰士',100,build('戰士'),asc,w,{...stats,defense:stats.defense*2},base('戰士')).damageFactor>
   estimate('戰士',100,build('戰士'),asc,w,stats,base('戰士')).damageFactor);
});

test('panel and offline ranking agree for all three equipped mythic builds',()=>{
 for(const cls of Object.keys(layouts)){
  const items=SKILL_MYTHICS.filter(d=>d.className===cls).map((d,i)=>normalizeSceneItem({id:i+1,name:d.name,slot:d.slot,quality:'神話',enhance:10,power:100,mapId:9,set:'',affixes:[],mythicId:d.id}));
  const save={playerClass:cls,level:100,items,loadouts:{1:items.map(i=>i.id),2:[]},skillReworkBuild:build(cls),skillAscensions:asc};
  const snapshot=JSON.stringify(save),after=calculate(cls,items);
  assert.equal(assessedRankingPower(save),after,cls);
  assert.equal(JSON.stringify(save),snapshot);
 }
});

test('actual equipment detail wrapper shares scene and catalog base values with the panel',()=>{
 const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 const start=page.indexOf('function equipmentBaseStats('),end=page.indexOf('\n}\n',start)+2;
 const wrapper=Function('sharedEquipmentBaseStats',stripTypeScriptTypes(page.slice(start,end))+';return equipmentBaseStats;')(equipmentBaseStats);
 for(const map of maps)for(const quality of ['普通','良好','優秀','史詩','傳奇'])for(const enhance of [0,5,10,15]){
  const g={name:map.set+'武器',slot:'武器',quality,enhance,mapId:map.id,set:map.set,affixes:[]};
  assert.deepEqual(wrapper(g),equipmentBaseStats(g));assert.deepEqual(wrapper(g,enhance+1),equipmentBaseStats(g,enhance+1));
 }
});

test('power-upgrade salvage protection uses full replacement value rather than standalone equipment rating',()=>{
 const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 const start=page.indexOf('const salvaged = autoSalvage'),end=page.indexOf('const salvagedIds',start);
 const fn=Function('cleanLoot','autoSalvage','autoSalvageQuality','protectSetGear','protectPowerUpgrade','items','equipped','getItemEpithets','findEquipmentDefinition','powerDifferenceForItem',stripTypeScriptTypes(page.slice(start,end))+';return salvaged;');
 const worn={id:1,name:'舊裝',slot:'武器'},better={id:2,name:'新裝',slot:'武器'},worse={id:3,name:'新裝',slot:'武器'};
 const result=fn([better,worse],true,'全分解',false,true,[worn],[1],()=>({}),findEquipmentDefinition,g=>g.id===2?100:-100);
 assert.deepEqual(result,[worse]);
});


test('previously negative axe, hunter eye and shield core replacements now include their usable effects',()=>{
 const slots=['武器','頭盔','胸甲','手套','鞋子','項鍊','戒指','腰帶','護腕','披風'];
 const roll=g=>{const pool=affixOptions(g);return canonicalAffixes({...g,affixes:[pool[0].name,'攻擊%','暴擊','攻速',...(g.quality==='神話'?['暴擊傷害']:[])].map(name=>{const r=pool.find(o=>o.name===name);return `${name} +${Math.floor((r.minimum+r.maximum)/2)}${r.percent?'%':''}`;})});};
 for(const [cls,id] of [['戰士','skill-warrior-titan-axe'],['遊俠','skill-ranger-hunter-eye'],['法師','skill-mage-eternal-core']]){
  const gear=slots.map((slot,i)=>{const g={id:i+1,name:maps[8].set+slot,slot,mapId:9,quality:'傳奇',enhance:10,set:maps[8].set,affixes:[]};return {...g,affixes:roll(g)};});
  const d=SKILL_MYTHICS.find(d=>d.id===id);
  const replacement=gear.map(g=>{if(g.slot!==d.slot)return g;const n={...g,name:d.name,mythicId:d.id,set:'',quality:'神話'};return {...n,affixes:roll(n)};});
  assert.ok(calculate(cls,replacement)>calculate(cls,gear),cls);
 }
});


test('actual bag power sorting follows replacement gains even when standalone ratings disagree',()=>{
 const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 const start=page.indexOf('const visibleBagItems ='),end=page.indexOf('// 批次分解後',start);
 const fn=Function('bagItems','bagCategory','bagSort','defensiveSlots','accessorySlots','unseenItemIds','qualityOrder','items','powerDifferenceForItem','equipmentDisplayRating',stripTypeScriptTypes(page.slice(start,end))+';return visibleBagItems;');
 const gear=[{id:1,slot:'武器'},{id:2,slot:'武器'}];
 const sorted=fn(gear,'全部','戰力',new Set(),new Set(),[],[],gear,g=>g.id===1?-100:100,g=>g.id===1?9999:1);
 assert.deepEqual(sorted.map(g=>g.id),[2,1]);
});


test('actual swap projection reverses replacement deltas and uses removal for worn items',()=>{
 const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 const start=page.indexOf('const powerDifferenceForItem ='),end=page.indexOf('const visibleBagItems =',start);
 const factory=Function('equipped','equippedGear','assessGearPower','assessedCombatPower',stripTypeScriptTypes(page.slice(start,end))+';return powerDifferenceForItem;');
 const original={id:1,name:'時墟輪迴武器',slot:'武器',mapId:9,quality:'傳奇',enhance:10,set:'時墟輪迴',affixes:[]};
 const upgraded={...original,id:2,name:'《裂界・泰坦戰斧》',mythicId:'skill-warrior-titan-axe',quality:'神話',set:''};
 const assess=gear=>calculate('戰士',gear),before=assess([original]),after=assess([upgraded]);
 const equipDelta=factory([1],[original],assess,before)(upgraded);
 const replaceBack=factory([2],[upgraded],assess,after)(original);
 assert.equal(equipDelta,after-before);assert.equal(equipDelta+replaceBack,0);
 assert.equal(factory([2],[upgraded],assess,after)(upgraded),assess([])-after);
 assert.equal(factory([2],[upgraded],assess,after)({...upgraded,id:3}),0);
 assert.deepEqual(original.affixes,[]);
});
