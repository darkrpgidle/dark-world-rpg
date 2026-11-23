import {invalidRealMode} from "./real-mode-progress";
import {safeLoadouts} from "./equipment-save-policy";
type RecordValue=Record<string,unknown>;
const record=(v:unknown):v is RecordValue=>!!v&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const text=(v:unknown,max=200)=>typeof v==='string'&&v.length<=max;
const integers=['saveSchemaVersion','xpSchemaVersion','level','exp','gold','yuanbao','enhanceStones','reforgeStones','drillingStones','combatPower','mapId','unlockedMapId','wave','highestFloor','completedRuns','dailyKills','worldDamage','rebirthCount','legacyRebirthCount','rebirthPoints','adminRevision','bossTickets','worldAttempts','skillReworkVersion','_saveSequence'];
const numbers=['enemyHp','playerHp','storedSeconds','idleSeconds','lastSeenAt'];
const strings=['playerName','playerClass','accountName','accountId','dailyDate','bossTicketResetVersion','worldBossResetVersion','selectedTitle','selectedAppearance','_saveRequestId','_saveClientId','autoSalvageQuality'];
const booleans=['battleOn','dailyRewardClaimed','autoSalvage','protectSetGear','protectPowerUpgrade','finalBossDefeated'];
export function invalidSaveField(value:unknown):string|null {
 if(!record(value))return 'save';
 const s=value;
 if("realMode" in s&&invalidRealMode(s.realMode))return "realMode";
 for(const key of integers)if(key in s&&!integer(s[key]))return key;
 for(const key of numbers)if(key in s&&(typeof s[key]!=='number'||!Number.isFinite(s[key])))return key;
 for(const key of strings)if(key in s&&!text(s[key]))return key;
 if('_lastIdleClaimId' in s&&s._lastIdleClaimId!==null&&!text(s._lastIdleClaimId))return '_lastIdleClaimId';
 for(const key of booleans)if(key in s&&typeof s[key]!=='boolean')return key;
 if('playerClass' in s&&!['戰士','遊俠','法師'].includes(s.playerClass as string))return 'playerClass';
 if('playerName' in s&&(!(s.playerName as string).trim()||(s.playerName as string).length>24))return 'playerName';
 for(const key of ['mapBestFloors','rebirthTalents'])if(key in s&&(!record(s[key])||Object.values(s[key]).some(v=>!integer(v))))return key;
 if('skillReworkBuild' in s){
  const build=s.skillReworkBuild;
  if(!record(build)||!record(build.ranks)||Object.keys(build.ranks).length>100||Object.values(build.ranks).some(v=>!integer(v))||!Array.isArray(build.activeSlots)||build.activeSlots.length!==3||build.activeSlots.some(v=>v!==null&&!text(v)))return 'skillReworkBuild';
  if('adminPointLimit' in build&&!integer(build.adminPointLimit))return 'skillReworkBuild';
  if('legacyUnlockedSkillNames' in build&&(!Array.isArray(build.legacyUnlockedSkillNames)||build.legacyUnlockedSkillNames.length>100||build.legacyUnlockedSkillNames.some(v=>!text(v))))return 'skillReworkBuild';
 }
 if('skillAscensions' in s){
  const state=s.skillAscensions;
  if(!record(state)||!integer(state.rebirthCount)||typeof state.selectionOpen!=='boolean'||!Array.isArray(state.choices)||state.choices.length!==5||state.choices.some(v=>v!==null&&!text(v)))return 'skillAscensions';
 }
 if('activeLoadout' in s&&s.activeLoadout!==1&&s.activeLoadout!==2)return 'activeLoadout';
 if('loadouts' in s){if(!record(s.loadouts)||!Array.isArray(s.loadouts['1'])||!Array.isArray(s.loadouts['2']))return 'loadouts';for(const [key,ids] of Object.entries(s.loadouts))if(!['1','2'].includes(key)||!Array.isArray(ids)||ids.length>4000||ids.some(id=>!integer(id)))return 'loadouts';}
 for(const key of ['ownedTitles','ownedAppearances'])if(key in s&&(!Array.isArray(s[key])||s[key].length>100||s[key].some(v=>!text(v))))return key;
 if('unseenItemIds' in s&&(!Array.isArray(s.unseenItemIds)||s.unseenItemIds.length>4000||s.unseenItemIds.some(v=>!integer(v))))return 'unseenItemIds';
 const itemError=(item:unknown):boolean=>{
  if(!record(item))return true;
  for(const key of ['id','power','enhance','mapId','reforgeCount','reforgeLevel','affixSchemaVersion'])if(key in item&&!integer(item[key]))return true;
  for(const key of ['name','slot','quality','equipmentType','mythicId','legendaryId','prefixId','suffixId','set','artKey','worldBossRewardId'])if(key in item&&!text(item[key]))return true;
  for(const key of ['locked','isNew'])if(key in item&&typeof item[key]!=='boolean')return true;
  if('affixes' in item&&(!Array.isArray(item.affixes)||item.affixes.length>12||item.affixes.some(v=>!text(v))))return true;
  if('sockets' in item){if(!record(item.sockets))return true;const sockets=item.sockets;if('socketCount' in sockets&&(!integer(sockets.socketCount)||Number(sockets.socketCount)>2))return true;if('gems' in sockets&&(!Array.isArray(sockets.gems)||sockets.gems.length>2||sockets.gems.some(g=>g!==null&&(!record(g)||!text(g.gemId)||!text(g.tier)))))return true;}
  return false;
 };
 if('items' in s&&(!Array.isArray(s.items)||s.items.length>4000||s.items.some(itemError)))return 'items';
 if('mails' in s){if(!Array.isArray(s.mails)||s.mails.length>200)return 'mails';for(const m of s.mails){if(!record(m))return 'mails';for(const key of ['title','body'])if(key in m&&!text(m[key],10000))return 'mails';if('id' in m&&!(integer(m.id)||text(m.id,100)&&Boolean(m.id))||'claimed' in m&&typeof m.claimed!=='boolean')return 'mails';if('rewards' in m){if(!record(m.rewards))return 'mails';for(const key of ['gold','stones','yuanbao'])if(key in m.rewards&&!integer(m.rewards[key]))return 'mails';if('resourcesClaimed' in m.rewards&&typeof m.rewards.resourcesClaimed!=='boolean')return 'mails';if('items' in m.rewards&&(!Array.isArray(m.rewards.items)||m.rewards.items.some(itemError)))return 'mails';}}}
 if('gemPowder' in s&&!integer(s.gemPowder))return 'gemPowder';
 if('_gemRevision' in s&&!integer(s._gemRevision))return '_gemRevision';
 if('gemInventory' in s&&(!Array.isArray(s.gemInventory)||s.gemInventory.length>160||s.gemInventory.some(g=>!record(g)||!text(g.gemId)||!text(g.tier)||!integer(g.quantity)||('locked' in g&&typeof g.locked!=='boolean'))))return 'gemInventory';
 if('logs' in s&&(!Array.isArray(s.logs)||s.logs.length>5000||s.logs.some(l=>!record(l)||!integer(l.id)||!text(l.time)||!text(l.type)||!text(l.text,10000))))return 'logs';
 // Reject dangerous object keys and excessively nested extension fields too.
 let nodes=0;
 function walk(v:unknown,depth:number):boolean{if(++nodes>30000||depth>16)return false;if(Array.isArray(v))return v.every(x=>walk(x,depth+1));if(record(v))return Object.entries(v).every(([k,x])=>!['__proto__','constructor','prototype'].includes(k)&&walk(x,depth+1));return v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v);}
 return walk(s,0)?null:'structure';
}
// Read-only projections tolerate historical malformed scalar fields without
// changing canonical cloud data. Writes still pass the strict checks above.
export function saveDisplay(value:unknown):RecordValue {
 if(!record(value))return {};
 const s={...value};
 for(const key of integers)if(key in s&&!integer(s[key]))delete s[key];
 for(const key of strings)if(key in s&&!text(s[key]))delete s[key];
 for(const key of booleans)if(key in s&&typeof s[key]!=='boolean')delete s[key];
 if('mapBestFloors' in s&&!record(s.mapBestFloors))delete s.mapBestFloors;
 s.items=Array.isArray(s.items)?s.items.filter(record).map(i=>({...i,name:typeof i.name==='string'?i.name:'未命名裝備',affixes:Array.isArray(i.affixes)?i.affixes.filter(v=>typeof v==='string'):[]})):[];
 const loadouts=s.loadouts;
 s.loadouts=record(loadouts)?Object.fromEntries(['1','2'].map(k=>[k,Array.isArray(loadouts[k])?loadouts[k].filter(integer):[]])):{1:[],2:[]};
 s.loadouts=safeLoadouts(s);
 return s;
}
