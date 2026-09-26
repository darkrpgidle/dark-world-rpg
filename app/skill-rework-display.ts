import { MAGE_ACTIVE_RULES, MAGE_PASSIVE_RULES } from "./skill-mage-rules";
import { RANGER_ACTIVE_RULES, RANGER_PASSIVE_RULES } from "./skill-ranger-rules";
import { WARRIOR_ACTIVE_RULES, WARRIOR_PASSIVE_RULES } from "./skill-warrior-rules";
import type { SkillClass } from "./skill-rework";

// Read the same rank arrays as the isolated combat rules; never copy Lv1–5 values into the UI.
const rules = {
  戰士: { ...WARRIOR_ACTIVE_RULES, ...WARRIOR_PASSIVE_RULES },
  遊俠: { ...RANGER_ACTIVE_RULES, ...RANGER_PASSIVE_RULES },
  法師: { ...MAGE_ACTIVE_RULES, ...MAGE_PASSIVE_RULES },
};

const labels: Record<string, string> = {
  damage: "技能傷害倍率", armorBreak: "破防率", bleedChance: "流血率",
  blockChance: "格擋率", counterChance: "反擊率", durationSeconds: "持續秒數",
  bleedChanceBonus: "額外流血率", damageBonus: "傷害加成", lifesteal: "吸血",
  attackSpeedBonus: "攻速加成", defensePenalty: "防禦降低", attacks: "持續攻擊次數",
  enemyAttacksRequired: "受擊觸發次數", healthBelow: "生命門檻（低於 %）",
  ignoreDefense: "忽略防禦", chargeReductionChance: "暴擊縮短充能機率",
  dodgeBonus: "閃避加成", nextCritChance: "閃避後下一擊暴擊加成",
  criticalChanceBonus: "暴擊加成", arrows: "箭數", damagePerArrow: "每箭傷害倍率",
  successfulPrimaryHitsRequired: "所需主要命中次數", actions: "持續攻擊次數",
  normalDamagePenalty: "普攻傷害降低", criticalDamageBonus: "技能暴傷加成",
  rainArrows: "箭雨箭數", mainArrows: "主箭數", totalDamage: "總傷害倍率",
  burnChance: "灼燒率", missiles: "飛彈數", damagePerMissile: "每發傷害倍率",
  maxHealthShieldPercent: "最大生命護盾比例", statusChancePoints: "異常率加成",
  successfulActiveCastsRequired: "所需成功主動施放", followingSuccessfulActiveCasts: "後續成功施放次數",
  skillEfficiencyBonus: "技能效率加成（運算待定）", exhaustionPenalty: "枯竭技能傷害懲罰",
  damageBonusVsStatus: "異常目標增傷", maxHealthBonus: "最大生命加成",
  basicBleedChance: "普攻流血率", damageVsArmorBreak: "破防目標直接傷害加成",
  nextAttackExtraDamage: "下一擊追加傷害倍率", lifestealVsBleed: "流血目標直接傷害吸血",
  basicAndBurstDamage: "基礎與爆發技能傷害加成",
  damageReductionBelow40Hp: "低生命減傷", damagePerStack: "每層增傷",
  blockChancePoints: "格擋加成", nextCounterDamage: "下一反擊增傷",
  burstDamageVsArmorBreak: "破防目標爆發增傷", directDamageBelow40Hp: "低生命直接傷害加成",
  criticalChancePoints: "暴擊加成", nextNormalDamageBonus: "下一普攻增傷",
  dodgeChancePoints: "閃避加成", nextPrimaryCriticalChancePoints: "下一主要攻擊暴擊加成",
  directDamageVsMarked: "標記目標直接傷害加成",
  multihitSkillSegmentDamageBonus: "多段技能每段增傷", speedPerStack: "每層攻速加成",
  nextSkillDamageVsMarkedNormalCrit: "標記目標普攻暴擊後下一技能增傷",
  nextHitExtraDamage: "下一擊追加傷害倍率", extraCriticalDirectDamage: "額外暴擊直接傷害",
  nextBurstDamagePerStack: "每層下一爆發增傷", ultimateMainArrowExtraDamage: "終極主箭追加傷害倍率",
  activeDirectDamageBonus: "主動直接傷害加成", normalBurnChance: "普攻灼燒率",
  activeDirectDamageVsBurn: "灼燒目標主動直接傷害加成",
  activeDirectDamageWithShield: "有盾時主動直接傷害加成",
  activeStatusChancePoints: "主動異常率加成", extraDamage: "追加傷害倍率",
  ultimateEnergyPerSuccessfulCast: "每次成功施放終極能量",
  activeDirectDamagePerStatus: "每種異常主動直接傷害加成",
  initialShieldBonus: "初始護盾加成", exhaustionReductionPoints: "枯竭懲罰減輕",
  ultimateFinalExplosionExtraDamage: "終極尾爆追加傷害倍率",
  procChance: "追加傷害觸發率",
  maxStacks: "最多層數", missesToClear: "未命中清除次數",
  followingPrimaryActions: "後續主要攻擊次數", maxDistinctStatuses: "最多異常種類",
  maxProcsPerCast: "每次施放最多觸發", maxProcsPerUltimate: "每次終極最多觸發",
};

