import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('./')&&!s.endsWith('.ts')?`${s}.ts`:s,c)}});
const {validateSaveTransition,SaveIntegrityError,guardedExperienceRequired}=await import('../app/save-integrity.ts');
const {dropPowerRange,enhancementGoldCost,enhancementStoneCost}=await import('../app/balance.ts');
const {applyDailyHuntClaim}=await import('../app/daily-hunt-claim.ts');
const at=Date.parse('2026-10-03T06:00:00Z');
const baseline=()=>({playerClass:'遊俠',level:1,exp:0,xpSchemaVersion:2,rebirthCount:0,rebirthPoints:0,rebirthTalents:{},gold:0,yuanbao:0,enhanceStones:0,reforgeStones:0,drillingStones:0,combatPower:1350,worldDamage:0,unlockedMapId:1,mapId:1,wave:1,mapBestFloors:{1:1},dailyDate:'2026-10-03',dailyKills:0,items:[],mails:[],gemInventory:[],storedSeconds:0,lastSeenAt:at});
const check=(next,server=baseline(),elapsed=10000)=>validateSaveTransition(next,server,at+elapsed,at);
const rejected=(next,reason,server=baseline(),elapsed=10000)=>assert.throws(()=>check(next,server,elapsed),error=>error instanceof SaveIntegrityError&&error.reason===reason);
const item=()=>({id:123,name:'舊劍',slot:'武器',quality:'普通',mapId:1,enhance:0,power:dropPowerRange(1,0).minimum,affixes:[],sockets:{socketCount:0,gems:[]}});
test('reported forged 5 rebirths,100 levels,billion gold never enter the save',()=>{
 const previous=baseline();rejected({...previous,rebirthCount:5,level:100,gold:1000000000,yuanbao:999999,combatPower:99999999999},'unissued_rebirth');
 assert.equal(previous.gold,0);assert.equal(previous.level,1);
 rejected({...previous,gold:1000000000},'excessive_gold');rejected({...previous,yuanbao:999999},'unissued_yuanbao');
 rejected({...previous,combatPower:99999999999},'forged_combat_power');rejected({...previous,level:100},'excessive_experience');
});
test('ordinary monster rewards,level ups and floors remain saveable',()=>{
 const previous=baseline();const next=check({...previous,gold:500,exp:50,dailyKills:2,wave:3,mapBestFloors:{1:3},enhanceStones:1,items:[item()]});
 assert.equal(next.gold,500);assert.equal(next.level,1);assert.equal(next.dailyKills,2);assert.equal(next.lastSeenAt,at+10000);
 const leveled=check({...previous,level:2,exp:10,combatPower:1406});assert.equal(leveled.level,2);
});
test('credit ledger is server issued and retries cannot mint money at the same instant',()=>{
 const previous=baseline();const first=check({...previous,gold:10000});
 const second=validateSaveTransition({...first,gold:10001,_saveIntegrity:{at:0,credits:{gold:1e18}}},first,at+10000,at+10000);
 assert.equal(second._saveIntegrity.at,at+10000);assert.equal(second._saveIntegrity.credits.gold,first._saveIntegrity.credits.gold-1);
 let current=first;
 assert.throws(()=>{for(let i=0;i<1000;i++)current=validateSaveTransition({...current,gold:current.gold+10000},current,at+10000,at+10000)},SaveIntegrityError);
});
test('invalid balance types,negative numbers and nonfinite values are rejected',()=>{
 for(const field of ['gold','yuanbao','level','rebirthCount','exp','worldDamage'])for(const value of [-1,1.5,'999',Infinity,NaN,Number.MAX_SAFE_INTEGER+1])
 assert.throws(()=>check({...baseline(),[field]:value}),SaveIntegrityError);
});
test('new map requires sequential clearance, arbitrary map and floor jumps fail',()=>{
 rejected({...baseline(),unlockedMapId:9,mapId:9,mapBestFloors:{9:30}},'map_unlock_jump');
 rejected({...baseline(),unlockedMapId:2},'unearned_map_unlock');
 const previous={...baseline(),mapBestFloors:{1:29}};const next=check({...previous,mapBestFloors:{1:30},unlockedMapId:2},previous);assert.equal(next.unlockedMapId,2);
});
test('rebirth requires existing server receipt and cannot repeat or create talent points',()=>{
 const previous={...baseline(),level:100,rebirthCount:2,unlockedMapId:9,mapId:9,mapBestFloors:{9:30},_lastSkillRebirthLegacyCount:2};
 const next={...previous,rebirthCount:3,level:1,mapId:1,unlockedMapId:1,mapBestFloors:{1:1},rebirthPoints:3};
 const saved=check(next,previous);assert.equal(saved.rebirthCount,3);assert.equal(saved.storedSeconds,0);
 rejected({...next,rebirthPoints:99},'unissued_talent_points',previous);
 rejected(next,'unissued_rebirth',{...previous,_lastSkillRebirthLegacyCount:undefined});
});
test('validated existing item sale and material purchases do not look like forged resources',()=>{
 const previous={...baseline(),items:[item()]};assert.equal(check({...previous,items:[],gold:120},previous,0).gold,120);
 const funded={...baseline(),gold:200000};const bought=check({...funded,gold:0,reforgeStones:10},funded,0);assert.equal(bought.reforgeStones,10);
});
test('equipment identity,power,injected duplicates and unfunded enhancement are rejected',()=>{
 const previous={...baseline(),items:[item()]};
 rejected({...previous,items:[{...item(),power:999999999}]},'forged_equipment_power',previous);
 rejected({...previous,items:[item(),item()]},'duplicate_or_invalid_item',previous);
 rejected({...previous,items:[{...item(),quality:'神話'}]},'changed_equipment_identity',previous);
 rejected({...previous,items:[{...item(),enhance:15}]},'unfunded_enhancement',previous,0);
 const gold=enhancementGoldCost(1,item()),stones=enhancementStoneCost(1);
 const funded={...previous,gold,enhanceStones:stones};assert.equal(check({...funded,gold:0,enhanceStones:0,items:[{...item(),enhance:1}]},funded,0).items[0].enhance,1);
});
test('mail yuanbao must come from an existing unclaimed server mail, cannot be forged or claimed twice',()=>{
 const mail={id:1,claimed:false,rewards:{gold:100,stones:1,yuanbao:10,items:[]}};
 const previous={...baseline(),mails:[mail]};
 const next={...previous,gold:100,enhanceStones:1,yuanbao:10,mails:[{...mail,claimed:true,rewards:{gold:0,stones:0,yuanbao:0,items:[],resourcesClaimed:true}}]};
 const accepted=check(next,previous,0);assert.equal(accepted.yuanbao,10);
 rejected({...accepted,yuanbao:20},'unissued_yuanbao',accepted);
 rejected({...baseline(),mails:[mail]},'forged_mail_rewards');
});
test('server-confirmed idle claim permits normal offline rewards once and ignores forged time',()=>{
 const previous={...baseline(),_lastIdleClaimId:'server-claim',_lastIdleClaimSeconds:43200};
 const rewards={...previous,gold:11040,level:10,exp:0,enhanceStones:72,items:[item()],storedSeconds:43200,lastSeenAt:0};
 const next=check(rewards,previous,0);assert.equal(next._saveIntegrity.idleClaimId,'server-claim');assert.equal(next.storedSeconds,0);assert.equal(next.lastSeenAt,at);
 rejected({...next,gold:1e9},'excessive_gold',next,0);
 const forged=check({...baseline(),_lastIdleClaimId:'fake',_lastIdleClaimSeconds:43200,storedSeconds:43200,lastSeenAt:0});assert.ok(forged.storedSeconds<60);
});
test('claimed time is not added twice after settle_idle and malformed clock cannot bypass checks',()=>{
 const previous={...baseline(),storedSeconds:100,lastSeenAt:at+10000,_saveIntegrity:{at,credits:{}}};
 assert.equal(check(previous,previous).storedSeconds,100);
 assert.throws(()=>validateSaveTransition({...baseline(),gold:1e9},baseline(),at,NaN),SaveIntegrityError);
});
test('normal saves credit actual server elapsed time beyond a delayed heartbeat without trusting browser counters',()=>{
 const previous={...baseline(),storedSeconds:100.25};
 const accepted=check({...previous,storedSeconds:43200,lastSeenAt:0},previous,180_500);
 assert.equal(accepted.storedSeconds,280.75);
 const repeat=validateSaveTransition({...accepted,storedSeconds:43200,lastSeenAt:0},accepted,at+180_500,at+180_500);
 assert.equal(repeat.storedSeconds,280.75);
});
test('gem injection and forged sockets are bounded independently of fake client counters',()=>{
 rejected({...baseline(),gemInventory:[{gemId:'redIron',tier:'advanced',quantity:999999}]},'excessive_gems');
 rejected({...baseline(),gemInventory:[{gemId:'hacked',tier:'advanced',quantity:1}]},'invalid_gem_inventory');
 assert.equal(check({...baseline(),gemInventory:[{gemId:'redIron',tier:'beginner',quantity:1}]}).gemInventory[0].quantity,1);
});
test('daily claim reads the stored kill count instead of trusting a forged claim request',()=>{
 const previous={...baseline(),dailyKills:0};assert.equal(applyDailyHuntClaim(previous,{dailyDate:'2026-10-03',dailyKills:500},'2026-10-03'),null);
 const ready={...previous,dailyKills:500};assert.equal(applyDailyHuntClaim(ready,{dailyDate:'2026-10-03',dailyKills:999999},'2026-10-03').save.dailyKills,500);
});
test('normal save path always invokes firewall with server timestamp and rejects first-save injection',()=>{
 const route=readFileSync(new URL('../app/api/save/route.ts',import.meta.url),'utf8');
 assert.match(route,/validateSaveTransition\(preserveServerIdleClaim\(protectedSave, serverSave\), serverSave, Date.now\(\), savedAt\)/);
 assert.match(route,/if \(!existing\[0\]\) return jsonNoStore\(\{ error: "character_creation_required" \}, 409\)/);
 assert.match(route,/error: "save_integrity_rejected"/);assert.match(route,/gmAccountId: "system"/);assert.match(route,/Date.parse\(current.updatedAt\)/);
 const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');assert.match(page,/result\?\.error === "save_integrity_rejected"/);
 assert.match(page,/integrityRecoveryUsedRef.current=true;retry\(\)/);
 assert.match(page,/label:"重新同步"/);
 assert.doesNotMatch(page,/window.location.reload\(\)/);
});

