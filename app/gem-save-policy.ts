import {balanceConfig} from './balance-config';
import {GEM_IDS,GEM_TIERS,addGemStack,consumeGemStack,fuseGemBatch,gemLevel,normalizeGemInventory,normalizeEquipmentSockets,type GemId,type GemTier,type GemStack} from './gem-system';
type Save = Record<string,any>;
export type GemSalvageSelection = {gemId:GemId;tier:GemTier;quantity:number};
export type GemAction = {id:string;kind:'fuse'|'salvage'|'exchange'|'socket'|'upgrade'|'transfer';gemId?:GemId;tier?:GemTier;targetLevel?:number;reserve?:number;maxMaterials?:number;quantity?:number;selections?:GemSalvageSelection[];itemId?:number;socketIndex?:number;targetItemId?:number;targetSocketIndex?:number};
export function applyGemAction(save:Save, action:GemAction, random=Math.random) {
 if(!action||typeof action!=='object'||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(action.id)||!['fuse','salvage','exchange','socket','upgrade','transfer'].includes(action.kind))return null;
 const previous=Array.isArray(save._gemActionIds)?save._gemActionIds:[];
 const key=JSON.stringify(Object.fromEntries(Object.entries(action).sort(([a],[b])=>a.localeCompare(b))));
 const receipt=previous.find((r:any)=>r?.id===action.id);
 if(receipt)return receipt.key===key?{save,accepted:false,summary:receipt.summary}:null;
 if(action.gemId!==undefined&&!GEM_IDS.includes(action.gemId)||action.tier!==undefined&&!GEM_TIERS.includes(action.tier))return null;
 let inventory=normalizeGemInventory(save.gemInventory),powder=Number(save.gemPowder??0),items=Array.isArray(save.items)?save.items.map((i:any)=>({...i})):[];
 if(!Number.isSafeInteger(powder)||powder<0)return null;
 let summary={attempts:0,successes:0,failures:0,consumed:0};
 const amount=action.quantity??1;
 const gem=action.gemId&&action.tier?{gemId:action.gemId,tier:action.tier}:null;
 const item=items.find((i:any)=>i.id===action.itemId);
 const sockets=item?normalizeEquipmentSockets(item.sockets):null;
 if(action.kind==='fuse'){
  const result=fuseGemBatch(inventory,{gemId:action.gemId,targetLevel:action.targetLevel!,sourceTier:action.tier,reserve:action.reserve!,maxMaterials:action.maxMaterials!},random);
  if(!result||!result.attempts)return null;
  inventory=result.inventory;summary={attempts:result.attempts,successes:result.successes,failures:result.failures,consumed:result.consumed};
 }else if(action.kind==='salvage'){
  const selections=action.selections;
  if(selections!==undefined){
   if(!Array.isArray(selections)||!selections.length||selections.length>160||action.gemId!==undefined||action.tier!==undefined||action.quantity!==undefined)return null;
   const seen=new Set<string>();let total=0,earned=0;
   for(const selection of selections){
    if(!selection||!GEM_IDS.includes(selection.gemId)||!GEM_TIERS.includes(selection.tier)||!Number.isSafeInteger(selection.quantity)||selection.quantity<1)return null;
    const key=`${selection.gemId}:${selection.tier}`,stack=inventory.find(g=>g.gemId===selection.gemId&&g.tier===selection.tier);
    if(seen.has(key)||!stack||stack.locked||selection.quantity>stack.quantity)return null;
    seen.add(key);total+=selection.quantity;earned+=selection.quantity*2**(gemLevel(selection.tier)-1);
    if(total>10000||!Number.isSafeInteger(earned))return null;
   }
   let after=inventory;
   for(const selection of selections){const next=consumeGemStack(after,selection,selection.quantity);if(!next)return null;after=next;}
   if(!Number.isSafeInteger(powder+earned))return null;
   inventory=after;powder+=earned;summary={attempts:total,successes:total,failures:0,consumed:total};
  }else{
   if(!gem||!Number.isSafeInteger(amount)||amount<1||amount>10000)return null;
   const stack=inventory.find(g=>g.gemId===gem.gemId&&g.tier===gem.tier);
   if(!stack||stack.locked)return null;
   const after=consumeGemStack(inventory,gem,amount);if(!after)return null;
   const earned=amount*2**(gemLevel(gem.tier)-1);if(!Number.isSafeInteger(powder+earned))return null;
   powder+=earned;inventory=after;summary={attempts:amount,successes:amount,failures:0,consumed:amount};
  }
 }else if(action.kind==='exchange'){
  if(!action.gemId||!Number.isSafeInteger(amount)||amount<1||amount>10000)return null;
  const cost=amount*balanceConfig.gems.powderExchangeCost;if(powder<cost)return null;
  powder-=cost;inventory=addGemStack(inventory,{gemId:action.gemId,tier:'beginner'},amount);summary.successes=amount;
 }else{
  if(!item||items.filter((i:any)=>i.id===action.itemId).length!==1||!sockets||!Number.isInteger(action.socketIndex)||action.socketIndex!<0||action.socketIndex!>=sockets.socketCount)return null;
  const index=action.socketIndex!,existing=sockets.gems[index];
  if(action.kind==='socket'){
   if(!gem||existing||sockets.gems.some(g=>g?.gemId===gem.gemId)||inventory.find(g=>g.gemId===gem.gemId&&g.tier===gem.tier)?.locked)return null;
   const after=consumeGemStack(inventory,gem);if(!after)return null;inventory=after;sockets.gems[index]=gem;summary.successes=1;summary.consumed=1;
  }else if(action.kind==='upgrade'){
   if(!existing||gemLevel(existing.tier)>=10)return null;
   const stack=inventory.find(g=>g.gemId===existing.gemId&&g.tier===existing.tier);
   if(!stack||stack.locked)return null;
   const after=consumeGemStack(inventory,existing);if(!after)return null;inventory=after;
   const level=gemLevel(existing.tier),success=random()<balanceConfig.gems.successRates[level-1];
   if(success)sockets.gems[index]={...existing,tier:GEM_TIERS[level]};
   summary={attempts:1,successes:success?1:0,failures:success?0:1,consumed:1};
  }else{
   const target=items.find((i:any)=>i.id===action.targetItemId),slot=action.targetSocketIndex;
   if(!existing||!target||target.id===item.id||items.filter((i:any)=>i.id===target.id).length!==1||!Number.isInteger(slot))return null;
   const dest=normalizeEquipmentSockets(target.sockets);
   if(slot!<0||slot!>=dest.socketCount||dest.gems[slot!]||dest.gems.some(g=>g?.gemId===existing.gemId))return null;
   dest.gems[slot!]=existing;sockets.gems[index]=null;target.sockets=dest;summary.successes=1;
  }
  item.sockets=sockets;
 }
 if(!Number.isSafeInteger(powder)||inventory.some(g=>!Number.isSafeInteger(g.quantity)))return null;
 const next={...save,gemInventory:inventory,gemPowder:powder,items,_gemRevision:Number(save._gemRevision??0)+1,
  _gemActionIds:[...previous,{id:action.id,key,summary}].slice(-256)};
 return {save:next,accepted:true,summary};
}
export function preserveGemSave(incoming:Save,server:Save|null){
 if(!server)return {...incoming,gemPowder:0,_gemRevision:0,_gemActionIds:[]};
 const next:Save={...incoming,gemPowder:server.gemPowder??0,_gemRevision:server._gemRevision??0,_gemActionIds:server._gemActionIds??[]};
 // Generic snapshots may add earned drops, never alter already-issued socket gems.
 const saved=new Map((server.items??[]).map((i:any)=>[i.id,i]));
 next.items=(incoming.items??[]).map((item:any)=>{
  const old=saved.get(item.id) as any;if(!old)return item;
  const socket=normalizeEquipmentSockets(item.sockets),previous=normalizeEquipmentSockets(old.sockets);
  return {...item,sockets:{...socket,gems:Array.from({length:socket.socketCount},(_,i)=>previous.gems[i]??null)}};
 });
 if(Number(incoming._gemRevision??0)<Number(server._gemRevision??0))next.gemInventory=server.gemInventory??[];
 return next;
}
