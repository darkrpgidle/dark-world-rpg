export type CatalogClass = "戰士" | "遊俠" | "法師" | "通用";
export type CatalogKind = "general-mythic" | "skill-mythic" | "special-legendary";

export type CatalogBonus = {
  hpPct?: number;
  attackPct?: number;
  defensePct?: number;
  speed?: number;
  speedPct?: number;
  hit?: number;
  dodge?: number;
  crit?: number;
  lifesteal?: number;
  damageReduction?: number;
  skillDamage?: number;
  bossDamage?: number;
  expBonus?: number;
  goldBonus?: number;
  equipmentDrop?: number;
  resourceDrop?: number;
};

export type EquipmentCatalogDefinition = {
  id: string;
  name: string;
  slot: string;
  kind: CatalogKind;
  className: CatalogClass;
  artKey: string;
  skill?: string;
  effectTitle: string;
  effectDescription: string;
  story?: string;
  bonus?: CatalogBonus;
};

// The first twelve crops are the world-drop mythics in the supplied 4 × 6
// sheet. They are intentionally class-neutral so every build can use them.
export const GENERAL_MYTHICS: EquipmentCatalogDefinition[] = [
  {
    id: "general-mythic-abyss-blade",
    name: "《赤燼裂刃》",
    slot: "武器",
    kind: "general-mythic",
    className: "通用",
    artKey: "general-01",
    effectTitle: "無情",
    effectDescription: "攻擊 +8%。",
    bonus: { attackPct: 8 },
  },
  {
    id: "general-mythic-sky-bow",
    name: "《蒼穹回響》",
    slot: "武器",
    kind: "general-mythic",
    className: "通用",
    artKey: "general-02",
    effectTitle: "遠星",
    effectDescription: "命中 +6%、暴擊 +4%。",
    bonus: { hit: 6, crit: 4 },
  },
  {
    id: "general-mythic-unnamed-page",
    name: "《禁書・無名頁》",
    slot: "武器",
    kind: "general-mythic",
    className: "通用",
    artKey: "general-03",
    effectTitle: "秘法",
    effectDescription: "技能傷害 +10%。",
    bonus: { skillDamage: 10 },
  },
  {
    id: "general-mythic-golden-crown",
    name: "《黃金天穹》",
    slot: "頭盔",
    kind: "general-mythic",
    className: "通用",
    artKey: "general-04",
    effectTitle: "王權",
    effectDescription: "防禦 +10%。",
    bonus: { defensePct: 10 },
  },
  {
    id: "general-mythic-immortal-wall",
    name: "《不朽鐵壁》",
    slot: "胸甲",
    kind: "general-mythic",
    className: "通用",
    artKey: "general-05",
    effectTitle: "不落",
    effectDescription: "最大生命 +12%。",
    bonus: { hpPct: 12 },
  },
  {
    id: "general-mythic-infernal-fist",
    name: "《炎獄鐵拳》",
    slot: "手套",
    kind: "general-mythic",
    className: "通用",
    artKey: "general-06",
    effectTitle: "熾速",
    effectDescription: "攻速 +8。",
    bonus: { speed: 8 },
  },
  {
    id: "general-mythic-ghostwalker",
    name: "《幽界行者》",
    slot: "鞋子",
    kind: "general-mythic",
    className: "通用",
    artKey: "general-07",
    effectTitle: "無跡",
    effectDescription: "閃避 +8%。",
    bonus: { dodge: 8 },
  },
  {
    id: "general-mythic-timeglass",
    name: "《時輪沙漏》",
    slot: "項鍊",
    kind: "general-mythic",
    className: "通用",
    artKey: "general-08",
    effectTitle: "時流",
    effectDescription: "經驗 +12%。",
    bonus: { expBonus: 12 },
  },
  {
    id: "general-mythic-gold-eye",
    name: "《巨富之眼》",
    slot: "戒指",
    kind: "general-mythic",
    className: "通用",
    artKey: "general-09",
    effectTitle: "聚金",
    effectDescription: "金幣 +15%。",
    bonus: { goldBonus: 15 },
  },
  {
    id: "general-mythic-mountain-bone",
    name: "《山脈之骨》",
    slot: "腰帶",
    kind: "general-mythic",
    className: "通用",
    artKey: "general-10",
    effectTitle: "厚土",
    effectDescription: "最大生命 +10%、資源掉落率 +10%。",
    bonus: { hpPct: 10, resourceDrop: 10 },
  },
  {
    id: "general-mythic-fate-thorn",
    name: "《逆命荊冠》",
    slot: "護腕",
    kind: "general-mythic",
    className: "通用",
    artKey: "general-11",
    effectTitle: "逆命",
    effectDescription: "傷害減免 +5%。",
    bonus: { damageReduction: 5 },
  },
  {
    id: "general-mythic-night-reign",
    name: "《夜幕君臨》",
    slot: "披風",
    kind: "general-mythic",
    className: "通用",
    artKey: "general-12",
    effectTitle: "暗潮",
    effectDescription: "首領傷害 +8%。",
    bonus: { bossDamage: 8 },
  },
];

