import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[cm]?[jt]sx?$/.test(s)?`${s}.ts`:s,c);}});
const {equipmentBaseStats,affixOptions,canonicalAffixes,rollAffixes}=await import('../app/equipment-affixes.ts');
const {maps}=await import('../app/game-data.ts');
const {GENERAL_MYTHICS,SKILL_MYTHICS,SPECIAL_LEGENDARIES}=await import('../app/mythic-data.ts');
const {applyEquipmentAction}=await import('../app/equipment-save-policy.ts');
const slots=['武器','頭盔','胸甲','手套','鞋子','項鍊','戒指','腰帶','護腕','披風'];
const qualities=['普通','良好','優秀','史詩','傳奇'];
const item=(mapId,slot,quality='傳奇',set=true)=>({id:1,name:`${set?maps[mapId-1].set:maps[mapId-1].gearPrefix}${slot}`,mapId,slot,quality,set:set?maps[mapId-1].set:'',enhance:10,affixes:[],equipmentType:'場景普通裝備'});

test('all map slots and qualities grow without the chapter-three spike or chapter-six stall',()=>{
 for(const slot of slots)for(const quality of qualities)for(const set of [false,true]){
  const rows=maps.map(m=>equipmentBaseStats(item(m.id,slot,quality,set)));
  for(let stat=0;stat<rows[0].length;stat++)for(let i=1;i<rows.length;i++){
   const ratio=rows[i][stat].original/rows[i-1][stat].original;
   assert.ok(ratio>1.25&&ratio<2.25,`${slot}/${quality}/${i+1}: ${ratio}`);
  }
  for(const mapId of [1,9])assert.deepEqual(equipmentBaseStats(item(mapId,slot,quality,set)),equipmentBaseStats(item(mapId,slot,quality,set),10,true));
 }
});

test('all catalog effects retain original base stats and affix ranges at every map',()=>{
 for(const definition of [...GENERAL_MYTHICS,...SKILL_MYTHICS,...SPECIAL_LEGENDARIES])for(const m of maps){
  const g={...item(m.id,definition.slot),name:definition.name,set:'',quality:definition.kind==='special-legendary'?'傳奇':'神話',equipmentType:definition.kind==='special-legendary'?'特殊傳奇':'神話裝備',...(definition.kind==='special-legendary'?{legendaryId:definition.id}:{mythicId:definition.id})};
  assert.deepEqual(equipmentBaseStats(g),equipmentBaseStats(g,10,true));
  assert.deepEqual(affixOptions(g),affixOptions(g,true));
 }
});

test('legacy map names infer the same map curve without new save fields',()=>{
 for(const m of maps)for(const set of [false,true]){
  const g=item(m.id,'武器','傳奇',set),legacy={...g};delete legacy.mapId;delete legacy.equipmentType;
  assert.deepEqual(equipmentBaseStats(legacy),equipmentBaseStats(g));
 }
});

test('previous flat rolls survive normalization and targeted reforge without free rerolls',()=>{
 for(const m of maps)for(const quality of qualities.slice(1))for(const slot of slots){
  const g=item(m.id,slot,quality),historical=affixOptions(g,true);
  for(const name of ['攻擊','防禦','生命'])for(const endpoint of ['minimum','maximum']){
   const option=historical.find(o=>o.name===name);g.affixes=[`${name} +${option[endpoint]}`];
   assert.deepEqual(canonicalAffixes(g),g.affixes);
  }
 }
 const g=item(3,'武器'),old=affixOptions(g,true).find(o=>o.name==='攻擊');
 g.affixes=[`攻擊 +${old.maximum}`,'暴擊 +6%'];
 const save={items:[g],gold:100000,reforgeStones:100,adminRevision:0};
 const action={id:crypto.randomUUID(),kind:'reforge',itemId:1,targetIndex:1};
 const result=applyEquipmentAction(save,action);
 assert.ok(result.accepted);assert.equal(result.item.affixes[0],g.affixes[0]);
 assert.equal(applyEquipmentAction(result.save,action).accepted,false);
 assert.ok(result.save.gold<save.gold);assert.deepEqual(save.items[0],g);
});

