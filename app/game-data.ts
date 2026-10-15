export type GameClass = "戰士" | "遊俠" | "法師";
import { balanceConfig } from "./balance-config";
import { monsterProfile } from "./balance";

export const classes = [
  { name: "戰士" as const, icon: "⚔", role: "近戰・首領剋星", desc: "以重甲與怒氣正面突破，生命與首領傷害最高。", stats: ["生命 620", "攻擊 54", "防禦 36"], skill: "裂地斬" },
  { name: "遊俠" as const, icon: "➶", role: "高速・打寶專家", desc: "善用速度與暴擊連續狙殺，掛機收益穩定。", stats: ["攻速 22", "暴擊 12%", "閃避值 10"], skill: "穿雲箭" },
  { name: "法師" as const, icon: "✦", role: "單體・術式爆發", desc: "以高倍率元素術式擊穿單一敵人的防禦，擅長爆發與命中。", stats: ["魔攻 68", "經驗 +14%", "命中值 112"], skill: "霜火新星" },
];

const mapPresentation = [
  { id: 1, name: "灰燼墓園", level: 1, tone: "#4f5b55", sceneImage: "/maps/ash-graveyard.webp", set: "守夜旅者", gearPrefix: "灰燼", monsters: ["腐骨鼠", "遊魂", "墓地守衛", "食屍鬼", "墓園騎士"] },
  { id: 2, name: "骸骨荒原", level: 12, tone: "#6a5745", sceneImage: "/maps/bone-wastes.webp", set: "骸骨獵魂", gearPrefix: "荒骨", monsters: ["骨弓手", "骸骨犬", "荒原亡兵", "咒骸", "白骨巨獸"] },
  { id: 3, name: "黑鐵礦坑", level: 24, tone: "#475158", sceneImage: "/maps/black-iron-mine.webp", set: "黑鐵礦脈", gearPrefix: "黑鐵", monsters: ["礦穴蝠", "鐵殼蟲", "墮落礦工", "岩魔", "黑鐵監工"] },
  { id: 4, name: "毒霧沼澤", level: 36, tone: "#40533f", sceneImage: "/maps/toxic-mire.webp", set: "毒蛇秘儀", gearPrefix: "瘴毒", monsters: ["毒囊蛛", "泥沼屍", "瘴氣妖", "蛇人祭司", "腐沼巨鱷"] },
  { id: 5, name: "永夜密林", level: 50, tone: "#243d35", sceneImage: "/maps/evernight-forest.webp", set: "暮林獵影", gearPrefix: "暮林", monsters: ["影狼", "血鴉", "黑木精", "墮落獵人", "永夜樹妖"] },
  { id: 6, name: "惡魔城塞", level: 64, tone: "#5a2f32", sceneImage: "/maps/demon-fortress.webp", set: "惡魔征服", gearPrefix: "獄火", monsters: ["小惡魔", "獄火犬", "魅魔", "惡魔衛士", "城塞領主"] },
  { id: 7, name: "星界廢墟", level: 76, tone: "#37345e", sceneImage: "/maps/astral-ruins.webp", set: "星界飛升", gearPrefix: "星墜", monsters: ["星塵獸", "虛空眼", "失落法師", "星界守衛", "墜星巨像"] },
  { id: 8, name: "霜火王座", level: 88, tone: "#315064", sceneImage: "/maps/frostfire-throne.webp", set: "霜火天命", gearPrefix: "霜焰", monsters: ["霜魂", "熔火靈", "寒焰騎士", "冰晶龍", "霜火君王"] },
  { id: 9, name: "時墟深淵", level: 96, tone: "#4e315f", sceneImage: "/maps/timeworn-abyss.webp", set: "時墟輪迴", gearPrefix: "時蝕", monsters: ["時蝕蟲", "裂隙幽影", "逆時行者", "輪迴衛士", "時墟主宰"] },
] as const;

export const maps = mapPresentation.map((map, index) => ({ ...map, ...balanceConfig.maps[index] }));

