import { balanceConfig } from "./balance-config";
import {realModeScale} from "./real-mode-progress";
import { armorThreshold, armorMitigation, monsterArmorRating, additiveDamageMultiplier } from "./combat-math";

export type CombatTier = "normal" | "elite" | "guardian" | "boss";
// Original chapter-2 combat baseline, independent of the newer HP curve.
export function secondChapterOriginalCombatPower(floor: number) {
  const map = balanceConfig.maps[1], rules = balanceConfig.mapFloors;
  const bounded = Math.max(1, Math.min(30, floor));
  if (bounded >= 30) return map.bossPower;
  if (bounded <= 10) return Math.round(map.power[0] + (map.phasePower[0] - map.power[0]) * (bounded - 1) / 9);
  if (bounded <= 20) {
    const start = Math.round(map.phasePower[0] * rules.phaseTwoStartMultiplier);
    return Math.round(start + (map.phasePower[1] - start) * (bounded - 11) / 9);
  }
  const start = Math.round(map.phasePower[1] * rules.phaseThreeStartMultiplier);
  return Math.round(start + (map.power[1] - start) * (bounded - 21) / 8);
}
export function secondChapterPower(floor: number) {
  const anchors = balanceConfig.secondChapter.anchors;
  const bounded = Math.max(1, Math.min(30, floor));
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1], b = anchors[i];
    if (bounded <= b[0]) return Math.round(a[1] + (b[1] - a[1]) * (bounded - a[0]) / (b[0] - a[0]));
  }
  return anchors[anchors.length - 1][1];
}
export function secondChapterHealth(power: number, tier: CombatTier, name?: string) {
  const anchors = balanceConfig.secondChapter.anchors;
  let hp = anchors[anchors.length - 1][2];
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1], b = anchors[i];
    if (power <= b[1]) { hp = a[2] + (b[2] - a[2]) * Math.max(0, power - a[1]) / (b[1] - a[1]); break; }
  }
  const variation = tier === "normal" ? 1 + (monsterProfile(name).health - 1) * balanceConfig.secondChapter.profileVariation : 1;
  return Math.max(balanceConfig.mapFloors.monsterHealth.minimum, Math.round(hp * variation));
}
// Interpolate shared first-chapter anchors for UI and all damage/HP paths.
export function firstChapterPower(floor: number) {
  const anchors = balanceConfig.firstChapter.anchors;
  const bounded = Math.max(1, Math.min(30, floor));
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1], b = anchors[i];
    if (bounded <= b[0]) return Math.round(a[1] + (b[1] - a[1]) * (bounded - a[0]) / (b[0] - a[0]));
  }
  return anchors[anchors.length - 1][1];
}
export function firstChapterHealth(power: number, tier: CombatTier, name?: string) {
  const anchors = tier === "normal" ? balanceConfig.firstChapter.ordinaryHealthAnchors
    : balanceConfig.firstChapter.anchors.map(anchor => [anchor[1], anchor[2]]);
  let hp = anchors[anchors.length - 1][1];
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1], b = anchors[i];
    if (power <= b[0]) { hp = a[1] + (b[1] - a[1]) * Math.max(0, power - a[0]) / (b[0] - a[0]); break; }
  }
  const variation = tier === "normal" ? 1 + (monsterProfile(name).health - 1) * balanceConfig.firstChapter.profileVariation : 1;
  return Math.max(balanceConfig.mapFloors.monsterHealth.minimum, Math.round(hp * variation));
}
export type SuppressionTier = "none" | "light" | "medium" | "heavy" | "abyss";

export function realmSuppression(combatPower: number, recommendedPower: number) {
  const ratio = Math.max(0, combatPower) / Math.max(1, recommendedPower);
  const rules = balanceConfig.combat.realmSuppression;
  const tier: SuppressionTier = ratio >= 1
    ? "none"
    : ratio >= rules.light.minimumRatio
      ? "light"
      : ratio >= rules.medium.minimumRatio
        ? "medium"
        : ratio >= rules.heavy.minimumRatio
          ? "heavy"
          : "abyss";
  if (tier === "none") return { tier, damageMultiplier: 1, defenseMultiplier: 1, hitBonus: 0, ratio };
  const values = rules[tier];
  return { tier, ...values, ratio };
}

