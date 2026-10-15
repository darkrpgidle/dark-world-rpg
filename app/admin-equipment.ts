import { maps } from "./game-data";
import { ALL_CATALOG_EQUIPMENT } from "./mythic-data";
import { dropPowerRange } from "./balance";
import { nextLootId } from "./loot-id";
import { normalizeEquipmentSockets } from "./gem-system";
export const ADMIN_EQUIPMENT_SLOTS = ["武器","頭盔","胸甲","手套","鞋子","項鍊","戒指","腰帶","護腕","披風"] as const;
export type AdminEquipment = {id?:number;name?:string;slot?:string;quality?:string;enhance?:number;reforgeCount?:number;affixes?:string[];[key:string]:unknown};
type EquipmentSave = {items?:AdminEquipment[];loadouts?:unknown;activeLoadout?:unknown;[key:string]:unknown};
const qualities = ["普通","良好","優秀","史詩","傳奇","神話"];
export function equippedSlotIndex(save: EquipmentSave, slot:string) {
 const loadouts = save.loadouts as Record<string,unknown> | undefined;
 const ids = loadouts?.[String(save.activeLoadout === 2 ? 2 : 1)];
 if (!Array.isArray(ids)) return -1;
 return (save.items ?? []).findIndex(item => item.slot === slot && ids.includes(item.id));
}
export function normalizedAdminEquipment(item: AdminEquipment, previous?: AdminEquipment): AdminEquipment {
 const next = {...item};
 const definition = ALL_CATALOG_EQUIPMENT.find(gear => gear.name === next.name);
 const map = maps.find(map => next.name === `${map.gearPrefix}${next.slot}` || next.name === `${map.set}${next.slot}`);
 if (definition) {
  next.slot=definition.slot;next.quality=definition.kind === "special-legendary" ? "傳奇" : "神話";
  next.equipmentType=definition.kind === "special-legendary" ? "特殊傳奇" : "神話裝備";
  next.artKey=definition.artKey;next.set="";
  delete next.mythicId;delete next.legendaryId;
  next[definition.kind === "special-legendary" ? "legendaryId" : "mythicId"]=definition.id;
 } else if (map) {
  next.mapId=map.id;next.set=next.name === `${map.set}${next.slot}` ? map.set : "";
  next.equipmentType=next.quality === "神話" ? "神話裝備" : "場景普通裝備";
  delete next.mythicId;delete next.legendaryId;delete next.artKey;
 }
 next.mapId=Math.max(1,Math.min(9,Math.floor(Number(next.mapId)||1)));
 if (!qualities.includes(next.quality ?? "")) next.quality="普通";
 next.enhance=Math.max(0,Math.min(15,Math.floor(Number(next.enhance)||0)));
 next.reforgeCount=Math.max(0,Math.min(1000,Math.floor(Number(next.reforgeCount ?? next.reforgeLevel)||0)));
 delete next.reforgeLevel;
 next.sockets=normalizeEquipmentSockets(next.sockets);
 if (!previous || previous.name !== next.name || previous.quality !== next.quality || previous.mapId !== next.mapId || !Number.isSafeInteger(next.power)) {
  const range=dropPowerRange(Number(next.mapId),qualities.indexOf(next.quality ?? "普通"));
  next.power=Math.round((range.minimum+range.maximum)/2);
 }
 return next;
}
export function replaceEquippedSlot<T extends EquipmentSave>(save:T,slot:string,patch:Partial<AdminEquipment>):T {
 const items=[...(save.items ?? [])];const index=equippedSlotIndex(save,slot);
 const old=index >= 0 ? items[index] : undefined;
 if(!old && !patch.name) return save;
 const loadout=String(save.activeLoadout === 2 ? 2 : 1);
 const loadouts={...(save.loadouts as Record<string,unknown> ?? {})};
 const ids=Array.isArray(loadouts[loadout]) ? [...loadouts[loadout] as number[]] : [];
 if (patch.name === "") {
  loadouts[loadout]=ids.filter(id=>id!==old?.id);
  return {...save,loadouts};
 }
 let id=old?.id;
 if (!Number.isSafeInteger(id)) { do { id=nextLootId(); } while(items.some(item=>item.id===id)); }
 const item=normalizedAdminEquipment({...old,...patch,id,slot},old);
 if (index >= 0) items[index]=item;else items.push(item);
 loadouts[loadout]=[...ids.filter(existing=>existing!==id),id];
 return {...save,items,loadouts};
}