export const monsterImages: Record<string, string> = {
  "骨弓手": "/monsters/骨弓手.webp",
  "骸骨犬": "/monsters/骸骨犬.webp",
  "荒原亡兵": "/monsters/荒原亡兵.webp",
  "咒骸": "/monsters/咒骸.webp",
  "白骨巨獸": "/monsters/白骨巨獸.webp",
  "毒囊蛛": "/monsters/毒囊蛛.webp",
  "泥沼屍": "/monsters/泥沼屍.webp",
  "瘴氣妖": "/monsters/瘴氣妖.webp",
  "蛇人祭司": "/monsters/蛇人祭司.webp",
  "腐沼巨鱷": "/monsters/腐沼巨鱷.webp",
  "小惡魔": "/monsters/小惡魔.webp",
  "獄火犬": "/monsters/獄火犬.webp",
  "魅魔": "/monsters/魅魔.webp",
  "惡魔衛士": "/monsters/惡魔衛士.webp",
  "城塞領主": "/monsters/城塞領主.webp",
  "礦穴蝠": "/monsters/礦穴蝠.webp",
  "鐵殼蟲": "/monsters/鐵殼蟲.webp",
  "墮落礦工": "/monsters/墮落礦工.webp",
  "岩魔": "/monsters/岩魔.webp",
  "黑鐵監工": "/monsters/黑鐵監工.webp",
  "影狼": "/monsters/影狼.webp",
  "血鴉": "/monsters/血鴉.webp",
  "黑木精": "/monsters/黑木精.webp",
  "墮落獵人": "/monsters/墮落獵人.webp",
  "永夜樹妖": "/monsters/永夜樹妖.webp",
  "星塵獸": "/monsters/星塵獸.webp",
  "虛空眼": "/monsters/虛空眼.webp",
  "失落法師": "/monsters/失落法師.webp",
  "星界守衛": "/monsters/星界守衛.webp",
  "墜星巨像": "/monsters/墜星巨像.webp",
  "霜魂": "/monsters/霜魂.webp",
  "熔火靈": "/monsters/熔火靈.webp",
  "寒焰騎士": "/monsters/寒焰騎士.webp",
  "冰晶龍": "/monsters/冰晶龍.webp",
  "霜火君王": "/monsters/霜火君王.webp",
  "時蝕蟲": "/monsters/時蝕蟲.webp",
  "裂隙幽影": "/monsters/裂隙幽影.webp",
  "逆時行者": "/monsters/逆時行者.webp",
  "輪迴衛士": "/monsters/輪迴衛士.webp",
  "時墟主宰": "/monsters/時墟主宰.webp",
  "腐骨鼠": "/monsters/腐骨鼠.webp",
  "遊魂": "/monsters/遊魂.webp",
  "墓地守衛": "/monsters/墓地守衛.webp",
  "食屍鬼": "/monsters/食屍鬼.webp",
  "墓園騎士": "/monsters/墓園騎士.webp",
  "白骨巨獸・殘影": "/monsters/白骨巨獸・殘影.webp",
  "白骨巨獸・真身": "/monsters/白骨巨獸・真身.webp",
  "黑鐵監工・殘影": "/monsters/黑鐵監工・殘影.webp",
  "黑鐵監工・真身": "/monsters/黑鐵監工・真身.webp",
  "腐沼巨鱷・殘影": "/monsters/腐沼巨鱷・殘影.webp",
  "腐沼巨鱷・真身": "/monsters/腐沼巨鱷・真身.webp",
  "城塞領主・殘影": "/monsters/城塞領主・殘影.webp",
  "城塞領主・真身": "/monsters/城塞領主・真身.webp",
  "永夜樹妖・殘影": "/monsters/永夜樹妖・殘影.webp",
  "永夜樹妖・真身": "/monsters/永夜樹妖・真身.webp",
  "墜星巨像・殘影": "/monsters/墜星巨像・殘影.webp",
  "墜星巨像・真身": "/monsters/墜星巨像・真身.webp",
  "霜火君王・殘影": "/monsters/霜火君王・殘影.webp",
  "霜火君王・真身": "/monsters/霜火君王・真身.webp",
  "時墟主宰・殘影": "/monsters/時墟主宰・殘影.webp",
  "時墟主宰・真身": "/monsters/時墟主宰・真身.webp",
  "墓園騎士・殘影": "/monsters/墓園騎士・殘影.webp",
  "墓園騎士・真身": "/monsters/墓園騎士・真身.webp",
  "深淵王": "/monsters/world-boss/deep-abyss-king.webp",
};

