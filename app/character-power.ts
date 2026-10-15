import { balanceConfig } from "./balance-config";
import { items as initialItems, type GameClass } from "./game-data";
import { equipmentBaseStats, affixName, canonicalAffixes } from "./equipment-affixes";
import { amplifyEquipmentStat, equippedEpithetBonuses, normalizeItemEpithets } from "./equipment-epithets";
import { getSocketStatBonus, normalizeEquipmentSockets, type EquipmentSockets } from "./gem-system";
import { catalogBonus, findEquipmentDefinition } from "./mythic-data";
import { equippedSetGroups, equippedSetAttackMultiplier as setAttackMultiplier } from "./set-bonuses";
import { rangerPassiveStats } from "./skill-ranger-passives";
import { warriorPassiveDefenses } from "./skill-warrior-passives";
import type { SkillBuild } from "./skill-rework";
import type { SkillAscensionState } from "./skill-ascensions";
import { equippedCosmeticBonuses } from "./cosmetic-bonuses";
import { assessCombatPower, estimateSkillContribution } from "./combat-power-assessment";
import { estimateEquipmentSkillContribution } from "./equipment-power-estimate";

type Item = (typeof initialItems)[number] & {
 mapId?: number; equipmentType?: "場景普通裝備" | "特殊傳奇" | "神話裝備";
 mythicId?: string; legendaryId?: string; artKey?: string; affixSchemaVersion?: number;
 reforgeCount?: number; locked?: boolean; sockets?: EquipmentSockets; prefixId?: string; suffixId?: string;
};
export type AssessmentItem = Item;
type Skill = { name: string; level: number };
export type RebirthTalents = Record<"combatCritRate" | "combatCritDamage" | "combatDamageReduction" | "combatAttackSpeed" | "combatBoss" | "survivalHp" | "survivalDefense" | "growthSkill", number>;
export const emptyAssessmentTalents: RebirthTalents = { combatCritRate: 0, combatCritDamage: 0, combatDamageReduction: 0, combatAttackSpeed: 0, combatBoss: 0, survivalHp: 0, survivalDefense: 0, growthSkill: 0 };
function equippedSetPieceCount(gear: Item[]) { return equippedSetGroups(gear).reduce((max, group) => Math.max(max, group.count), 0); }
function equippedSetAttackMultiplier(gear: Item[]) { return setAttackMultiplier(gear, 0.1); }

function calculateSkillEffects(skills: Skill[]) {
  const result = {
    hpFlat: 0,
    attackPct: 0,
    defensePct: 0,
    speed: 0,
    hit: 0,
    dodge: 0,
    crit: 0,
    lifesteal: 0,
  };
  for (const skill of skills) {
    if (skill.level <= 0) continue;
    if (skill.name === "鋼鐵壁壘") {
      result.defensePct += 3 + skill.level * 2.5;
      result.hpFlat += 30 + skill.level * 25;
    }
    if (skill.name === "獵手本能") {
      result.crit += 2 + skill.level;
      result.dodge += 2 + skill.level;
    }
    if (skill.name === "魔力護盾") result.defensePct += 10 + skill.level * 3;
    if (skill.name === "穿雲箭") result.hit += skill.level * 2;
    if (skill.name === "疾風連射") result.speed += skill.level * 3;
  }
  return result;
}

