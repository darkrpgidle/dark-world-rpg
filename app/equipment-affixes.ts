import {balanceConfig} from './balance-config';
import {enhancementBonusPercent} from './balance';
import {maps} from './game-data';
import {amplifyEquipmentStat} from './equipment-epithets';
export type Item={name:string;slot:string;quality:string;enhance:number;affixes:string[];mapId?:number;set?:string;prefixId?:string;suffixId?:string;mythicId?:string;legendaryId?:string;equipmentType?:string;worldBossRewardId?:string;worldBossRewardRank?:number};
type EquipmentStatName =
  | "生命"
  | "生命%"
  | "攻擊"
  | "攻擊%"
  | "防禦"
  | "防禦%"
  | "攻速"
  | "命中"
  | "閃避"
  | "暴擊"
  | "暴擊傷害"
  | "吸血"
  | "經驗"
  | "金幣"
  | "首領傷害"
  | "傷害減免"
  | "技能傷害"
  | "首領減傷"
  | "資源掉落率"
  | "元寶掉率";
type EquipmentStat = {
  name: EquipmentStatName;
  value: number;
  original: number;
  percent?: boolean;
};
type AffixRoll = {
  name: EquipmentStatName;
  minimum: number;
  maximum: number;
  percent?: boolean;
};

const qualityOrder = ["普通", "良好", "優秀", "史詩", "傳奇", "神話"];
const MAX_AFFIXES_BY_QUALITY = [0, 1, 2, 3, 4, 5] as const;

export function equipmentMapId(item: Item) {
  const inferredMap = maps.findIndex(
    (map) =>
      item.set === map.set ||
      item.name.startsWith(map.set) ||
      item.name.startsWith(map.gearPrefix),
  );
  return Math.max(
    1,
    Math.min(maps.length, item.mapId ?? (inferredMap >= 0 ? inferredMap + 1 : 1)),
  );
}


function isSceneEquipment(item: Item) {
  if (item.quality === "神話" || item.mythicId || item.legendaryId ||
      item.equipmentType === "神話裝備" || item.equipmentType === "特殊傳奇") return false;
  return item.equipmentType === "場景普通裝備" || maps.some(map =>
    item.set === map.set || item.name.startsWith(map.set) || item.name.startsWith(map.gearPrefix));
}

export function equipmentBaseStats(item: Item, enhanceLevel = item.enhance, historicalScale = false): EquipmentStat[] {
  const mapId = equipmentMapId(item);
  const scales = !historicalScale && isSceneEquipment(item)
    ? balanceConfig.equipment.sceneScaleByMap : balanceConfig.equipment.baseScaleByMap;
  const scale = scales[mapId] ?? 1;
  const baseBySlot = balanceConfig.equipment.baseStats as Record<string, readonly (readonly [EquipmentStatName, number, number])[]>;
  const bonus = enhancementBonusPercent(enhanceLevel);
  const qualityRank = Math.max(0, Math.min(qualityOrder.length - 1, qualityOrder.indexOf(item.quality)));
  const qualityMultiplier = balanceConfig.equipment.baseQualityMultipliers[qualityRank] ?? 1;
  return (baseBySlot[item.slot] ?? baseBySlot.武器).map(([name, base, growth]) => {
    const setMultiplier = item.set ? 1.15 : 1;
    const rawBase = Math.round((base + mapId * growth) * scale * qualityMultiplier * setMultiplier);
    const original = amplifyEquipmentStat(item, name, rawBase, "base");
    return {
    name,
    original,
    // The epithet increases this item's inherent stat; enhancement keeps its original scaling.
    value: Math.round(rawBase * (1 + bonus / 100)) + (original - rawBase),
  }; });
}


const flatQualityBands = balanceConfig.equipment.affixes.flatQualityMultipliers;
const percentQualityBands = balanceConfig.equipment.affixes.percentQualityBands as Record<
  Exclude<EquipmentStatName, "生命" | "攻擊" | "防禦" | "攻速" | "命中" | "閃避">,
  readonly (readonly [number, number])[]
>;