export const SKILL_MYTHICS: EquipmentCatalogDefinition[] = [
  {
    id: "skill-warrior-titan-axe",
    name: "《裂界・泰坦戰斧》",
    slot: "武器",
    kind: "skill-mythic",
    className: "戰士",
    artKey: "skill-01",
    skill: "裂地斬",
    effectTitle: "大地崩解",
    effectDescription: "裂地斬命中後留下崩裂地面；接下來 3 次普攻額外造成 30% 傷害，第三次引爆裂痕造成 100% 傷害。",
  },
  {
    id: "skill-warrior-blood-heart",
    name: "《血神的心臟》",
    slot: "項鍊",
    kind: "skill-mythic",
    className: "戰士",
    artKey: "skill-02",
    skill: "鮮血怒吼",
    effectTitle: "血神降臨",
    effectDescription: "鮮血怒吼由 5 次強化攻擊提高為 7 次；最後一擊消耗目前生命 10%，造成 250% 血爆傷害。",
  },
  {
    id: "skill-warrior-fallen-city",
    name: "《不落王城》",
    slot: "胸甲",
    kind: "skill-mythic",
    className: "戰士",
    artKey: "skill-03",
    skill: "鋼鐵壁壘",
    effectTitle: "絕對防禦",
    effectDescription: "成功完全格擋後，下一次攻擊附加自身防禦 ×150% 傷害。",
  },
  {
    id: "skill-warrior-executioner",
    name: "《斷頭者・末日刑具》",
    slot: "手套",
    kind: "skill-mythic",
    className: "戰士",
    artKey: "skill-04",
    skill: "處決",
    effectTitle: "死亡宣告",
    effectDescription: "處決由每 10 次攻擊提前為第 8 次；目標生命低於 25% 時，處決傷害再提高 100%。",
  },
  {
    id: "skill-ranger-sky-piercer",
    name: "《蒼穹穿刺者》",
    slot: "武器",
    kind: "skill-mythic",
    className: "遊俠",
    artKey: "skill-05",
    skill: "穿雲箭",
    effectTitle: "貫星",
    effectDescription: "穿雲箭忽略防禦由 35% 提高至 60%；命中後使下一次攻擊傷害 +30%。",
  },
  {
    id: "skill-ranger-thousand-feathers",
    name: "《千羽風暴》",
    slot: "手套",
    kind: "skill-mythic",
    className: "遊俠",
    artKey: "skill-06",
    skill: "疾風連射",
    effectTitle: "箭雨狂潮",
    effectDescription: "疾風連射由 5 段提高為 7 段，總傷害 +20%；每箭獨立暴擊，最後一箭必定暴擊。",
  },
  {
    id: "skill-ranger-hunter-eye",
    name: "《白銀獵神之瞳》",
    slot: "頭盔",
    kind: "skill-mythic",
    className: "遊俠",
    artKey: "skill-07",
    skill: "獵手本能",
    effectTitle: "完美獵殺",
    effectDescription: "暴擊觸發追加攻擊的機率由 10% 提高至 20%；追加攻擊再次暴擊時，下一擊暴擊傷害 +40%。",
  },
  {
    id: "skill-ranger-queen-contract",
    name: "《魅惑女王的契約》",
    slot: "戒指",
    kind: "skill-mythic",
    className: "遊俠",
    artKey: "skill-08",
    skill: "致命標記",
    effectTitle: "女王之吻",
    effectDescription: "第 6 下爆炸傷害 +50%；爆炸後下一隻敵人直接帶有 2 層標記。",
  },
  {
    id: "skill-mage-polar-staff",
    name: "《霜燼・雙極權杖》",
    slot: "武器",
    kind: "skill-mythic",
    className: "法師",
    artKey: "skill-09",
    skill: "霜火新星",
    effectTitle: "冰火悖論",
    effectDescription: "灼燒中的敵人再次受到霜火新星時，立即引爆剩餘灼燒總傷害 ×150%。",
  },
  {
    id: "skill-mage-eternal-core",
    name: "《永恆魔力核心》",
    slot: "項鍊",
    kind: "skill-mythic",
    className: "法師",
    artKey: "skill-10",
    skill: "魔力護盾",
    effectTitle: "過載",
    effectDescription: "護盾存在期間技能傷害 +25%；護盾被打破時產生魔力爆炸，造成最大生命 15% 的魔法傷害。",
  },
  {
    id: "skill-mage-cataclysm-crown",
    name: "《天災觀測者》",
    slot: "頭盔",
    kind: "skill-mythic",
    className: "法師",
    artKey: "skill-11",
    skill: "隕星術",
    effectTitle: "滅世星雨",
    effectDescription: "隕星落下後有 35% 機率追加第二顆隕星；第二顆造成原傷害 70%，且必定暴擊。",
  },
  {
    id: "skill-mage-akasha-pages",
    name: "《阿卡夏・禁忌書頁》",
    slot: "披風",
    kind: "skill-mythic",
    className: "法師",
    artKey: "skill-12",
    skill: "奧義回響",
    effectTitle: "魔法回響",
    effectDescription: "每次施放技能獲得 1 層奧術；達到 4 層後，下一個主動技能免費再施放一次，回響傷害為原技能 60%。",
  },
];