export function calculateCharacterStats(
  playerClass: GameClass,
  level: number,
  gear: Item[],
  skills: Skill[],
) {
  const base = balanceConfig.character.baseStats[playerClass];
  const levelGrowth = balanceConfig.character.levelGrowth[playerClass];
  const result = {
    ...base,
    speed: Number(base.speed),
    hp: base.hp + (level - 1) * levelGrowth.hp,
    attack: base.attack + (level - 1) * levelGrowth.attack,
    defense: base.defense + (level - 1) * levelGrowth.defense,
    expBonus: 0,
    goldBonus: 0,
    bossDamage: 0,
    damageReduction: 0,
    skillDamage: 0,
    comboChance: 0,
    bossReduction: 0,
    eliteDamage: 0,
    lowHealthDamage: 0,
    lowHealthReduction: 0,
    resourceDrop: 0,
    equipmentDrop: 0,
    enhanceDrop: 0,
    reforgeDrop: 0,
    highQualityDrop: 0,
    yuanbaoDrop: 0,
    // 暴擊傷害是暴擊時的總加成；基礎 +50% 代表暴擊倍率 ×1.5。
    critDamage: 50,
    hpPct: 0,
    attackPct: 0,
    defensePct: 0,
  };
  for (const item of gear) {
    for (const stat of equipmentBaseStats(item)) {
      if (stat.name === "生命") result.hp += stat.value;
      if (stat.name === "生命%") result.hpPct += stat.value;
      if (stat.name === "攻擊") result.attack += stat.value;
      if (stat.name === "攻擊%") result.attackPct += stat.value;
      if (stat.name === "防禦") result.defense += stat.value;
      if (stat.name === "防禦%") result.defensePct += stat.value;
      if (stat.name === "攻速") result.speed += stat.value;
      if (stat.name === "命中") result.hit += stat.value;
      if (stat.name === "閃避") result.dodge += stat.value;
      if (stat.name === "暴擊") result.crit += stat.value;
      if (stat.name === "暴擊傷害") result.critDamage += stat.value;
      if (stat.name === "吸血") result.lifesteal += stat.value;
      if (stat.name === "經驗") result.expBonus += stat.value;
      if (stat.name === "金幣") result.goldBonus += stat.value;
      if (stat.name === "首領傷害") result.bossDamage += stat.value;
      if (stat.name === "傷害減免") result.damageReduction += stat.value;
      if (stat.name === "技能傷害") result.skillDamage += stat.value;
      if (stat.name === "首領減傷") result.bossReduction += stat.value;
      if (stat.name === "資源掉落率") result.resourceDrop += stat.value;
      if (stat.name === "元寶掉率") result.yuanbaoDrop += stat.value;
    }
    for (const [index, affix] of item.affixes.entries()) {
      const rawValue = Number(affix.match(/\d+/)?.[0] ?? 0);
      const name = affixName(affix);
      const value = index === 0 ? amplifyEquipmentStat(item, name, rawValue, "core") : rawValue;
      if (name === "生命") result.hp += value;
      if (name === "生命%") result.hpPct += value;
      if (name === "攻擊") result.attack += value;
      if (name === "攻擊%") result.attackPct += value;
      if (name === "防禦") result.defense += value;
      if (name === "防禦%") result.defensePct += value;
      if (name === "攻速") result.speed += value;
      if (affix.startsWith("命中")) result.hit += value;
      if (affix.startsWith("閃避")) result.dodge += value;
      if (name === "暴擊傷害") result.critDamage += value;
      else if (name === "暴擊") result.crit += value;
      if (affix.startsWith("吸血")) result.lifesteal += value;
      if (affix.startsWith("經驗")) result.expBonus += value;
      if (affix.startsWith("金幣")) result.goldBonus += value;
      if (affix.startsWith("首領傷害")) result.bossDamage += value;
      if (affix.startsWith("傷害減免")) result.damageReduction += value;
      if (affix.startsWith("技能傷害")) result.skillDamage += value;
      if (affix.startsWith("首領減傷")) result.bossReduction += value;
      if (affix.startsWith("資源掉落率")) result.resourceDrop += value;
      if (affix.startsWith("元寶掉率")) result.yuanbaoDrop += value;
    }
    for (const [name, value] of Object.entries(getSocketStatBonus(item.sockets ?? { socketCount: 0, gems: [] }))) {
      if (name === "生命") result.hp += value;
      if (name === "生命%") result.hpPct += value;
      if (name === "攻擊") result.attack += value;
      if (name === "攻擊%") result.attackPct += value;
      if (name === "防禦") result.defense += value;
      if (name === "防禦%") result.defensePct += value;
      if (name === "攻速") result.speed += value;
      if (name === "命中") result.hit += value;
      if (name === "閃避") result.dodge += value;
      if (name === "暴擊") result.crit += value;
      if (name === "吸血") result.lifesteal += value;
      if (name === "經驗") result.expBonus += value;
      if (name === "金幣") result.goldBonus += value;
    }
  }
  const skill = calculateSkillEffects(skills);
  result.hp += skill.hpFlat;
  result.attack = Math.round(result.attack * (1 + skill.attackPct / 100));
  result.defense = Math.round(result.defense * (1 + skill.defensePct / 100));
  result.speed += skill.speed;
  result.hit += skill.hit;
  result.dodge += skill.dodge;
  result.crit += skill.crit;
  result.lifesteal += skill.lifesteal;
  const catalog = catalogBonus(gear);
  const epithetBonus = equippedEpithetBonuses(gear);
  for (const [key, value] of Object.entries(epithetBonus)) {
    if (key in result) (result as Record<string, number>)[key] += value;
  }
  result.hpPct += catalog.hpPct ?? 0;
  result.attackPct += catalog.attackPct ?? 0;
  result.defensePct += catalog.defensePct ?? 0;
  result.speed += catalog.speed ?? 0;
  result.speed = Math.round(result.speed * (1 + (catalog.speedPct ?? 0) / 100)) as typeof result.speed;
  result.hit += catalog.hit ?? 0;
  result.dodge += catalog.dodge ?? 0;
  result.crit += catalog.crit ?? 0;
  result.lifesteal += catalog.lifesteal ?? 0;
  result.expBonus += catalog.expBonus ?? 0;
  result.goldBonus += catalog.goldBonus ?? 0;
  result.bossDamage += catalog.bossDamage ?? 0;
  result.damageReduction += catalog.damageReduction ?? 0;
  result.skillDamage += catalog.skillDamage ?? 0;
  result.resourceDrop += catalog.resourceDrop ?? 0;
  result.equipmentDrop += catalog.equipmentDrop ?? 0;
  result.hp = Math.round(result.hp * (1 + result.hpPct / 100));
  result.attack = Math.round(result.attack * (1 + result.attackPct / 100));
  result.defense = Math.round(result.defense * (1 + result.defensePct / 100));
  return result;
}