function personalBossPowerAtFloor(map: (typeof maps)[number], floor: number) {
  if (floor >= 30) return map.bossPower;
  const boundedFloor = Math.max(1, Math.min(29, floor));
  const interpolate = (start: number, end: number, step: number, steps: number) =>
    start + (end - start) * (step / steps);
  if (boundedFloor <= 10)
    return Math.round(interpolate(map.power[0], map.phasePower[0], boundedFloor - 1, 9));
  if (boundedFloor <= 20)
    return Math.round(interpolate(
      Math.round(map.phasePower[0] * balanceConfig.mapFloors.phaseTwoStartMultiplier),
      map.phasePower[1], boundedFloor - 11, 9,
    ));
  return Math.round(interpolate(
    Math.round(map.phasePower[1] * balanceConfig.mapFloors.phaseThreeStartMultiplier),
    map.power[1], boundedFloor - 21, 8,
  ));
}

export const personalBosses = maps.flatMap((map) => [1, 2].map((tier) => {
  const isShadow = tier === 1;
  // 個人首領一律以該地圖第 30 層首領為基準；殘影同強度，真身 1.25 倍。
  const baseTier: "elite" | "boss" = "boss";
  const baseFloor = 30;
  const multiplier = isShadow ? 1 : 1.25;
  const recommendedPower = personalBossPowerAtFloor(map, baseFloor);
  const baseHealth = Math.max(
    balanceConfig.mapFloors.monsterHealth.minimum,
    Math.round(
      recommendedPower *
        balanceConfig.mapFloors.monsterHealth[baseTier] *
        balanceConfig.mapFloors.monsterHealth.combatMultiplier[baseTier] *
        monsterProfile(map.monsters[4]).health,
    ),
  );
  return {
    id: `${map.id}-${tier}`,
    name: tier === 1 ? `${map.monsters[4]}・殘影` : `${map.monsters[4]}・真身`,
    level: Math.min(100, map.level + baseFloor - 1),
    map: map.name,
    mapId: map.id,
    baseTier,
    baseFloor,
    recommendedPower,
    multiplier,
    hp: Math.round(baseHealth * multiplier),
    reward: tier === 1 ? "本區域史詩裝備 1～2 件・洗鍊石依難度增加" : "本區域傳奇裝備 1～2 件・洗鍊石依難度增加",
  };
}));

export const worldBosses = [
  {
    id: 1,
    name: "深淵王",
    level: 50,
    hp: 12_000_000,
    accent: "#985cff",
    image: "/monsters/world-boss/deep-abyss-king.webp",
    active: true,
    skill: "萬觸葬界",
    recommendedPower: 140_000,
  },
  {
    id: 2,
    name: "黑月龍神",
    level: 80,
    hp: 38_000_000,
    accent: "#7655a5",
    image: "",
    active: false,
    skill: "尚未揭露",
    recommendedPower: 260_000,
  },
  {
    id: 3,
    name: "輪迴魔神",
    level: 100,
    hp: 100_000_000,
    accent: "#c8792d",
    image: "",
    active: false,
    skill: "尚未揭露",
    recommendedPower: 520_000,
  },
];