export function affixOptions(item: Item, historicalScale = false, historicalFlat = false): AffixRoll[] {
  const rank = Math.max(0, Math.min(5, qualityOrder.indexOf(item.quality)));
  const mapId = equipmentMapId(item);
  const [qualityMinimum, qualityMaximum] = flatQualityBands[rank];
  const canonicalBase = (name: "生命" | "攻擊" | "防禦") => {
    const slot = name === "攻擊" ? "武器" : name === "防禦" ? "胸甲" : "腰帶";
    const statMultiplier = !historicalScale && !historicalFlat && isSceneEquipment(item) && name !== "攻擊"
      ? balanceConfig.equipment.affixes.sceneFlatStatMultipliers[name] : 1;
    return (
      equipmentBaseStats({ ...item, slot } as Item, 0, historicalScale).find(
        (stat) => stat.name === name,
      )?.original ?? 1
    ) * statMultiplier;
  };
  const flat = (
    name: "生命" | "攻擊" | "防禦",
    multiplier = 1,
  ): AffixRoll => ({
    name,
    minimum: Math.max(
      1,
      Math.round(canonicalBase(name) * multiplier * qualityMinimum),
    ),
    maximum: Math.max(
      1,
      Math.round(canonicalBase(name) * multiplier * qualityMaximum),
    ),
  });
  const percentage = (
    name: Exclude<EquipmentStatName, "生命" | "攻擊" | "防禦" | "攻速" | "命中" | "閃避">,
    growth: number,
  ): AffixRoll => {
    const [minimum, maximum] = percentQualityBands[name][rank];
    const mapBonus = Math.min(2, Math.floor((mapId - 1) * growth));
    return { name, minimum: minimum + mapBonus, maximum: maximum + mapBonus, percent: true };
  };
  const percentageFixed = (
    name: Exclude<EquipmentStatName, "生命" | "攻擊" | "防禦" | "攻速" | "命中" | "閃避">,
  ): AffixRoll => {
    const [minimum, maximum] = percentQualityBands[name][rank];
    return { name, minimum, maximum, percent: true };
  };
  const rating = (name: "命中" | "閃避"): AffixRoll => {
    const [minimum, maximum] = balanceConfig.equipment.affixes.ratingQualityBands[name][rank];
    const mapGrowth = balanceConfig.equipment.affixes.ratingMapGrowth[name];
    const mapBonus = Math.min(2, Math.floor((mapId - 1) * mapGrowth));
    return { name, minimum: minimum + mapBonus, maximum: maximum + mapBonus };
  };
  const speed = (): AffixRoll => {
    const speedBands = balanceConfig.equipment.affixes.speedQualityBands;
    const [minimum, maximum] = speedBands[rank];
    const mapBonus = Math.floor((mapId - 1) * balanceConfig.equipment.affixes.speedMapGrowth);
    return { name: "攻速", minimum: minimum + mapBonus, maximum: maximum + mapBonus, percent: true };
  };
  const percentFlat = (name: "生命%" | "攻擊%" | "防禦%", growth = 0.45): AffixRoll =>
    percentage(name, growth);
  const pools: Record<string, AffixRoll[]> = {
    武器: [flat("攻擊"), percentFlat("攻擊%"), percentage("暴擊", 0.45), percentage("暴擊傷害", 0.45), speed(), percentage("首領傷害", 0.6), percentage("技能傷害", 0.5), percentage("吸血", 0.35), rating("命中")],
    頭盔: [rating("命中"), flat("防禦", 0.65), percentFlat("防禦%", 0.45), flat("生命", 0.35), percentFlat("生命%", 0.45), percentage("經驗", 0.55), percentage("傷害減免", 0.35), rating("閃避")],
    胸甲: [flat("防禦"), percentFlat("防禦%"), flat("生命", 0.65), percentFlat("生命%"), percentage("傷害減免", 0.5), percentage("首領減傷", 0.45), rating("閃避"), flat("攻擊", 0.12), percentFlat("攻擊%", 0.3), rating("命中")],
    手套: [speed(), flat("攻擊", 0.55), percentFlat("攻擊%"), percentage("暴擊", 0.5), percentage("暴擊傷害", 0.5), percentage("技能傷害", 0.5), rating("命中"), percentage("吸血", 0.25)],
    鞋子: [rating("閃避"), speed(), percentage("資源掉落率", 0.45), flat("防禦", 0.45), percentFlat("防禦%", 0.45), percentage("金幣", 0.6), flat("生命", 0.25), percentFlat("生命%", 0.45), percentage("傷害減免", 0.25)],
    項鍊: [percentage("經驗", 0.6), percentageFixed("元寶掉率"), percentage("技能傷害", 0.5), flat("攻擊", 0.45), percentFlat("攻擊%"), flat("生命", 0.35), percentFlat("生命%"), rating("命中"), percentage("暴擊", 0.45), percentage("暴擊傷害", 0.45), percentage("資源掉落率", 0.4), percentage("吸血", 0.3)],
    戒指: [percentage("暴擊", 0.55), percentage("暴擊傷害", 0.55), flat("攻擊", 0.55), percentFlat("攻擊%"), percentage("吸血", 0.4), percentage("首領傷害", 0.6), speed(), rating("命中")],
    腰帶: [flat("生命"), percentFlat("生命%"), flat("防禦", 0.5), percentFlat("防禦%"), percentage("資源掉落率", 0.45), percentage("傷害減免", 0.4), percentage("金幣", 0.6), rating("閃避"), flat("攻擊", 0.1), percentFlat("攻擊%", 0.1)],
    護腕: [rating("命中"), flat("攻擊", 0.45), percentFlat("攻擊%"), flat("防禦", 0.5), percentFlat("防禦%"), percentage("首領傷害", 0.5), percentage("暴擊", 0.4), percentage("暴擊傷害", 0.4), speed()],
    披風: [percentage("傷害減免", 0.45), percentageFixed("元寶掉率"), percentage("首領減傷", 0.45), flat("生命", 0.6), percentFlat("生命%"), percentage("資源掉落率", 0.45), rating("閃避"), percentage("經驗", 0.5), flat("防禦", 0.35), percentFlat("防禦%"), percentage("金幣", 0.5)],
  };
  const slotPool = pools[item.slot] ?? pools.武器;
  const universalPool = Array.from(
    new Map(Object.values(pools).flat().map((option) => [option.name, option])).values(),
  ).filter((option) => option.name !== "元寶掉率" || item.slot === "項鍊" || item.slot === "披風");
  // 部位核心詞綴仍優先；其餘詞綴從完整允許池隨機抽取，且允許同件重複。
  const core = slotPool[0];
  return core ? [core, ...universalPool.filter((option) => option.name !== core.name)] : universalPool;
}