export const SPECIAL_LEGENDARIES: EquipmentCatalogDefinition[] = [
  { id: "special-bloodfang", name: "《嗜血者・斷牙》", slot: "武器", kind: "special-legendary", className: "通用", artKey: "legendary-01", effectTitle: "嗜血", effectDescription: "擊殺敵人後，接下來 5 次攻擊傷害 +12%。" },
  { id: "special-blackfang", name: "《破甲者・黑鋒》", slot: "武器", kind: "special-legendary", className: "通用", artKey: "legendary-02", effectTitle: "穿甲", effectDescription: "攻擊忽略敵人 8% 防禦。" },
  { id: "special-warhelm", name: "《亡國將軍之盔》", slot: "頭盔", kind: "special-legendary", className: "通用", artKey: "legendary-03", effectTitle: "戰意", effectDescription: "生命高於 80% 時，攻擊 +10%。" },
  { id: "special-ashguard", name: "《灰燼守衛》", slot: "胸甲", kind: "special-legendary", className: "通用", artKey: "legendary-04", effectTitle: "守勢", effectDescription: "生命低於 40% 時，傷害減免 +8%。" },
  { id: "special-berserker-fist", name: "《狂戰士的鐵拳》", slot: "手套", kind: "special-legendary", className: "通用", artKey: "legendary-05", effectTitle: "狂擊", effectDescription: "暴擊後，下一次普通攻擊傷害 +20%。" },
  { id: "special-shadowwalker", name: "《幽影旅者》", slot: "鞋子", kind: "special-legendary", className: "通用", artKey: "legendary-06", effectTitle: "疾影", effectDescription: "成功閃避後，攻速 +12%，持續 3 次攻擊。" },
  { id: "special-blood-prayer", name: "《鮮血祈禱》", slot: "項鍊", kind: "special-legendary", className: "通用", artKey: "legendary-07", effectTitle: "血契", effectDescription: "吸血 +4%；生命低於 30% 時額外 +3%。", bonus: { lifesteal: 4 } },
  { id: "special-demonhunter-ring", name: "《獵魔人的戒指》", slot: "戒指", kind: "special-legendary", className: "通用", artKey: "legendary-08", effectTitle: "獵魔", effectDescription: "對首領傷害 +12%。", bonus: { bossDamage: 12 } },
  { id: "special-giant-bone", name: "《巨人遺骨》", slot: "腰帶", kind: "special-legendary", className: "通用", artKey: "legendary-09", effectTitle: "巨軀", effectDescription: "最大生命 +15%，但攻速 -5%。", bonus: { hpPct: 15, speedPct: -5 } },
  { id: "special-revenge-thorn", name: "《復仇荊棘》", slot: "護腕", kind: "special-legendary", className: "通用", artKey: "legendary-10", effectTitle: "反擊", effectDescription: "受到攻擊後，下一次攻擊傷害 +8%，最多疊加 3 層。" },
  { id: "special-nightveil", name: "《夜行者之幕》", slot: "披風", kind: "special-legendary", className: "通用", artKey: "legendary-11", effectTitle: "暗襲", effectDescription: "每隻新敵人的第一次攻擊傷害 +30%。" },
  { id: "special-greedy-seal", name: "《貪婪者的黃金印記》", slot: "戒指", kind: "special-legendary", className: "通用", artKey: "legendary-12", effectTitle: "貪婪", effectDescription: "金幣 +15%、裝備掉落率 +3%。", bonus: { goldBonus: 15, equipmentDrop: 3 } },
];