const units: Record<string, string> = {
  durationSeconds: "秒", attacks: "次", actions: "次", enemyAttacksRequired: "次",
  successfulPrimaryHitsRequired: "次", successfulActiveCastsRequired: "次",
  followingSuccessfulActiveCasts: "次", arrows: "箭", rainArrows: "箭", mainArrows: "箭",
  missiles: "發", ultimateEnergyPerSuccessfulCast: "點",
  maxStacks: "層", missesToClear: "次", followingPrimaryActions: "次",
  maxDistinctStatuses: "種", maxProcsPerCast: "次", maxProcsPerUltimate: "次",
};

const ascensionEffects: Record<SkillClass, Record<string, string>> = {
  戰士: {
    裂地斬: "命中破防目標後，下一次主要攻擊追加 60% 震地傷害。",
    血刃斬: "流血上限 +1；流血目標的流血率 +15%，流血傷害 +20%。",
    不屈戰意: "啟動獲一次必定格擋；格擋後下一次反擊 +20%，最多三層。",
    血戰烙印: "烙印期間首次成功流血，引發 100% 攻擊傷害血爆。",
    鮮血怒吼: "啟動清除一個負面；第五擊追加 180% 攻擊傷害。",
    狂戰姿態: "姿態內造成流血或破防時延長一次攻擊，最多延長三次。",
    碎甲猛擊: "已破防目標再次破防時轉為額外傷害，最高 +60% 技能倍率；換算待定。",
    泰坦斷界斬: "後續三次主要攻擊各追加 70% 攻擊傷害。",
  },
  遊俠: {
    穿雲箭: "下一個主動技能額外忽略 15% 防禦。",
    追風箭: "暴擊追加一箭，造成 60% 攻擊傷害，不能再觸發自身。",
    幻影步: "啟動獲一次必定閃避；閃避後下一主動技能暴傷 +35%。",
    獵殺標記: "標記下三次暴擊後，下一主動技能追加 120% 爆破傷害。",
    疾風連射: "五箭全中後追加第六箭，造成 90% 攻擊傷害。",
    風行領域: "領域內暴擊獲一層疾風，每層攻速 +3%，最多五層。",
    破星狙擊: "暴擊時所有攻擊次數型技能回復兩次攻擊充能。",
    蒼穹箭雨: "箭雨暴擊獲印記，最多八層；主箭每層 +6%，最高 +48%。",
  },
  法師: {
    霜火新星: "命中已灼燒目標追加 70% 餘爆，不刷新灼燒。",
    奧術飛彈: "三發全中追加 80% 共鳴彈。",
    魔力護盾: "生成後三次主動技能傷害 +10%；破盾時獲 15 點終極能量。",
    元素蝕印: "首次附加異常後，接下來三次主動技能異常率 +15 個百分點。",
    隕星術: "命中已灼燒目標追加 120% 餘燼爆炸，不消耗灼燒。",
    奧術超載: "六層穩定度時，枯竭懲罰從 15% 降至 5%；穩定度來源待定。",
    虛空崩解: "每種不同異常再 +18% 技能倍率，最多三種、+54%。",
    星界寂滅: "前段命中累積最多六層坍縮，尾爆每層 +8%、最多 +48%；前段倍率待定。",
  },
};

export function skillDisplay(characterClass: SkillClass, name: string) {
  const values = (rules[characterClass] as Record<string, Record<string, unknown>>)[name];
  if (!values) return null;
  const ranks = Object.entries(values).filter(([key, value]) => key !== "category" && key !== "ascension" && Array.isArray(value) && value.length === 5)
    .map(([key, value]) => ({ label: labels[key] ?? key, values: (value as number[]).map((n) => `${n}${units[key] ?? "%"}`) }));
  const fixed = Object.entries(values).filter(([key, value]) => typeof value === "number" && key in labels)
    .map(([key, value]) => `${labels[key]}：${value}${units[key] ?? "%"}`);
  return { ranks, fixed, ascensionName: typeof values.ascension === "string" ? values.ascension : null,
    ascensionEffect: ascensionEffects[characterClass][name] ?? null };
}