export function calculateAssessedCombatPower(
  playerClass: GameClass, level: number, gear: Item[], skills: Skill[],
  build: SkillBuild, ascensions: SkillAscensionState,
  permanent: { hp: number; attack: number; defense: number },
  combatBonuses: { attack: number; defense: number }, talents: RebirthTalents,
  attackSpeedBonus: number, cosmetics: ReturnType<typeof equippedCosmeticBonuses>,
) {
  const base = calculateCharacterStats(playerClass, level, gear, skills);
  const ranger = playerClass === "遊俠" ? rangerPassiveStats(build) : null;
  const stats = {
    ...base,
    hp: Math.round(base.hp * (1 + permanent.hp / 100)),
    attack: Math.round(base.attack * (1 + (permanent.attack + combatBonuses.attack) / 100)
      * equippedSetAttackMultiplier(gear)),
    defense: Math.round((base.defense + (playerClass === "戰士"
      ? warriorPassiveDefenses(build, 100).defenseBonusFlat : 0))
      * (1 + (permanent.defense + combatBonuses.defense) / 100)),
    speed: (base.speed + talents.combatAttackSpeed * 5)
      * (1 + ((ranger?.attackSpeedBonusPercent ?? 0) + attackSpeedBonus) / 100),
    hit: Math.round(base.hit * (1 + cosmetics.hit / 100)),
    dodge: Math.round(base.dodge * (1 + cosmetics.dodge / 100)),
    crit: base.crit + talents.combatCritRate * 4 + (ranger?.criticalChancePoints ?? 0),
    critDamage: base.critDamage + talents.combatCritDamage * 10,
    bossDamage: base.bossDamage + talents.combatBoss * 5,
    damageReduction: base.damageReduction + talents.combatDamageReduction * 3,
    skillDamage: base.skillDamage + talents.growthSkill * 5,
  };
  const skill = estimateSkillContribution(playerClass, level, build, ascensions);
  return assessCombatPower(stats, level,
    estimateEquipmentSkillContribution(playerClass, level, build, ascensions, gear, stats, skill),
    equippedSetPieceCount(gear));
}


export function normalizeSceneItem(item: Item): Item {
  const definition = findEquipmentDefinition(item);
  const catalogFields = definition
    ? {
        name: definition.name,
        slot: definition.slot,
        quality: definition.kind === "special-legendary" ? "傳奇" : "神話",
        equipmentType:
          definition.kind === "special-legendary"
            ? "特殊傳奇" as const
            : "神話裝備" as const,
        ...(definition.kind === "special-legendary"
          ? { legendaryId: definition.id }
          : { mythicId: definition.id }),
        artKey: definition.artKey,
        set: "",
      }
    : {};
  const normalized = {
    ...item,
    ...catalogFields,
    equipmentType: definition
      ? definition.kind === "special-legendary"
        ? "特殊傳奇" as const
        : "神話裝備" as const
      : item.quality === "神話" || item.equipmentType === "神話裝備"
        ? "神話裝備" as const
        : item.equipmentType === "特殊傳奇"
          ? "特殊傳奇" as const
          : "場景普通裝備" as const,
    affixSchemaVersion: 7,
    reforgeCount: Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(Number(item.reforgeCount ?? 0) || 0))),
  };
  const cleanAffixes = canonicalAffixes({ ...normalized, affixes: item.affixes ?? [] });
  // 洗鍊允許同一種詞綴重複出現；正規化只能清理非法／超出區間的數值，
  // 不可依詞綴名稱去重，否則重新登入或下一次存檔會吃掉合法的重複詞綴。
  return normalizeItemEpithets({
    ...normalized,
    affixes: cleanAffixes,
    sockets: normalizeEquipmentSockets(item.sockets),
  });
}