export function healthFromPercent(percent: number, maximumHealth: number) {
  const boundedPercent = Math.max(0, Math.min(100, percent));
  if (boundedPercent <= 0 || maximumHealth <= 0) return 0;
  // A living unit must retain at least 1 displayed HP. Without this guard,
  // fractional percentage residue can render as 0 HP and become unkillable.
  return Math.max(1, Math.round((maximumHealth * boundedPercent) / 100));
}

export function healthPercentFromDamage(damage: number, maximumHealth: number) {
  return Math.min(100, (Math.max(0, damage) * 100) / Math.max(1, maximumHealth));
}

const clamp = (minimum: number, maximum: number, value: number) =>
  Math.min(maximum, Math.max(minimum, value));

export type MonsterProfile = {
  health: number;
  attack: number;
  defense: number;
  speed: number;
};

const defaultMonsterProfile: MonsterProfile = {
  health: 1,
  attack: 1,
  defense: 1,
  speed: 1,
};

export function monsterProfile(name?: string): MonsterProfile {
  if (!name || !(name in balanceConfig.monsterProfiles)) return defaultMonsterProfile;
  return balanceConfig.monsterProfiles[name as keyof typeof balanceConfig.monsterProfiles];
}

export function lateGameMonsterScale(mapId: number) {
  const scales = balanceConfig.lateGameMonsterScaling;
  const index = Math.max(1, Math.min(scales.health.length - 1, Math.round(mapId)));
  return {
    health: scales.health[index] ?? 1,
    defense: scales.defense[index] ?? 1,
    attack: scales.attack[index] ?? 1,
  };
}

/** 流亡黯道式命中率：攻擊者命中評等對防守者閃避評等。 */
export function hitChanceFromRatings(accuracyRating: number, evasionRating: number) {
  const rules = balanceConfig.combat.evasionModel;
  const accuracy = Math.max(0, accuracyRating);
  const evasion = Math.max(0, evasionRating);
  const denominator = accuracy + evasion * rules.evasionMultiplier;
  const rawHitChance = denominator <= 0
    ? rules.maximumHitChance
    : ((accuracy * rules.accuracyMultiplier) / denominator) * 100;
  return clamp(rules.minimumHitChance, rules.maximumHitChance, rawHitChance);
}

export function evadeChanceFromRatings(accuracyRating: number, evasionRating: number) {
  return 100 - hitChanceFromRatings(accuracyRating, evasionRating);
}

export function monsterRatingsForMap(mapId: number) {
  const rules = balanceConfig.combat.evasionModel;
  const mapIndex = Math.max(1, Math.min(rules.monsterAccuracyRatingByMap.length - 1, Math.round(mapId)));
  return {
    accuracy: rules.monsterAccuracyRatingByMap[mapIndex] ?? rules.monsterAccuracyBase,
    evasion: Math.round(
      (rules.monsterEvasionRatingByMap[mapIndex] ?? rules.monsterEvasionBase) *
      (1 + (rules.monsterEvasionBonusPercentByMap[mapIndex] ?? 0) / 100),
    ),
  };
}

export function enhancementGoldCost(
  targetLevel: number,
  context: { mapId?: number; quality?: string; slot?: string } = {},
) {
  const level = clamp(1, balanceConfig.progression.maxEnhancement, Math.round(targetLevel));
  const rules = balanceConfig.equipment.enhancementAttempt;
  const mapIndex = clamp(1, balanceConfig.maps.length, Math.round(context.mapId ?? 1)) - 1;
  const qualityMultiplier = (rules.qualityMultiplier as Record<string, number>)[context.quality ?? "普通"] ?? 1;
  const slotMultiplier = (rules.slotMultiplier as Record<string, number>)[context.slot ?? "武器"] ?? 1;
  const levelMultiplier = rules.levelMultiplierByCurrentLevel[level - 1] ?? 1;
  const mapBase = rules.baseGoldByMap[mapIndex] ?? rules.goldCost.base;
  return Math.max(1, Math.round(mapBase * qualityMultiplier * slotMultiplier * levelMultiplier));
}