test('treasure quality upgrade and first drop after unlocking remain valid on all maps',()=>{
 for(let map=1;map<=9;map++)for(let rank=1;rank<=4;rank++){
  const qualities=['普通','良好','優秀','史詩','傳奇'];
  const gear={...item(),mapId:map,quality:qualities[rank],power:dropPowerRange(map,rank-1).minimum+38};
  const previous={...baseline(),unlockedMapId:map,mapId:map};
  assert.equal(check({...previous,items:[gear]},previous).items[0].power,gear.power);
 }
 const previous={...baseline(),mapBestFloors:{1:29}};
 const gear={...item(),mapId:2,power:dropPowerRange(2,0).minimum};
 assert.equal(check({...previous,unlockedMapId:2,mapBestFloors:{1:30},items:[gear]},previous).items.length,1);
});
test('gamble rewards consume real yuanbao and personal boss rewards consume tickets',()=>{
 const previous={...baseline(),yuanbao:10};
 assert.equal(check({...previous,yuanbao:0,reforgeStones:10},previous,0).reforgeStones,10);
 const mythic={...item(),quality:'神話',power:dropPowerRange(1,5).minimum};
 assert.equal(check({...previous,yuanbao:0,items:[mythic]},previous,0).items.length,1);
 const boss={...baseline(),unlockedMapId:9,mapId:9,bossTickets:10};
 assert.equal(check({...boss,bossTickets:9,reforgeStones:68,yuanbao:1},boss,1000).reforgeStones,68);
 rejected({...boss,bossTickets:11},'unissued_boss_attempts',boss);
 assert.equal(check({...baseline(),dailyKills:1,yuanbao:1}).yuanbao,1);
 rejected({...baseline(),dailyKills:1,yuanbao:2},'unissued_yuanbao');
});
test('mail duplicates and reopening consumed resources cannot issue rewards twice',()=>{
 const mail={id:'mail',rewards:{gold:0,stones:0,yuanbao:0,items:[],resourcesClaimed:true}};
 const previous={...baseline(),mails:[mail]};
 rejected({...previous,mails:[mail,mail]},'duplicate_or_invalid_mail',previous);
 rejected({...previous,mails:[{...mail,rewards:{...mail.rewards,resourcesClaimed:false}}]},'replayed_mail_rewards',previous);
});
test('gem and drilling deposits spend separate budgets; zero-credit saves cannot create even one unit',()=>{
 const previous=baseline();const funded=check(previous,previous,1000);
 const deposited=validateSaveTransition({...funded,gemInventory:[{gemId:'redIron',tier:'advanced',quantity:8}],drillingStones:8},funded,at+1000,at+1000);
 assert.equal(deposited._saveIntegrity.credits.gems,0);assert.equal(deposited._saveIntegrity.credits.drillingStones,0);
 assert.throws(()=>validateSaveTransition({...deposited,gemInventory:[{gemId:'redIron',tier:'advanced',quantity:9}]},deposited,at+1000,at+1000),SaveIntegrityError);
 assert.throws(()=>validateSaveTransition({...deposited,drillingStones:9},deposited,at+1000,at+1000),SaveIntegrityError);
 rejected({...previous,gold:1},'excessive_gold',previous,0);
});
test('affix quantities,units and inflated percentage or flat values are checked',()=>{
 const gear={...item(),quality:'神話',power:dropPowerRange(1,5).minimum};
 const previous={...baseline(),items:[gear]};
 rejected({...previous,items:[{...gear,affixes:['攻擊 +99999']}]},'forged_affix_value',previous);
 rejected({...previous,items:[{...gear,affixes:['金幣 +200%']}]},'forged_affix_value',previous);
 rejected({...previous,items:[{...gear,affixes:['命中 +12%']}]},'invalid_affix_unit',previous);
 rejected({...previous,items:[{...gear,affixes:Array(6).fill('金幣 +21%')}]},'excessive_affixes',previous);
 rejected({...previous,items:[{...gear,affixes:['金幣 +21%']}]},'unissued_reforge',previous);
});
test('legacy percentage experience and old rebirth cap migrate without inventing progress',()=>{
 const previous={...baseline(),level:50,exp:50,xpSchemaVersion:1,rebirthCount:20};
 const migrated={...previous,rebirthCount:5,xpSchemaVersion:2,exp:Math.round(guardedExperienceRequired(50)*.5)};
 assert.equal(check(migrated,previous,0).exp,migrated.exp);
});

