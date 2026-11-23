import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[cm]?[jt]sx?$/.test(s)?`${s}.ts`:s,c)}});
const gems=await import('../app/gem-system.ts');
const {applyGemAction,preserveGemSave}=await import('../app/gem-save-policy.ts');
const {invalidSaveField}=await import('../app/save-field-schema.ts');
const {validateSaveTransition}=await import('../app/save-integrity.ts');
const {GEM_IDS,GEM_TIERS,fusionRate,fuseGemBatch,fuseGemSelection,getGemDefinition,gemInventoryDelta,normalizeGemInventory,normalizeEquipmentSockets}=gems;
const stack=(gemId='redIron',tier='beginner',quantity=2)=>({gemId,tier,quantity});
const save=(inventory=[stack()])=>({items:[{id:1,name:'劍',sockets:{socketCount:2,gems:[null,null]}},{id:2,name:'甲',sockets:{socketCount:1,gems:[null]}}],gemInventory:inventory,gemPowder:0});
const action=(kind='fuse',extra={})=>({id:crypto.randomUUID(),kind,targetLevel:5,reserve:0,maxMaterials:100,...extra});
test('sixteen gem types have ten monotonic levels and retain every legacy tier value',()=>{
 assert.equal(GEM_IDS.length,16);assert.equal(GEM_TIERS.length,10);
 for(const id of GEM_IDS){let previous=0;for(const tier of GEM_TIERS){const d=getGemDefinition(id,tier);assert.ok(d.value>previous);previous=d.value;assert.match(d.tierLabel,/^Lv\.\d+$/);}}
 assert.deepEqual(GEM_TIERS.slice(0,3).map(t=>getGemDefinition('redIron',t).value),[3,5,8]);
 assert.equal(getGemDefinition('redIron','lv10').value,40);
 assert.equal(normalizeEquipmentSockets({socketCount:1,gems:[{gemId:'redIron',tier:'advanced'}]}).gems[0].tier,'advanced');
 assert.deepEqual(GEM_TIERS.slice(0,9).map(fusionRate),[1,1,1,1,.8,.65,.5,.35,.25]);
});
test('batch fusion uses only identical types and levels, chains low to high and never consumes locked stacks',()=>{
 assert.equal(fuseGemSelection([stack()], [{gemId:'redIron',tier:'beginner'},{gemId:'phantom',tier:'beginner'}]),null);
 const locked={...stack('thorns','beginner',16),locked:true};
 const result=fuseGemBatch([stack('redIron','beginner',16),stack('rift','beginner',1),locked],{targetLevel:5,reserve:0,maxMaterials:100},()=>.99);
 assert.equal(result.successes,15);assert.equal(result.failures,0);
 assert.deepEqual(result.inventory,[stack('rift','beginner',1),locked,stack('redIron','lv5',1)]);
 assert.equal(result.consumed,30);
});
test('failure keeps one original and bounds reserve, budget and maximum level',()=>{
 const result=fuseGemBatch([stack('redIron','lv5',5)],{targetLevel:10,reserve:1,maxMaterials:3},()=>.99);
 assert.equal(result.failures,2);assert.equal(result.consumed,2);assert.equal(result.inventory[0].quantity,3);
 assert.equal(fuseGemBatch([stack()],{targetLevel:11,reserve:0,maxMaterials:100}),null);
 const max=fuseGemBatch([stack('redIron','lv10',100)],{targetLevel:10,reserve:0,maxMaterials:100});assert.equal(max.attempts,0);
 const single=fuseGemBatch([stack('redIron','beginner',4),stack('redIron','lv5',2)],{targetLevel:6,reserve:0,maxMaterials:2,sourceTier:'lv5'},()=>0);
 assert.equal(single.inventory.find(g=>g.tier==='beginner').quantity,4);assert.ok(single.inventory.some(g=>g.tier==='lv6'));
});
test('atomic receipt replay cannot charge twice or reuse the same id for different settings',()=>{
 const a=action(),first=applyGemAction(save([stack('redIron','beginner',16)]),a,()=>0);
 assert.equal(first.summary.successes,15);assert.equal(first.save._gemRevision,1);
 const again=applyGemAction(first.save,a,()=>.99);assert.equal(again.accepted,false);assert.equal(again.save,first.save);
 assert.equal(applyGemAction(first.save,{...a,targetLevel:6}),null);
 assert.equal(applyGemAction(save(),action('exchange',{gemId:'rift',quantity:1})),null);
});
test('powder cannot duplicate materials: salvage and exchange preserve exact balances',()=>{
 const first=applyGemAction(save([stack('rift','advanced',2)]),action('salvage',{gemId:'rift',tier:'advanced',quantity:1}));
 assert.equal(first.save.gemPowder,4);assert.equal(first.save.gemInventory[0].quantity,1);
 const next=applyGemAction(first.save,action('exchange',{gemId:'thorns',quantity:1}));
 assert.equal(next.save.gemPowder,0);assert.deepEqual(next.save.gemInventory.find(g=>g.gemId==='thorns'),stack('thorns','beginner',1));
 assert.equal(applyGemAction(save([{...stack(),locked:true}]),action('salvage',{gemId:'redIron',tier:'beginner',quantity:1})),null);
});
test('one salvage action batch consumes selected quantities across gem types and credits exact powder',()=>{
 const initial=save([stack('rift','advanced',4),stack('thorns','beginner',3),{...stack('arcana','lv5',2),locked:true}]);
 const selected=[{gemId:'rift',tier:'advanced',quantity:3},{gemId:'thorns',tier:'beginner',quantity:2}];
 const batch=action('salvage',{selections:selected}),result=applyGemAction(initial,batch);
 assert.deepEqual(result.summary,{attempts:5,successes:5,failures:0,consumed:5});
 assert.equal(result.save.gemPowder,3*4+2);
 assert.deepEqual(result.save.gemInventory,[stack('rift','advanced',1),stack('thorns','beginner',1),{...stack('arcana','lv5',2),locked:true}]);
 const replay=applyGemAction(result.save,batch);assert.equal(replay.accepted,false);assert.equal(replay.save.gemPowder,result.save.gemPowder);
 assert.equal(applyGemAction(initial,action('salvage',{selections:[...selected,{gemId:'arcana',tier:'lv5',quantity:1}]})),null);
 assert.equal(applyGemAction(initial,action('salvage',{selections:[...selected,selected[0]]})),null);
 assert.equal(applyGemAction(initial,action('salvage',{selections:[{gemId:'rift',tier:'advanced',quantity:5}]})),null);
 assert.equal(applyGemAction(initial,action('salvage',{selections:[{gemId:'rift',tier:'advanced',quantity:10001}]})),null);
});
test('socket, in-place failure/success and transfer conserve gems and protect duplicate types',()=>{
 let s=save([stack('redIron','lv5',3)]);
 s=applyGemAction(s,action('socket',{itemId:1,socketIndex:0,gemId:'redIron',tier:'lv5'})).save;
 assert.equal(applyGemAction(s,action('socket',{itemId:1,socketIndex:1,gemId:'redIron',tier:'lv5'})),null);
 const upgrade=action('upgrade',{itemId:1,socketIndex:0});const failed=applyGemAction(s,upgrade,()=>.99);
 assert.equal(failed.summary.failures,1);assert.equal(failed.save.items[0].sockets.gems[0].tier,'lv5');
 assert.equal(failed.save.gemInventory[0].quantity,1);
 const success=applyGemAction(failed.save,action('upgrade',{itemId:1,socketIndex:0}),()=>0);assert.equal(success.save.items[0].sockets.gems[0].tier,'lv6');
 const moved=applyGemAction(success.save,action('transfer',{itemId:1,socketIndex:0,targetItemId:2,targetSocketIndex:0}));
 assert.equal(moved.save.items[0].sockets.gems[0],null);assert.equal(moved.save.items[1].sockets.gems[0].tier,'lv6');
 assert.equal(moved.save.gemInventory.length,0);
});
test('stale snapshots cannot restore spent gems or overwrite issued sockets and powder',()=>{
 const old=save([stack('redIron','lv5',2)]),issued=applyGemAction(old,action('socket',{itemId:1,socketIndex:0,gemId:'redIron',tier:'lv5'})).save;
 const safe=preserveGemSave({...old,gemPowder:999,_gemActionIds:[]},issued);
 assert.deepEqual(safe.gemInventory,issued.gemInventory);assert.deepEqual(safe.items[0].sockets,issued.items[0].sockets);
 assert.equal(safe.gemPowder,0);assert.equal(safe._gemRevision,1);assert.deepEqual(safe._gemActionIds,issued._gemActionIds);
});
test('transaction deltas preserve drops earned while waiting and normalization preserves locks',()=>{
 const before=[stack('redIron','beginner',2)],after=[stack('redIron','intermediate',1)],current=[stack('redIron','beginner',3),stack('rift','beginner',1)];
 assert.deepEqual(gemInventoryDelta(current,before,after),[stack('redIron','beginner',1),stack('rift','beginner',1),stack('redIron','intermediate',1)]);
 assert.equal(normalizeGemInventory([{...stack(),locked:true}])[0].locked,true);
 assert.equal(normalizeGemInventory([stack('redIron','lv10',Infinity)]).length,0);
 const all=GEM_IDS.flatMap(id=>GEM_TIERS.map(tier=>stack(id,tier,1)));assert.equal(invalidSaveField({gemInventory:all,gemPowder:0,_gemRevision:1}),null);
 assert.equal(invalidSaveField({gemInventory:[{...stack(),locked:'yes'}]}),'gemInventory');
});