export function enhancementBonusPercent(level: number) {
  const safeLevel = clamp(
    0,
    balanceConfig.progression.maxEnhancement,
    Math.round(level),
  );
  const rules = balanceConfig.equipment.enhancement;
  return (
    Math.min(4, safeLevel) * rules.firstFourPerLevel +
    Math.max(0, Math.min(9, safeLevel) - 4) * rules.levelsFiveToNinePerLevel +
    Math.max(0, safeLevel - 9) * rules.levelTenPlusPerLevel
  );
}

export function enhancementStoneCost(targetLevel: number) {
  const level = clamp(1, balanceConfig.progression.maxEnhancement, Math.round(targetLevel));
  const rules = balanceConfig.equipment.enhancementAttempt.stoneCost;
  if (level <= 5) return level;
  if (level <= 10) return rules.middleBase + rules.middlePerLevel * (level - 5);
  return Math.ceil(rules.lateBase * rules.lateGrowth ** (level - 10));
}

export function equipmentReforgeCost(completedAttempts: number, targeted = false) {
  const rules = balanceConfig.economy.costs.reforge;
  const requestedAttempts = Number(completedAttempts);
  const attempts = Number.isFinite(requestedAttempts)
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(requestedAttempts)))
    : 0;
  const baseGold = targeted ? rules.targetedGold : rules.baseGold;
  const baseStones = targeted ? rules.targetedStones : rules.baseStones;
  const maxMultiplier = Math.floor(Number.MAX_SAFE_INTEGER / rules.targetedGold);
  const multiplier = Math.min(maxMultiplier, rules.repeatMultiplier ** attempts);
  return {
    gold: Math.ceil(baseGold * multiplier),
    stones: Math.ceil(baseStones * multiplier),
  };
}

export function enhancementStoneDropChance(baseChance: number, bonusPercent = 0, blessingBonus = 0) {
  const multiplier = balanceConfig.economy.enhancementStones.combatDropChanceMultiplier;
  return clamp(0, 1, (baseChance + bonusPercent / 100 + blessingBonus) * multiplier);
}

export function enhancementStoneDismantleYield(qualityRank: number, enhancementLevel: number) {
  const baseYield = Math.max(0, qualityRank) + Math.floor(Math.max(0, enhancementLevel) / 3);
  const multiplier = balanceConfig.economy.enhancementStones.dismantleYieldMultiplier;
  return Math.max(1, Math.floor(baseYield * multiplier));
}

export function enhancementFailureLevel(currentLevel: number) {
  return currentLevel <= 10 ? currentLevel : currentLevel - 1;
}

export function gamblePackageReward(roll: number) {
  const normalizedRoll = Math.min(0.999999, Math.max(0, roll));
  if (normalizedRoll < 0.4) return { type: "equipment" as const, qualityIndex: 3 as const };
  if (normalizedRoll < 0.7) return { type: "reforge" as const, amount: 10 };
  if (normalizedRoll < 0.9) return { type: "equipment" as const, qualityIndex: 4 as const };
  return { type: "equipment" as const, qualityIndex: 5 as const };
}