test('large offline batches use unique safe numeric IDs; legacy collided IDs stay readable',async()=>{
 const {nextLootId}=await import('../app/loot-id.ts');
 const ids=Array.from({length:10000},(_,sequence)=>nextLootId(sequence,at));
 assert.equal(new Set(ids).size,10000);assert.ok(ids.every(Number.isSafeInteger));
 assert.ok(nextLootId(0,at-10000)>ids.at(-1));
 const gear=item();const previous={...baseline(),items:[gear,{...gear,name:'另一把舊劍'}]};
 assert.equal(check(previous,previous).items.length,2);
 rejected({...previous,items:[...previous.items,gear]},'duplicate_or_invalid_item',previous);
});

test('server GM ticket and experience overrides remain usable without granting client increases',()=>{
 const previous={...baseline(),bossTickets:100,worldAttempts:50,exp:500};
 assert.equal(check(previous,previous).bossTickets,100);
 assert.equal(check({...previous,bossTickets:99},previous).bossTickets,99);
 rejected({...previous,bossTickets:101},'unissued_boss_attempts',previous);
 rejected({...previous,exp:501},'invalid_experience',previous);
});

test('generic saves cannot mint free reforge counters or sockets; natural socket drops remain valid',()=>{
const gear=item(),previous={...baseline(),items:[gear]};
rejected({...previous,items:[{...gear,reforgeCount:1}]},'unissued_reforge',previous);
rejected({...previous,items:[{...gear,sockets:{socketCount:1,gems:[null]}}]},'unissued_drill',previous);
assert.equal(check({...baseline(),items:[{...gear,sockets:{socketCount:2,gems:[null,null]}}]}).items.length,1);
});