export const ALL_CATALOG_EQUIPMENT = [
  ...GENERAL_MYTHICS,
  ...SKILL_MYTHICS,
  ...SPECIAL_LEGENDARIES,
];

/** Short lore used by the equipment detail panel for every named special item. */
export const CATALOG_STORIES: Record<string, string> = {
  "general-mythic-abyss-blade": "赤燼從深淵裂口中醒來，刀鋒吞噬火光，只留下無法止息的殺意。",
  "general-mythic-sky-bow": "傳說它曾射穿夜空中的第一顆流星，箭矢至今仍追逐遙遠的星火。",
  "general-mythic-unnamed-page": "這一頁沒有名字，因為所有讀過它的人，都將自己的名字留在了書頁裡。",
  "general-mythic-golden-crown": "失落王朝的冠冕仍保存著王令，戴上它的人會聽見群星向王座低語。",
  "general-mythic-immortal-wall": "它由不朽城塞的最後一面城牆鍛成，曾替一整支軍隊擋下末日洪流。",
  "general-mythic-infernal-fist": "炎獄的鐵匠以熔岩鍛打拳套，讓每一次揮擊都像地底火脈重新甦醒。",
  "general-mythic-ghostwalker": "幽界行者不留下腳印，只有靠近死亡的人，才看得見它經過時掠過的冷光。",
  "general-mythic-timeglass": "沙漏裡流動的不是沙，而是被時輪捨棄的歲月；每一粒都能換來片刻先機。",
  "general-mythic-gold-eye": "巨富之眼凝視過無數王國興亡，最終只承認真正能握住財富的人。",
  "general-mythic-mountain-bone": "山脈崩塌後留下的巨骨仍在低鳴，穿戴者彷彿背負著整座大地前行。",
  "general-mythic-fate-thorn": "荊冠曾刺穿命運本身，所有試圖改寫結局的勇者，都會在它面前付出代價。",
  "general-mythic-night-reign": "夜幕君臨之時，月光也要熄滅；披風中的黑潮只為真正的獵王展開。",
  "skill-warrior-titan-axe": "泰坦戰斧埋藏著裂界核心，每次落地都讓大地想起遠古巨人的怒吼。",
  "skill-warrior-blood-heart": "血神的心臟仍在鎖鏈中跳動，低沉的搏動會把戰士的生命化為狂暴力量。",
  "skill-warrior-fallen-city": "不落王城最後一扇城門被鑄進胸甲，守護者倒下之前，城門絕不會關閉。",
  "skill-warrior-executioner": "末日刑具曾斬下暴君的頭顱，斷頭台符文會在獵物最虛弱時自行甦醒。",
  "skill-ranger-sky-piercer": "蒼穹水晶沒有弓弦，因為真正的弓弦是天穹與箭矢之間那道看不見的星線。",
  "skill-ranger-thousand-feathers": "風之羽箭來自精靈王庭的暴風祭壇，千羽齊鳴時，天空便成為獵場。",
  "skill-ranger-hunter-eye": "銀冠中的瞄準環記錄過每一頭天災魔獸，沒有獵物能在它鎖定後逃離命運。",
  "skill-ranger-queen-contract": "寶石中的魅惑精靈與女王訂下契約，以每一次標記換取敵人逐步失去抵抗的意志。",
  "skill-mage-polar-staff": "雙極核心同時燃燒冰焰與烈火，只有能承受矛盾的人，才不會被自己的魔力吞噬。",
  "skill-mage-eternal-core": "永恆魔力核心曾是古代法師塔的心臟，護盾碎裂時仍會以最後的魔力反咬敵人。",
  "skill-mage-cataclysm-crown": "觀測者把一小片天災封進冠冕，星環轉動之時，隕星便循著預言墜落。",
  "skill-mage-akasha-pages": "禁忌書頁記載著阿卡夏的回聲，每翻過一頁，現實便要重複一次法術的餘燼。",
  "special-bloodfang": "斷牙曾屬於一名只在戰場上進食的狂戰士，飲下敵血後，劍身會記住下一次撕裂的方向。",
  "special-blackfang": "黑鋒以腐蝕礦脈鍛成，專門尋找鎧甲最細小的裂縫，讓防禦變成無用的幻象。",
  "special-warhelm": "亡國將軍在最後一戰仍戴著它，頭盔保存的不是榮耀，而是永不熄滅的戰意。",
  "special-ashguard": "灰燼守衛從焚城火海中被尋回，餘燼提醒穿戴者：真正的防線是在絕境裡仍站著。",
  "special-berserker-fist": "鐵拳上的凹痕來自無數次不退的衝鋒，越接近致命一擊，它就越渴望再次出拳。",
  "special-shadowwalker": "幽影旅者只在風停下時現身，避開死亡的瞬間，會把身影留在下一次攻擊裡。",
  "special-blood-prayer": "血晶十字架向古老神祇祈禱，代價是以自身鮮血換取不屈的回生力量。",
  "special-demonhunter-ring": "獵魔人的戒指刻著第一頭被斬殺的惡魔名字，所有首領都能感受到那道追獵目光。",
  "special-giant-bone": "巨獸死後留下的脊骨仍承受著山嶽重量，穿戴者得到龐大生命，也必須承擔沉重軀體。",
  "special-revenge-thorn": "荊棘會記住每一道傷口，受創越深，黑刺越渴望替主人把痛楚送回敵人身上。",
  "special-nightveil": "夜行者把自己的影子縫進斗篷，踏入陌生戰場的第一步，永遠藏著最致命的伏擊。",
  "special-greedy-seal": "黃金印記曾讓一名乞丐建立王國，也讓他的王座在貪婪中化作無人看守的空殿。",
};

