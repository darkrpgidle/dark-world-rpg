import {equipmentReforgeCost} from './balance';
import {canonicalAffixes,rollAffixes,rerollSingleAffix,type Item as AffixItem} from './equipment-affixes';
import {normalizeEquipmentSockets,drillSocket} from './gem-system';
type Save=Record<string,unknown>;
type Item=AffixItem&{id:number;reforgeCount?:number;sockets?:unknown;[key:string]:unknown};
export type EquipmentAction={id:string;kind:'reforge'|'drill';itemId:number;targetIndex?:number};
type Receipt=EquipmentAction&{gold:number;stones:number};
const receipts=(s:Save):Receipt[]=>Array.isArray(s._equipmentActionIds)?s._equipmentActionIds.filter((r):r is Receipt=>!!r&&typeof r==='object'&&typeof r.id==='string'&&['reforge','drill'].includes(r.kind)&&Number.isSafeInteger(r.itemId)&&Number.isSafeInteger(r.gold)&&r.gold>=0&&Number.isSafeInteger(r.stones)&&r.stones>=0):[];
export function applyEquipmentAction(save:Save,action:EquipmentAction){
 if(typeof action.id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(action.id)||!Number.isSafeInteger(action.itemId)||action.itemId<0||!['reforge','drill'].includes(action.kind))return null;
 const found=receipts(save).find(r=>r.id===action.id);
 const items=Array.isArray(save.items)?save.items as Item[]:[];
 const matches=items.filter(i=>i.id===action.itemId);
 if(matches.length!==1)return null;const item=matches[0];
 if(typeof item.name!=='string'||typeof item.slot!=='string'||!EQUIPMENT_SLOTS.includes(item.slot)||typeof item.quality!=='string'||!Number.isSafeInteger(item.enhance)||!Array.isArray(item.affixes)||item.affixes.some(a=>typeof a!=='string'))return null;
 if(found){if(found.kind!==action.kind||found.itemId!==action.itemId||found.targetIndex!==action.targetIndex)return null;return {save,item,receipt:found,accepted:false};}
 let updated:Item,gold=0,stones=0;
 if(action.kind==='reforge'){
  const rank=['普通','良好','優秀','史詩','傳奇','神話'].indexOf(item.quality);if(rank<=0)return null;
  const previous=Number(item.reforgeCount??0);if(!Number.isSafeInteger(previous)||previous<0||previous>=Number.MAX_SAFE_INTEGER)return null;
  const canonical={...item,affixes:canonicalAffixes(item)};
  const targeted=action.targetIndex!==undefined;
  if(targeted&&(!Number.isInteger(action.targetIndex)||action.targetIndex!<0||action.targetIndex!>=canonical.affixes.length))return null;
  const cost=equipmentReforgeCost(previous,targeted);gold=cost.gold;stones=cost.stones;
  if(!Number.isSafeInteger(save.gold)||Number(save.gold)<gold||!Number.isSafeInteger(save.reforgeStones)||Number(save.reforgeStones)<stones)return null;
  const next=targeted?canonical.affixes.map((a,i)=>i===action.targetIndex?rerollSingleAffix(canonical,a,i):a):rollAffixes(canonical);
  updated={...item,affixes:canonicalAffixes({...item,affixes:next}),affixSchemaVersion:7,reforgeCount:previous+1};
 }else{
  if(action.targetIndex!==undefined||!Number.isSafeInteger(save.drillingStones)||Number(save.drillingStones)<1)return null;
  const sockets=drillSocket(normalizeEquipmentSockets(item.sockets));if(!sockets)return null;
  stones=1;updated={...item,sockets};
 }
 const revision=Number(save.adminRevision??0);if(!Number.isSafeInteger(revision)||revision<0||revision>=Number.MAX_SAFE_INTEGER)return null;
 const receipt:Receipt={id:action.id,kind:action.kind,itemId:action.itemId,...(action.targetIndex===undefined?{}:{targetIndex:action.targetIndex}),gold,stones};
 const next:Save={...save,items:items.map(i=>i===item?updated:i),adminRevision:revision+1,_equipmentActionIds:[...receipts(save),receipt].slice(-256)};
 if(action.kind==='reforge'){next.gold=Number(save.gold)-gold;next.reforgeStones=Number(save.reforgeStones)-stones;}else next.drillingStones=Number(save.drillingStones)-1;
 return {save:next,item:updated,receipt,accepted:true};
}
// Old uploads cannot undo an issued result; incoming gem moves remain intact.
export function preserveEquipmentSave(incoming:Save,server:Save):Save{
 const next:Save={...incoming,_equipmentActionIds:receipts(server)};
 if(Number(incoming.adminRevision??0)>=Number(server.adminRevision??0))return next;
 const oldItems=Array.isArray(server.items)?server.items as Item[]:[];
 if(Array.isArray(incoming.items))next.items=incoming.items.map((item:Item)=>{
  const matches=oldItems.filter(i=>i.id===item.id);if(matches.length!==1)return item;const old=matches[0];
  return {...item,affixes:old.affixes,affixSchemaVersion:old.affixSchemaVersion,reforgeCount:old.reforgeCount??0,sockets:{...normalizeEquipmentSockets(item.sockets),socketCount:normalizeEquipmentSockets(old.sockets).socketCount}};
 });
 return next;
}
export const EQUIPMENT_SLOTS=['武器','頭盔','胸甲','手套','鞋子','項鍊','戒指','腰帶','護腕','披風'];
export function invalidLoadout(save:Save):boolean{
 if(save.loadouts===undefined)return false;
 const items=Array.isArray(save.items)?save.items as Item[]:[],loadouts=save.loadouts as Record<string,unknown>;
 if(!loadouts||typeof loadouts!=='object'||Array.isArray(loadouts))return true;
 for(const key of ['1','2']){
  const ids=loadouts[key];if(!Array.isArray(ids)||ids.length>EQUIPMENT_SLOTS.length)return true;
  const seen=new Set<number>(),slots=new Set<string>();
  for(const id of ids){if(!Number.isSafeInteger(id)||seen.has(id))return true;seen.add(id);const matches=items.filter(i=>i.id===id);if(matches.length!==1)return true;const slot=matches[0].slot;if(!EQUIPMENT_SLOTS.includes(slot)||slots.has(slot))return true;slots.add(slot);}
 }
 return false;
}
// Read-only repair: invalid references are removed, gear is never deleted.
export function safeLoadouts(save:Save){
 const items=Array.isArray(save.items)?save.items as Item[]:[],raw=save.loadouts as Record<string,unknown>|undefined;
 return Object.fromEntries(['1','2'].map(key=>{const slots=new Set<string>(),seen=new Set<number>(),ids:number[]=[];for(const id of Array.isArray(raw?.[key])?raw[key] as number[]:[]){const matches=items.filter(i=>i.id===id);if(matches.length!==1||seen.has(id)||slots.has(matches[0].slot)||!EQUIPMENT_SLOTS.includes(matches[0].slot))continue;ids.push(id);slots.add(matches[0].slot);seen.add(id);}return [key,ids];}));
}

// Exact legacy configurations may be repaired; newly changed illegal ones fail.
export function repairInheritedLoadout(incoming:Save,server:Save):Save{
 if(!invalidLoadout(incoming)||JSON.stringify(incoming.loadouts)!==JSON.stringify(server.loadouts))return incoming;
 return {...incoming,loadouts:safeLoadouts(incoming)};
}