function rollAffix(roll: AffixRoll) {
  const value =
    roll.minimum + Math.floor(Math.random() * (roll.maximum - roll.minimum + 1));
  const labels: Partial<Record<EquipmentStatName, string>> = {
    生命: "生命力",
    "生命%": "生命力",
    攻擊: "攻擊力",
    "攻擊%": "攻擊力",
    防禦: "防禦力",
    "防禦%": "防禦力",
    攻速: "攻擊速度",
  };
  return `${labels[roll.name] ?? roll.name} +${value}${roll.percent && roll.name !== "命中" && roll.name !== "閃避" ? "%" : ""}`;
}

export function affixName(affix: string) {
  const [rawName] = affix.split(" ");
  if (rawName === "生命力") return affix.includes("%") ? "生命%" : "生命";
  if (rawName === "生命%") return "生命%";
  if (rawName === "攻擊力") return affix.includes("%") ? "攻擊%" : "攻擊";
  if (rawName === "攻擊%") return "攻擊%";
  if (rawName === "防禦力") return affix.includes("%") ? "防禦%" : "防禦";
  if (rawName === "防禦%") return "防禦%";
  if (rawName === "攻擊速度" || rawName === "攻速") return "攻速";
  return rawName as EquipmentStatName;
}


export function affixRange(item: Item, affix: string) {
  return affixOptions(item).find((roll) => roll.name === affixName(affix));
}


export function rollAffixes(item: Item) {
  const rank = Math.max(0, qualityOrder.indexOf(item.quality));
  const affixCount = MAX_AFFIXES_BY_QUALITY[Math.min(rank, MAX_AFFIXES_BY_QUALITY.length - 1)] ?? 0;
  if (affixCount <= 0) return [];
  const options = affixOptions(item);
  const [core] = options;
  // 洗鍊詞綴允許重複；保留第一條部位核心詞綴，其餘詞綴從完整池中獨立抽取。
  return [core, ...Array.from({ length: Math.max(0, affixCount - 1) }, () =>
    options[Math.floor(Math.random() * options.length)],
  )].map(rollAffix);
}

export function rerollSingleAffix(item: Item, affix: string, index: number) {
  const options = affixOptions(item);
  const [core] = options;
  if (index === 0) return rollAffix(core);
  // 定向洗鍊同樣允許洗出目前已存在的詞綴，符合重複詞綴玩法。
  const pool = options;
  return rollAffix(pool[Math.floor(Math.random() * pool.length)]);
}


export function canonicalAffixes(item: Item) {
  const count = MAX_AFFIXES_BY_QUALITY[Math.max(0, qualityOrder.indexOf(item.quality))] ?? 0;
  const options = affixOptions(item);
  // Existing legitimate rolls survive curve changes, including untouched lines in targeted reforges.
  // New rolls still use only the current pool. No save schema or automatic reroll is needed.
  const historical = isSceneEquipment(item) ? affixOptions(item, true) : options;
  const previousFlat = isSceneEquipment(item) ? affixOptions(item, false, true) : options;
  return item.affixes.map(affix => affix.replace(/^(?:菁英傷害|精英傷害)(?= )/, "首領傷害"))
    .flatMap(affix => {
      const name = affixName(affix);
      const range = options.find(option => option.name === name);
      if (!range) return [];
      const previous = historical.find(option => option.name === name) ?? range;
      const beforeBuff = previousFlat.find(option => option.name === name) ?? range;
      const minimum = Math.min(range.minimum, previous.minimum, beforeBuff.minimum);
      const maximum = Math.max(range.maximum, previous.maximum, beforeBuff.maximum,
        item.worldBossRewardId && item.worldBossRewardRank===1 && name==='暴擊傷害'?30:0);
      const value = Math.max(minimum, Math.min(maximum,
        Number(affix.match(/\d+(?:\.\d+)?/)?.[0] ?? minimum)));
      return [`${range.name} +${value}${range.percent ? "%" : ""}`];
    }).slice(0, count);
}
