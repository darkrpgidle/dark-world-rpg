import { balanceConfig } from "./balance-config";
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

// Short descriptions explain the base skill; ranked values and ascensions stay below.
const activeDescriptions: Record<SkillClass, Record<string, string>> = {
  戰士: {
    裂地斬: "斬擊敵人並降低其防禦。",
    血刃斬: "斬擊敵人，有機率施加持續流血。",
    不屈戰意: "受擊後進入戰意，提高格擋與反擊機率。",
    血戰烙印: "施加血色烙印，提高敵人受到的傷害。",
    鮮血怒吼: "低血量時強化後續攻擊並獲得吸血。",
    狂戰姿態: "提高攻速與傷害，但會降低自身防禦。",
    碎甲猛擊: "重擊敵人，造成高額傷害並破防。",
    泰坦斷界斬: "以巨劍斬裂空間，造成極高傷害並破防。",
  },
  遊俠: {
    穿雲箭: "射出穿透箭，造成傷害並忽略部分防禦。",
    追風箭: "迅速射擊，暴擊時有機率縮短自身充能。",
    幻影步: "受擊或低血量時提高閃避，閃避後強化暴擊。",
    獵殺標記: "標記敵人，提高對該目標的暴擊機率。",
    疾風連射: "連續射出五箭，每箭各自判定命中。",
    風行領域: "命中蓄力後提高攻速，但降低普攻傷害。",
    破星狙擊: "發射重型狙擊箭，造成高傷害並提高暴傷。",
    蒼穹箭雨: "八支雨箭接續一支主箭，造成多段傷害。",
  },
  法師: {
    霜火新星: "引爆霜火能量，命中後有機率隨機施加灼燒或冰凍。",
    閃電鏈: "三道閃電依序擊中敵人，每發各自判定命中與麻痺。",
    魔力護盾: "低血量時生成護盾，吸收後續受到的傷害。",
    元素蝕印: "施加元素蝕印，提高異常機率與異常效果強度。",
    隕星術: "召喚隕星重擊敵人，命中後必定施加灼燒。",
    奧術超載: "三次主動命中後強化接下來三次主動命中的傷害與異常，結束後枯竭五秒。",
    虛空崩解: "引爆虛空，對已有異常狀態的敵人增加傷害。",
    星界寂滅: "六道光束連擊後引爆星界，造成高額尾爆傷害。",
  },
};