export function catalogStory(definition: EquipmentCatalogDefinition) {
  return CATALOG_STORIES[definition.id] ?? "這件裝備承載著一段尚未被冒險者解讀的古老傳說。";
}

const byId = new Map(ALL_CATALOG_EQUIPMENT.map((definition) => [definition.id, definition]));
const byName = new Map(ALL_CATALOG_EQUIPMENT.map((definition) => [definition.name, definition]));

export function findEquipmentDefinition(item: { mythicId?: string; legendaryId?: string; name?: string }): EquipmentCatalogDefinition | undefined {
  return (item.mythicId ? byId.get(item.mythicId) : undefined)
    ?? (item.legendaryId ? byId.get(item.legendaryId) : undefined)
    ?? (item.name ? byName.get(item.name) : undefined);
}

export function hasCatalogItem(items: Array<{ mythicId?: string; legendaryId?: string; name?: string }>, id: string) {
  return items.some((item) => findEquipmentDefinition(item)?.id === id);
}

export function equippedSkillMythic(items: Array<{ mythicId?: string; legendaryId?: string; name?: string }>, skill: string) {
  return SKILL_MYTHICS.find((definition) => definition.skill === skill && hasCatalogItem(items, definition.id));
}

export function catalogBonus(items: Array<{ mythicId?: string; legendaryId?: string; name?: string }>) {
  return ALL_CATALOG_EQUIPMENT.reduce((total, definition) => {
    if (!hasCatalogItem(items, definition.id) || !definition.bonus) return total;
    for (const [key, value] of Object.entries(definition.bonus) as [keyof CatalogBonus, number][]) {
      total[key] = (total[key] ?? 0) + value;
    }
    return total;
  }, {} as CatalogBonus);
}