export function towerCombatValues({
  combatPower,
  recommendedPower,
  mapId,
  localFloor,
  tier,
  attacks,
  skillTriggered,
  echoMultiplier = 1,
  skillMultiplier = 1,
  skillDamage = 0,
  eliteDamage = 0,
  bossReduction = 0,
  lowHealthDamage = 0,
  lowHealthReduction = 0,
  lowHealth = false,
  roll = 0.5,
  monsterName,
  playerDefense = 0,
  playerAttack = 54,
  playerDamageMultiplier = 1,
  bossDamage = 0,
  defenseIgnore = 0,
  playerHit,
  monsterEvasionRating = 0,
  firstChapterTuning = true,
  secondChapterTuning = false,
  calibrateMonsterStats = true,
  realModeChapter = 0,
}: {
  combatPower: number;
  recommendedPower: number;
  mapId: number;
  localFloor: number;
  tier: CombatTier;
  attacks: number;
  skillTriggered: boolean;
  setTier: number;
  echoMultiplier?: number;
  skillMultiplier?: number;
  skillDamage?: number;
  eliteDamage?: number;
  bossReduction?: number;
  lowHealthDamage?: number;
  lowHealthReduction?: number;
  lowHealth?: boolean;
  roll?: number;
  monsterName?: string;
  playerDefense?: number;
  playerAttack?: number;
  playerDamageMultiplier?: number;
  bossDamage?: number;
  defenseIgnore?: number;
  playerHit?: number;
  monsterEvasionRating?: number;
  firstChapterTuning?: boolean;
  secondChapterTuning?: boolean;
  calibrateMonsterStats?: boolean;
  realModeChapter?: number;
}) {
  const real = realModeChapter > 0 ? realModeScale(realModeChapter, localFloor, tier) : null;
  const enemyTier = real ? "boss" : tier;
  const originalProfile = monsterProfile(monsterName);
  if(real){mapId=9;localFloor=30;recommendedPower=Math.round(balanceConfig.maps[8].bossPower*real.power);firstChapterTuning=false;secondChapterTuning=false;}
  const enemyProfile = real ? monsterProfile("時墟主宰") : originalProfile;
  const chapter = balanceConfig.firstChapter;
  const useChapter = mapId === 1 && firstChapterTuning;
  const profile = useChapter ? {
    ...originalProfile,
    attack: 1 + (originalProfile.attack - 1) * chapter.profileVariation,
    defense: 1 + (originalProfile.defense - 1) * chapter.profileVariation,
  } : enemyProfile;
  const combatRecommendedPower = mapId === 2 && secondChapterTuning
    ? secondChapterOriginalCombatPower(localFloor) : recommendedPower;
  const suppression = realmSuppression(combatPower, combatRecommendedPower);
  const lateGameScale = lateGameMonsterScale(mapId);
  const checkpoint =
    tier === "guardian" && localFloor === 20
      ? balanceConfig.combat.guardianCheckpoints.floor20
      : tier === "guardian" && localFloor === 10
        ? balanceConfig.combat.guardianCheckpoints.floor10
        : { defense: 1, attack: 1 };
  const calibrationTier = real ? "boss" : tier === "guardian" && localFloor === 10 ? "guardian10" : tier;
  const calibration = (calibrateMonsterStats
    ? balanceConfig.combat.monsterCalibrationByMap[mapId - 1]?.[calibrationTier] : undefined)
    ?? { attack: 1, defense: 1 };
  const checkpointDefense = real || useChapter ? 1 : checkpoint.defense;
  const tierDefense =
    (useChapter ? chapter.tierDefense[tier] * chapter.defenseScale : balanceConfig.combat.tierDefense[enemyTier]) *
    checkpointDefense *
    lateGameScale.defense *
    profile.defense *
    suppression.defenseMultiplier * calibration.defense * (real?.defense ?? 1);
  const mapDamageReduction =
    balanceConfig.combat.monsterDamageReductionByMap[mapId] ?? 0;
  const defenseThreshold = armorThreshold(mapId, localFloor);
  const defenseMitigation = armorMitigation(playerDefense, defenseThreshold);
  const monsterStats = balanceConfig.combat.monsterStats;
  const monsterDefense = monsterArmorRating(
    (monsterStats.baseDefense +
      Math.max(0, localFloor - 1) * monsterStats.floorDefenseGrowth +
      Math.max(0, mapId - 1) * monsterStats.mapDefenseGrowth) *
    tierDefense, defenseThreshold);
  const attackDefenseFactor = 1 - armorMitigation(monsterDefense, defenseThreshold, defenseIgnore);
  const damageBonusMultiplier = additiveDamageMultiplier({ skillDamage, bossDamage, eliteDamage, lowHealthDamage,
    skillTriggered, bossTarget: tier !== "normal", eliteTarget: tier === "elite" || tier === "guardian", lowHealth });
  const playerHitChance = playerHit === undefined
    ? 100
    : Math.max(5, hitChanceFromRatings(
        Math.max(0, playerHit),
        monsterEvasionRating,
      ) - suppression.hitBonus);
  const playerDamage = roll * 100 > playerHitChance
    ? 0
    : Math.max(
    balanceConfig.combat.baseDamage.minimum,
    Math.round(
        Math.max(0, playerAttack) *
        monsterStats.playerAttackScale *
        attackDefenseFactor *
        attacks *
        echoMultiplier *
        skillMultiplier *
        damageBonusMultiplier *
        (1 - mapDamageReduction / 100) *
        Math.max(0, playerDamageMultiplier),
    ),
    );
  const tierAttack =
    (useChapter ? chapter.tierAttack[tier] * chapter.attackScale : balanceConfig.combat.tierAttack[enemyTier]) *
    (real || useChapter ? 1 : checkpoint.attack) *
    lateGameScale.attack *
    (!useChapter && localFloor % 10 === 0
      ? 1 - balanceConfig.combat.monsterDamage.milestoneAttackReduction
      : 1);
  const ordinaryPressure =
    enemyTier === "normal" ? balanceConfig.combat.monsterDamage.normalPressure : 1;
  const monsterAttack =
    (monsterStats.baseAttack +
      Math.max(0, localFloor - 1) * monsterStats.floorAttackGrowth +
      Math.max(0, mapId - 1) * monsterStats.mapAttackGrowth) *
    tierAttack *
    ordinaryPressure *
    profile.attack * (real?.attack ?? 1);
  const monsterAttackScale =
    enemyTier === "normal" ? monsterStats.normalAttackScale : monsterStats.attackScale;
  const progressionDamageFloor =
    combatRecommendedPower *
    monsterStats.recommendedPowerAttackScale *
    tierAttack *
    ordinaryPressure *
    profile.attack * (real?.attack ?? 1);
  const monsterDamage = Math.max(
    balanceConfig.combat.monsterDamage.minimum,
    Math.round(
      Math.max(monsterAttack * monsterAttackScale, progressionDamageFloor) * calibration.attack *
        suppression.damageMultiplier *
        (tier === "boss" ? 1 - Math.min(balanceConfig.progression.damageReductionCap, bossReduction) / 100 : 1) *
        (lowHealth ? 1 - Math.min(balanceConfig.progression.damageReductionCap, lowHealthReduction) / 100 : 1) *
        (1 - defenseMitigation),
    ),
  );
  return {
    playerDamage,
    monsterDamage,
    monsterAttackSpeed: originalProfile.speed * 100,
    monsterProfile: profile,
    monsterAttack,
    progressionDamageFloor,
    monsterDefense,
    tierDefense,
    // 保留原戰鬥戰力與樓層需求：仍參與境界壓制，不使用地圖卡片的綜合戰力建議。
    combatPower,
    recommendedPower,
    defenseMitigation,
    damageBonusMultiplier,
    playerHitChance,
    suppression,
  };
}

export function dropPowerRange(mapId: number, qualityIndex: number) {
  const mapScale = balanceConfig.equipment.mapPowerScale[mapId] ?? 1;
  const minimum = Math.round(
    (balanceConfig.equipment.dropPower.base + qualityIndex * balanceConfig.equipment.dropPower.qualityGrowth) * mapScale,
  );
  return { minimum, maximum: Math.round(minimum * balanceConfig.equipment.dropPower.maximumMultiplier) };
}
