export const INTEGRITY_FIELD_LABELS: Record<string, string> = {
 gold: "金幣", yuanbao: "元寶", level: "等級", exp: "經驗", rebirthCount: "輪迴", rebirthPoints: "輪迴天賦點",
 combatPower: "戰力", enhanceStones: "強化石", reforgeStones: "洗鍊石", drillingStones: "打孔石",
 dailyKills: "當日擊殺", worldDamage: "世界首領傷害", mapId: "當前地圖", unlockedMapId: "解鎖地圖",
 bossTickets: "個人首領票券", worldAttempts: "世界首領次數", storedSeconds: "離線累積秒數",
};
export const INTEGRITY_REASON_LABELS: Record<string, string> = {
 unissued_rebirth: "沒有授權的輪迴變更", unissued_yuanbao: "元寶沒有對應來源", forged_combat_power: "戰力超出上限",
 excessive_gold: "金幣增量超過額度", excessive_experience: "經驗增量超過額度", excessive_enhanceStones: "強化石增量超過額度",
 excessive_reforgeStones: "洗鍊石增量超過額度", excessive_kills: "擊殺或通關速度超過額度", excessive_items: "新增裝備超過額度",
 excessive_worldDamage: "首領傷害增量超過額度", excessive_gems: "寶石增量超過額度", excessive_drillingStones: "打孔石增量超過額度",
 excessive_yuanbao: "元寶增量超過額度", invalid_experience: "經驗或等級不符規格", level_regression: "等級未經輪迴而下降",
 unissued_talent_points: "天賦點沒有對應來源", map_unlock_jump: "地圖解鎖跳階", unearned_map_unlock: "尚未通關前一張地圖",
 invalid_map_position: "地圖位置無效", invalid_best_floor: "通關層數無效", forged_equipment_power: "裝備原始戰力無效",
 changed_equipment_power: "既有裝備戰力被改動", changed_equipment_identity: "既有裝備身分被改動", forged_new_equipment: "新裝備不符掉落規格",
 duplicate_or_invalid_item: "裝備 ID 無效或重複", invalid_equipment: "裝備欄位無效", excessive_affixes: "詞綴數量超過品質上限",
 forged_affix_value: "詞綴數值超出範圍", invalid_affix: "詞綴格式無效", invalid_affix_unit: "詞綴單位不符規格",
 duplicate_or_invalid_mail: "郵件 ID 無效或重複", forged_mail_rewards: "新增郵件獎勵沒有授權", increased_mail_rewards: "郵件獎勵被增加",
 replayed_mail_rewards: "已領取郵件被重新開啟", unissued_boss_attempts: "首領次數沒有授權", unfunded_enhancement: "強化沒有足夠資源",
 invalid_gem_inventory: "寶石庫內容無效", invalid_gem_total: "寶石總量無效", invalid_sockets: "裝備孔位無效", invalid_socket_gem: "鑲嵌寶石無效",
 invalid_save_field:"存檔欄位型別或結構無效",
 unissued_reforge:"洗鍊沒有伺服器授權", unissued_drill:"打孔沒有伺服器授權", invalid_equipment_loadout:"穿著裝備或槽位無效",
 invalid_talents: "輪迴天賦欄位無效",
};
export type IntegrityChange = { field: string; before: string | number | null; submitted: string | number | null };
function display(value: unknown): string | number | null {
 if (value === undefined || value === null) return null;
 if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
 if (typeof value === "string") return value.slice(0, 100);
 return Array.isArray(value) ? `[陣列 ${value.length} 筆]` : typeof value === "object" ? "[物件]" : String(value);
}
export function integrityAuditDetail(playerId: string, reason: string, server: Record<string, unknown>, incoming: Record<string, unknown>, field?: string) {
 const changes: IntegrityChange[] = [];
 for (const field of Object.keys(INTEGRITY_FIELD_LABELS)) if (server[field] !== incoming[field])
  changes.push({field,before:display(server[field]),submitted:display(incoming[field])});
 for (const field of ["items", "mails", "gemInventory"]) {
  const before = Array.isArray(server[field]) ? server[field].length : 0;
  const submitted = Array.isArray(incoming[field]) ? incoming[field].length : 0;
  if (before !== submitted) changes.push({field,before,submitted});
 }
 return JSON.stringify({ playerId: playerId.slice(0,80), reason: reason.slice(0,80), ...(field ? {field:field.slice(0,100)} : {}), changes });
}
export function parseIntegrityDetail(detail: string) {
 try {
  const parsed = JSON.parse(detail);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { reason: "unknown", changes: [] as IntegrityChange[] };
  return { ...(typeof parsed.field === "string" ? {field:parsed.field.slice(0,100)} : {}), reason: typeof parsed.reason === "string" ? parsed.reason.slice(0,80) : "unknown",
   changes: Array.isArray(parsed.changes) ? parsed.changes.slice(0,25).filter((change: IntegrityChange) => change && typeof change.field === "string" && change.field.length < 80)
    .map((change: IntegrityChange) => ({field:change.field,before:display(change.before),submitted:display(change.submitted)})) : [] as IntegrityChange[] };
 } catch { return { reason: "unknown", changes: [] as IntegrityChange[] }; }
}
export function integrityReasonLabel(reason: string) {
 if(typeof reason!=="string")return "其他存檔驗證問題";
 return INTEGRITY_REASON_LABELS[reason] ?? (reason.startsWith("invalid_") && INTEGRITY_FIELD_LABELS[reason.slice(8)]
  ? `${INTEGRITY_FIELD_LABELS[reason.slice(8)]}格式無效` : "其他存檔驗證問題");
}