test('transition rejects duplicate slot in either set and accepts ordinary owned equipment',()=>{const a=item(),b={...item(),id:124},previous={...baseline(),items:[a,b]};assert.equal(check({...previous,loadouts:{1:[123],2:[124]}},previous).items.length,2);rejected({...previous,loadouts:{1:[123,124],2:[]}},'invalid_equipment_loadout',previous);rejected({...previous,loadouts:{1:[],2:[999]}},'invalid_equipment_loadout',previous);});

test('new scene drops with boosted flat health and defense pass the same server pool while forged excess is rejected',async()=>{
 const {affixOptions}=await import('../app/equipment-affixes.ts');
 const {maps}=await import('../app/game-data.ts');
 for(const mapId of [3,6,9])for(const slot of ['胸甲','腰帶']){
  const previous={...baseline(),mapId,unlockedMapId:mapId},g={...item(),name:`${maps[mapId-1].set}${slot}`,slot,set:maps[mapId-1].set,
   mapId,quality:'傳奇',equipmentType:'場景普通裝備',power:dropPowerRange(mapId,4).minimum};
  const options=affixOptions(g),core=options[0],name=slot==='胸甲'?'防禦':'生命';
  g.affixes=[`${core.name} +${core.maximum}`];
  const next={...previous,mapId,unlockedMapId:mapId,items:[g]};
  assert.equal(check(next,previous).items[0].affixes[0],g.affixes[0]);
  rejected({...next,items:[{...g,affixes:[`${name} +99999999`]}]},'forged_affix_value',previous);
 }
});