const labels: Record<string, string> = {
  damage: "技能傷害倍率", armorBreak: "破防率", armorBreakDurationSeconds: "破防持續秒數",
  bleedChance: "流血率", bleedDurationSeconds: "流血持續秒數",
  blockChance: "格擋率", counterChance: "反擊率", durationSeconds: "持續秒數",
  weaknessDamageBonus: "弱點增傷", damageBonus: "傷害加成", lifesteal: "吸血",
  attackSpeedBonus: "攻速加成", defensePenalty: "防禦降低", attacks: "持續攻擊次數",
  enemyAttacksRequired: "受擊觸發次數", healthBelow: "生命門檻（低於 %）",
  ignoreDefense: "忽略防禦", chargeReductionChance: "暴擊縮短充能機率",
  recoveredOwnCharge: "觸發時自身回復充能", affectedEnemyAttacks: "生效的敵方攻擊次數",
  dodgeBonus: "閃避加成", nextCritChance: "閃避後下一擊暴擊加成",
  criticalChanceBonus: "暴擊加成", arrows: "箭數", damagePerArrow: "每箭傷害倍率",
  successfulPrimaryHitsRequired: "所需主要命中次數", actions: "持續攻擊次數",
  normalDamagePenalty: "普攻傷害降低", criticalDamageBonus: "技能暴傷加成",
  rainArrows: "箭雨箭數", mainArrows: "主箭數", rainArrowDamage: "每支雨箭傷害倍率", totalDamage: "總傷害倍率",
  burnChance: "異常觸發率", paralysisChance: "每發麻痺率", missiles: "閃電數", damagePerMissile: "每發傷害倍率",
  maxHealthShieldPercent: "最大生命護盾比例", statusChancePoints: "異常率加成",
  successfulActiveCastsRequired: "所需成功主動施放", followingSuccessfulActiveCasts: "後續成功施放次數",
  skillEfficiencyBonus: "技能傷害與異常效果加成", statusEffectBonus: "異常效果加成", exhaustionPenalty: "枯竭技能傷害懲罰",
  damageBonusVsStatus: "異常目標增傷", defenseBonus: "防禦力加成（固定數值）",
  extraBleedChance: "額外流血率", damageVsArmorBreak: "破防目標直接傷害加成",
  nextAttackExtraDamage: "下一擊追加傷害倍率", lifestealVsBleed: "流血目標直接傷害吸血",
  basicAndBurstDamage: "基礎與爆發技能傷害加成", bleedDamageBonus: "流血傷害加成",
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
  activeStatusChanceBonus: "主動異常機率加成（乘算）", incomingShieldChancePercent: "受擊獲盾機率",
  incomingShieldMaxHealthPercent: "獲得護盾（最大生命比例）", extraDamage: "追加傷害倍率",
  ultimateEnergyPerSuccessfulCast: "每次成功施放終極能量",
  activeDirectDamagePerStatus: "每種異常主動直接傷害加成",
  initialShieldBonus: "所有生成護盾量加成", exhaustionReductionPercent: "枯竭懲罰減輕（乘算）",
  ultimateFinalExplosionExtraDamage: "終極尾爆追加傷害倍率",
  procChance: "追加傷害觸發率",
  maxStacks: "最多層數", missesToClear: "未命中清除次數",
  followingPrimaryActions: "後續主要攻擊次數", maxDistinctStatuses: "最多異常種類",
  repeatedArmorBreakFactor: "重複破防換傷倍率", repeatedArmorBreakBonusCap: "換傷技能倍率上限",
  maxProcsPerCast: "每次施放最多觸發", maxProcsPerUltimate: "每次終極最多觸發",
};

const units: Record<string, string> = {
  defenseBonus: "",
  durationSeconds: "秒", armorBreakDurationSeconds: "秒", bleedDurationSeconds: "秒",
  attacks: "次", actions: "次", enemyAttacksRequired: "次",
  successfulPrimaryHitsRequired: "次", successfulActiveCastsRequired: "次",
  followingSuccessfulActiveCasts: "次", arrows: "箭", rainArrows: "箭", mainArrows: "箭",
  missiles: "發", ultimateEnergyPerSuccessfulCast: "點",
  maxStacks: "層", missesToClear: "次", followingPrimaryActions: "次",
  maxDistinctStatuses: "種", maxProcsPerCast: "次", maxProcsPerUltimate: "次",
  repeatedArmorBreakFactor: "倍",
  recoveredOwnCharge: "格", affectedEnemyAttacks: "次",
};