test('new flat rolls use the current curve and corrupted old values remain bounded',()=>{
 for(const m of maps)for(const slot of slots){
  const g=item(m.id,slot),options=affixOptions(g);
  for(let i=0;i<10;i++)for(const affix of rollAffixes(g)){
   const value=Number(affix.match(/\d+/)[0]);const normalized=canonicalAffixes({...g,affixes:[affix]})[0];
   const range=options.find(o=>normalized.startsWith(`${o.name} +`));
   assert.ok(value>=range.minimum&&value<=range.maximum);
  }
  const current=options.find(o=>o.name==='攻擊'),old=affixOptions(g,true).find(o=>o.name==='攻擊');
  assert.deepEqual(canonicalAffixes({...g,affixes:['攻擊 +999999']}),[`攻擊 +${Math.max(current.maximum,old.maximum)}`]);
 }
});

test('pre-buff scene health and defense survive repeated normalization at every slot and quality',()=>{
 for(const m of maps)for(const quality of qualities.slice(1))for(const slot of slots){
  const g=item(m.id,slot,quality),old=affixOptions(g,false,true);
  for(const name of ['生命','防禦'])for(const endpoint of ['minimum','maximum']){
   const value=old.find(o=>o.name===name)[endpoint];
   const affixes=[`${name} +${value}`];
   assert.deepEqual(canonicalAffixes({...g,affixes}),affixes);
   assert.deepEqual(canonicalAffixes({...g,affixes:canonicalAffixes({...g,affixes})}),affixes);
  }
  const current=affixOptions(g);
  for(const option of old.filter(o=>!['生命','防禦'].includes(o.name)))assert.deepEqual(current.find(o=>o.name===option.name),option);
 }
});

test('targeted scene reforge improves only selected health/defense core and preserves old lines and replay safety',()=>{
 for(const slot of ['胸甲','腰帶']){
  const g=item(9,slot),old=affixOptions(g,false,true),current=affixOptions(g);
  const core=old[0],health=old.find(o=>o.name==='生命'),defense=old.find(o=>o.name==='防禦');
  g.affixes=[`${core.name} +${core.minimum}`,`生命 +${health.minimum}`,`防禦 +${defense.minimum}`,'攻擊% +8%'];
  const save={items:[g],gold:100000,reforgeStones:100,adminRevision:0};
  const action={id:crypto.randomUUID(),kind:'reforge',itemId:1,targetIndex:0};
  const r=applyEquipmentAction(save,action),value=Number(r.item.affixes[0].match(/\d+/)[0]);
  assert.ok(r.accepted);assert.ok(value>=current[0].minimum&&value<=current[0].maximum);
  assert.ok(current[0].minimum>core.minimum);
  assert.deepEqual(r.item.affixes.slice(1),g.affixes.slice(1));
  assert.equal(applyEquipmentAction(r.save,action).accepted,false);
 }
});

test('old and new scene flat defense/health values remain bounded, while catalog pools stay unchanged',()=>{
 for(const map of maps)for(const slot of slots){
  const g=item(map.id,slot);
  for(const name of ['生命','防禦']){
   const ranges=[affixOptions(g),affixOptions(g,false,true),affixOptions(g,true)].map(p=>p.find(o=>o.name===name));
   const max=Math.max(...ranges.map(o=>o.maximum));
   assert.deepEqual(canonicalAffixes({...g,affixes:[`${name} +999999`]}),[`${name} +${max}`]);
  }
 }
 for(const def of [...GENERAL_MYTHICS,...SKILL_MYTHICS,...SPECIAL_LEGENDARIES]){
  const g={...item(9,def.slot),name:def.name,set:'',quality:def.kind==='special-legendary'?'傳奇':'神話',...(def.kind==='special-legendary'?{legendaryId:def.id}:{mythicId:def.id})};
  assert.deepEqual(affixOptions(g),affixOptions(g,false,true));
 }
});