export const items = [
  { id: 1, name: "守夜者鐵劍", slot: "武器", quality: "優秀", power: 164, enhance: 5, set: "守夜旅者", affixes: ["攻擊 +28", "暴擊 +4%", "首領傷害 +3%"] },
  { id: 2, name: "守夜者胸甲", slot: "胸甲", quality: "史詩", power: 218, enhance: 7, set: "守夜旅者", affixes: ["防禦 +42", "生命 +180", "閃避 +3", "傷害減免 +2%"] },
  { id: 3, name: "灰燼指環", slot: "戒指", quality: "傳奇", power: 286, enhance: 3, set: "", affixes: ["攻擊 +36", "暴擊 +6%", "命中 +5", "吸血 +3%", "金幣 +8%"] },
  { id: 4, name: "旅者皮靴", slot: "鞋子", quality: "良好", power: 102, enhance: 0, set: "守夜旅者", affixes: ["攻速 +5", "閃避 +3"] },
  { id: 5, name: "幽魂護符", slot: "項鍊", quality: "傳奇", power: 362, enhance: 10, set: "", affixes: ["生命 +260", "攻擊 +45", "命中 +7", "暴擊 +7%", "吸血 +5%", "經驗 +9%"] },
];

export const qualityColors: Record<string, string> = {
  普通: "#b8b5aa", 良好: "#69bd72", 優秀: "#53a9df", 史詩: "#a76fe0", 傳奇: "#e78a32", 神話: "#e75c63",
};

export const navItems = ["主控", "地圖", "背包", "寶石", "技能", "首領", "排行", "商城", "日誌"] as const;
export type NavItem = typeof navItems[number];

export const skillsByClass: Record<GameClass, {name:string; desc:string; level:number; max:number; cost:number}[]> = {
  戰士: [
    { name: "裂地斬", desc: "10% 觸發，造成 180% 傷害並忽略防禦 35%，持續 4 次攻擊。", level: 3, max: 10, cost: 2 },
    { name: "鮮血怒吼", desc: "每場戰鬥一次：生命低於 40% 時自動觸發，接下來 5 次攻擊提高傷害並獲得吸血；裝備血神的心臟時改為 7 次，最後一擊追加血爆。", level: 2, max: 8, cost: 2 },
    { name: "鋼鐵壁壘", desc: "被動提高防禦，受到攻擊時有機率完全格擋。", level: 4, max: 10, cost: 1 },
    { name: "處決", desc: "每 10 次攻擊施放一次追加傷害。Lv1 160%／Lv2 180%／Lv3 200%／Lv4 220%／Lv5 250%。", level: 0, max: 5, cost: 3 },
  ],
  遊俠: [
    { name: "穿雲箭", desc: "6% 觸發，造成 180% 傷害並忽略敵人 35% 防禦。", level: 3, max: 10, cost: 2 },
    { name: "疾風連射", desc: "8% 觸發，連續射出 5 支箭；每支箭在命中時獨立結算傷害。技能等級提高每箭傷害，裝備千羽風暴時改為 7 支箭。", level: 2, max: 8, cost: 2 },
    { name: "獵手本能", desc: "被動：暴擊率提高（2%＋技能等級），閃避值提高（2＋技能等級）；每次暴擊有（6%＋技能等級）機率追加 1 次攻擊。裝備白銀獵神之瞳時追加機率提高至 20%，追加攻擊再次暴擊會強化下一擊暴傷。", level: 4, max: 10, cost: 1 },
    { name: "致命標記", desc: "觸發後，前 5 次攻擊逐次追加傷害；第 6 下引爆。Lv.1～5：每次 +10%／+14%／+18%／+22%／+24%，爆炸 140%／160%／180%／200%／220%；魅惑女王的契約使爆炸 +50%。", level: 0, max: 5, cost: 3 },
  ],
  法師: [
    { name: "霜火新星", desc: "12% 觸發，對單一敵人造成 200% 傷害；灼燒 5 秒，每秒造成敵人最大生命 3%。", level: 3, max: 10, cost: 2 },
    { name: "奧術回響", desc: "10% 觸發，將本次技能傷害以 60% 再施放一次；裝備阿卡夏・禁忌書頁時，每施放 4 次技能讓下一個主動技能免費回響。", level: 2, max: 8, cost: 2 },
    { name: "魔力護盾", desc: "受到攻擊時有機率觸發，降低下一次受到的傷害。", level: 4, max: 10, cost: 1 },
    { name: "隕星術", desc: "8% 觸發，對單一敵人造成 400% 傷害；對首領額外提高 25%。", level: 0, max: 5, cost: 3 },
  ],
};