const ascensionEffects: Record<SkillClass, Record<string, string>> = {
  戰士: {
    裂地斬: "命中破防目標後，下一次主要攻擊追加 60% 震地傷害。",
    血刃斬: "流血上限提高至五層；每層持續五秒，流血傷害 ×1.2。",
    不屈戰意: "啟動獲一次必定格擋；格擋後下一次反擊 +20%，最多三層。",
    血戰烙印: "烙印期間使目標受到的傷害提高；首次成功流血時引發 100% 攻擊傷害血爆。",
    鮮血怒吼: "啟動清除一個負面；第五擊追加 180% 攻擊傷害。",
    狂戰姿態: "姿態內造成流血或破防時延長一次攻擊，最多延長三次。",
    碎甲猛擊: "命中已破防目標時，依本次破防率 ×2 增加技能基礎倍率，最高 +60%；破防維持較強值並刷新持續時間。",
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
    霜火新星: "命中已灼燒目標追加 70% 餘爆；施加冰凍時，在最後一次冰凍結束追加 70% 冰碎傷害，刷新不提前引爆。",
    閃電鏈: "三發全中追加一道 80% 共鳴雷擊。",
    魔力護盾: "生成後三次主動技能傷害 +10%；破盾時獲 15 點終極能量。",
    元素蝕印: "首次附加異常後，接下來三次主動技能異常率 +15 個百分點。",
    隕星術: "命中已灼燒目標追加 120% 餘燼爆炸，不消耗灼燒。",
    奧術超載: "超載期間每段主動命中獲一層穩定度，最多六層；六層時枯竭基礎懲罰降至 5%。",
    虛空崩解: "每種不同異常再 +18% 技能倍率，最多三種、+54%。",
    星界寂滅: "前段命中累積最多六層坍縮，尾爆每層 +8%、最多 +48%；六道光束占總倍率 40%，尾爆占 60%。",
  },
};

export function skillDisplay(characterClass: SkillClass, name: string) {
  const values = (rules[characterClass] as Record<string, Record<string, unknown>>)[name];
  if (!values) return null;
  const ranks = Object.entries(values).filter(([key, value]) => key !== "category" && key !== "ascension" && Array.isArray(value) && value.length === 5)
    .map(([key, value]) => ({ label: labels[key] ?? key, values: (value as number[]).map((n) => `${n}${units[key] ?? "%"}`) }));
  const fixed = Object.entries(values).filter(([key, value]) => typeof value === "number" && key in labels)
    .map(([key, value]) => `${labels[key]}：${value}${units[key] ?? "%"}`);
  const dot = balanceConfig.skillRework.dot;
  if (characterClass === "戰士" && (name === "血刃斬" || name === "裂傷本能" || name === "過度失血")) {
    fixed.push(`流血每層每秒：施加時攻擊力的 ${dot.bleedPerStackAttackPercent}%（持續 5 秒）`);
  }
  if (characterClass === "法師" && (name === "霜火新星" || name === "隕星術" || name === "焰脈")) {
    fixed.push(`灼燒每秒：施加時攻擊力的 ${dot.burnAttackPercent}%（持續 5 秒）`);
  }
  if (characterClass === "法師" && name === "魔力護盾") {
    fixed.push("每個敵人最多生成一次；普通換怪重置資格，低於 60% 生命時觸發，不直接補滿護盾");
  }
  if (characterClass === "法師" && name === "星界護體") {
    fixed.push("受擊後固定 5% 判定；護盾保護後續攻擊，可與現有護盾疊加，無總量上限");
  }
  if (characterClass === "法師" && name === "霜火新星") fixed.push("異常成功後灼燒／冰凍各 50%；冰凍三秒，重複施加刷新時間");
  if (characterClass === "法師" && name === "閃電鏈") fixed.push("麻痺降低攻速 30%，持續三秒；每發各自判定");
  if (characterClass === "法師" && name === "奧術超載") fixed.push("未命中不計次；超載自身與追加不計次；超載及五秒枯竭期間不能再次施放或累積超載充能");
  if (characterClass === "法師" && name === "餘燼回響") fixed.push("每次回響再以 15% 機率追加下一次；逐次播放，不產生主動充能、奧義能量或其他被動連鎖");
  if (characterClass === "法師" && name === "枯竭控制") fixed.push("基礎枯竭傷害降低 15%、持續五秒；減輕 50% 後為 7.5%，時間不變");
  if (characterClass === "法師" && name === "奧術感知") fixed.push("只強化主動技能本體，不強化持續傷害或被動／昇華獨立追加");
  return { ranks, fixed, description: activeDescriptions[characterClass][name] ?? null,
    ascensionName: typeof values.ascension === "string" ? values.ascension : null,
    ascensionEffect: ascensionEffects[characterClass][name] ?? null };
}
