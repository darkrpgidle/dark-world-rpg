export type EpithetItem = {
  quality: string;
  slot: string;
  affixes: string[];
  prefixId?: string;
  suffixId?: string;
};

type BonusKey = "hpPct" | "attackPct" | "defensePct" | "speed" | "hit" | "crit" | "critDamage" | "lifesteal" | "skillDamage" | "expBonus" | "goldBonus" | "equipmentDrop";
type Epithet = {
  id: string;
  name: string;
  description: string;
  baseStat?: string;
  coreAffix?: string;
  increase?: number;
  bonus?: Partial<Record<BonusKey, number>>;
};

export const EQUIPMENT_PREFIXES: readonly Epithet[] = [
  { id: "breaker", name: "破軍", description: "此裝備的基礎攻擊 +18%", baseStat: "攻擊", increase: 18 },
  { id: "giant", name: "巨靈", description: "此裝備的基礎生命 +18%", baseStat: "生命", increase: 18 },
  { id: "iron", name: "玄甲", description: "此裝備的基礎防禦 +18%", baseStat: "防禦", increase: 18 },
  { id: "hunt", name: "狂獵", description: "攻擊 +3%", bonus: { attackPct: 3 } },
  { id: "unyielding", name: "不屈", description: "最大生命 +4%", bonus: { hpPct: 4 } },
  { id: "oath", name: "鐵誓", description: "防禦 +4%", bonus: { defensePct: 4 } },
  { id: "lightning", name: "迅雷", description: "攻速 +3", bonus: { speed: 3 } },
  { id: "judgment", name: "斷罪", description: "暴擊率 +2 個百分點", bonus: { crit: 2 } },
  { id: "sight", name: "靈視", description: "命中 +3 個百分點", bonus: { hit: 3 } },
  { id: "ritual", name: "秘儀", description: "技能傷害 +4%", bonus: { skillDamage: 4 } },
];

export const EQUIPMENT_SUFFIXES: readonly Epithet[] = [
  { id: "soul", name: "獵魂", description: "暴擊傷害 +8%", bonus: { critDamage: 8 } },
  { id: "drain", name: "汲命", description: "吸血 +1 個百分點，攻擊時即可恢復生命", bonus: { lifesteal: 1 } },
  { id: "treasure", name: "尋寶", description: "裝備掉落率 +2%", bonus: { equipmentDrop: 2 } },
  { id: "gold", name: "聚金", description: "金幣收益 +5%", bonus: { goldBonus: 5 } },
  { id: "wisdom", name: "博識", description: "經驗收益 +5%", bonus: { expBonus: 5 } },
  { id: "wind", name: "疾風", description: "此裝備第一條攻速詞綴數值 +20%", coreAffix: "攻速", increase: 20 },
  { id: "keen", name: "銳目", description: "此裝備第一條暴擊詞綴數值 +20%", coreAffix: "暴擊", increase: 20 },
  { id: "eagle", name: "鷹眼", description: "此裝備第一條命中詞綴數值 +20%", coreAffix: "命中", increase: 20 },
  { id: "shadow", name: "追影", description: "此裝備第一條閃避詞綴數值 +20%", coreAffix: "閃避", increase: 20 },
  { id: "chase", name: "追擊", description: "對每隻敵人的首次攻擊傷害 +10%" },
  { id: "charge", name: "蓄勢", description: "每場戰鬥前 3 次攻擊的暴擊傷害 +8%" },
];

const byPrefix = new Map(EQUIPMENT_PREFIXES.map((effect) => [effect.id, effect]));
const bySuffix = new Map(EQUIPMENT_SUFFIXES.map((effect) => [effect.id, effect]));
const baseStatsBySlot: Record<string, readonly string[]> = {
  武器: ["攻擊"], 頭盔: ["防禦"], 胸甲: ["防禦", "生命"], 手套: ["攻擊"],
  鞋子: ["防禦"], 項鍊: ["生命"], 戒指: ["攻擊"], 腰帶: ["生命"],
  護腕: ["防禦"], 披風: ["生命"],
};
const rollChance: Record<string, readonly [number, number]> = {
  史詩: [0.18, 0.12], 傳奇: [0.30, 0.25], 神話: [0.40, 0.35],
};

function isEligible(effect: Epithet, item: EpithetItem) {
  if (effect.baseStat && !baseStatsBySlot[item.slot]?.includes(effect.baseStat)) return false;
  if (effect.coreAffix && !item.affixes[0]?.startsWith(`${effect.coreAffix} +`) &&
      !((effect.coreAffix === "攻速" && item.affixes[0]?.startsWith("攻擊速度 +")))) return false;
  return true;
}

export function getItemEpithets(item: EpithetItem) {
  if (!rollChance[item.quality]) return { prefix: undefined, suffix: undefined };
  const prefix = byPrefix.get(item.prefixId ?? "");
  const suffix = bySuffix.get(item.suffixId ?? "");
  return {
    prefix: prefix && isEligible(prefix, item) ? prefix : undefined,
    suffix: suffix && isEligible(suffix, item) ? suffix : undefined,
  };
}

export function rollItemEpithets(item: EpithetItem) {
  const chances = rollChance[item.quality];
  if (!chances) return {};
  const prefixes = EQUIPMENT_PREFIXES.filter((effect) => isEligible(effect, item));
  const suffixes = EQUIPMENT_SUFFIXES.filter((effect) => isEligible(effect, item));
  return {
    prefixId: Math.random() < chances[0] ? prefixes[Math.floor(Math.random() * prefixes.length)]?.id : undefined,
    suffixId: Math.random() < chances[1] ? suffixes[Math.floor(Math.random() * suffixes.length)]?.id : undefined,
  };
}

export function normalizeItemEpithets<T extends EpithetItem>(item: T): T {
  const { prefix, suffix } = getItemEpithets(item);
  return { ...item, prefixId: prefix?.id, suffixId: suffix?.id };
}

export function epithetDisplayName(item: EpithetItem) {
  const { prefix, suffix } = getItemEpithets(item);
  return [prefix?.name, suffix?.name].filter(Boolean).join("");
}

export function amplifyEquipmentStat(item: EpithetItem, statName: string, value: number, origin: "base" | "core") {
  const { prefix, suffix } = getItemEpithets(item);
  const increase = [prefix, suffix].reduce((total, effect) =>
    total + (origin === "base" && effect?.baseStat === statName ? effect.increase ?? 0 : 0) +
      (origin === "core" && effect?.coreAffix === statName ? effect.increase ?? 0 : 0), 0);
  return increase ? Math.round(value * (1 + increase / 100)) : value;
}

export function equippedEpithetBonuses(items: EpithetItem[]) {
  const seen = new Set<string>();
  const result: Partial<Record<BonusKey, number>> = {};
  for (const item of items) {
    const { prefix, suffix } = getItemEpithets(item);
    for (const effect of [prefix, suffix]) {
      if (!effect || seen.has(effect.id)) continue;
      seen.add(effect.id);
      for (const [key, value] of Object.entries(effect.bonus ?? {}) as [BonusKey, number][]) {
        result[key] = (result[key] ?? 0) + value;
      }
    }
  }
  return result;
}

export function hasEquippedEpithet(items: EpithetItem[], id: string) {
  return items.some((item) => [getItemEpithets(item).prefix?.id, getItemEpithets(item).suffix?.id].includes(id));
}
