import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('./')&&!s.endsWith('.ts')?`${s}.ts`:s,c)}});
const {createStarterEquipment}=await import('../app/starter-equipment.ts');
const {firstChapterPower,firstChapterHealth,towerCombatValues}=await import('../app/balance.ts');
const {validateSaveTransition}=await import('../app/save-integrity.ts');
const {invalidLoadout}=await import('../app/equipment-save-policy.ts');
const {balanceConfig}=await import('../app/balance-config.ts');
test('ordinary HP increases toward checkpoints without changing any special-floor HP',()=>{
 const checkpoints=new Map([[5,650],[10,1260],[15,1610],[20,2850],[25,3500],[30,7200]]);
 for(const [floor,hp] of checkpoints){
  const tier=floor===30?'boss':floor%10===0?'guardian':'elite';
  assert.equal(firstChapterHealth(firstChapterPower(floor),tier,'墓園騎士'),hp);
  const previous=firstChapterHealth(firstChapterPower(floor-1),'normal');
  assert.ok(previous<hp && previous>=hp*0.85,`${floor}: ${previous}/${hp}`);
 }
 const oldAnchors=balanceConfig.firstChapter.anchors;
 for(let floor=1;floor<=29;floor++){
  if(floor%5===0)continue;
  const power=firstChapterPower(floor);
  const upper=oldAnchors.findIndex(a=>a[1]>=power);
  const b=oldAnchors[Math.max(0,upper)],a=oldAnchors[Math.max(0,upper-1)];
  const old=a===b?a[2]:a[2]+(b[2]-a[2])*(power-a[1])/(b[1]-a[1]);
  assert.ok(firstChapterHealth(power,'normal')>=Math.round(old));
 }
});
test('other chapters and personal boss baseline ignore first chapter tuning',()=>{
 const args={combatPower:10000,recommendedPower:5000,mapId:2,localFloor:10,tier:'guardian',monsterName:'墓園騎士',attacks:1,skillTriggered:false,setTier:0};
 const boss={...args,mapId:1,firstChapterTuning:false};
 const before=towerCombatValues(args),bossBefore=towerCombatValues(boss);
 const old=balanceConfig.firstChapter.attackScale;
 try{
  balanceConfig.firstChapter.attackScale=0.01;
  assert.deepEqual(towerCombatValues(args),before);
  assert.deepEqual(towerCombatValues(boss),bossBefore);
 }finally{balanceConfig.firstChapter.attackScale=old;}
});
test('server starter set is equipped, ordinary, and survives normal save verification',()=>{
 const equipment=createStarterEquipment();
 assert.equal(equipment.items.length,10);
 assert.equal(new Set(equipment.items.map(i=>i.slot)).size,10);
 assert.equal(invalidLoadout(equipment),false);
 for(const i of equipment.items){assert.equal(i.quality,'普通');assert.equal(i.enhance,0);assert.equal(i.affixes.length,0);assert.equal(i.set,'');assert.equal(i.sockets.socketCount,0);}
 const at=Date.parse('2026-10-03T00:00:00Z');
 for(const playerClass of ['戰士','遊俠','法師']){
  const save={...equipment,playerClass,level:1,exp:0,xpSchemaVersion:2,rebirthCount:0,rebirthPoints:0,rebirthTalents:{},gold:0,yuanbao:0,enhanceStones:0,reforgeStones:0,drillingStones:0,combatPower:2095,worldDamage:0,unlockedMapId:1,mapId:1,wave:1,mapBestFloors:{1:1},dailyDate:'2026-10-03',dailyKills:0,mails:[],gemInventory:[],storedSeconds:0,lastSeenAt:at};
  assert.doesNotThrow(()=>validateSaveTransition({...save,exp:50,dailyKills:1},save,at+10000,at));
 }
});
test('first chapter advances steadily with HP milestones rather than stacked attack/defense spikes',()=>{
 let previous=0;
 for(let floor=1;floor<=30;floor++){
  const p=firstChapterPower(floor);assert.ok(p>previous);previous=p;
 }
 for(const [floor,ratio] of [[10,1.4],[20,1.5],[30,1.8]]){
  assert.equal(firstChapterHealth(firstChapterPower(floor),'boss')/firstChapterHealth(firstChapterPower(floor-1),'elite'),ratio);
  const args={combatPower:10000,recommendedPower:firstChapterPower(floor-1),mapId:1,localFloor:floor-1,tier:'normal',monsterName:'墓園騎士',attacks:1,skillTriggered:false,setTier:0,playerAttack:200,playerDefense:150};
  const before=towerCombatValues(args),after=towerCombatValues({...args,localFloor:floor,recommendedPower:firstChapterPower(floor),tier:floor===30?'boss':'guardian'});
  assert.ok(after.monsterDamage/before.monsterDamage<1.4);
 }
});
