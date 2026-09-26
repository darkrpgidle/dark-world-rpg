import { balanceConfig } from "./balance-config";

export type CombatTier = "normal" | "elite" | "guardian" | "boss";
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
  setTier,
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
  defenseIgnore = 0,
  playerHit,
  monsterEvasionRating = 0,
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
  defenseIgnore?: number;
  playerHit?: number;
  monsterEvasionRating?: number;
}) {
  const profile = monsterProfile(monsterName);
  const suppression = realmSuppression(combatPower, recommendedPower);
  const lateGameScale = lateGameMonsterScale(mapId);
  const checkpoint =
    tier === "guardian" && localFloor === 20
      ? balanceConfig.combat.guardianCheckpoints.floor20
      : tier === "guardian" && localFloor === 10
        ? balanceConfig.combat.guardianCheckpoints.floor10
        : { defense: 1, attack: 1 };
  const checkpointDefense =
    checkpoint.defense;
  const tierDefense =
    balanceConfig.combat.tierDefense[tier] *
    checkpointDefense *
    lateGameScale.defense *
    profile.defense *
    suppression.defenseMultiplier *
    (1 - Math.min(0.8, Math.max(0, defenseIgnore) / 100));
  const mapDamageReduction =
    balanceConfig.combat.monsterDamageReductionByMap[mapId] ?? 0;
  const defenseRules = balanceConfig.combat.defenseMitigation;
  const defenseThreshold =
    defenseRules.baseThreshold + Math.max(0, mapId - 1) * defenseRules.perMapThreshold;
  const defenseMitigation = Math.min(
    defenseRules.cap,
    Math.max(0, playerDefense) / (Math.max(0, playerDefense) + defenseThreshold),
  );
  const monsterStats = balanceConfig.combat.monsterStats;
  const monsterDefense =
    (monsterStats.baseDefense +
      Math.max(0, localFloor - 1) * monsterStats.floorDefenseGrowth +
      Math.max(0, mapId - 1) * monsterStats.mapDefenseGrowth) *
    tierDefense *
    profile.defense *
    (1 - Math.min(0.8, Math.max(0, defenseIgnore) / 100));
  const attackDefenseFactor = 100 / (100 + Math.max(0, monsterDefense));
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
        (1 + (skillTriggered ? skillDamage : 0) / 100) *
        (1 - mapDamageReduction / 100) *
        (tier === "elite" || tier === "guardian" ? 1 + eliteDamage / 100 : 1) *
        (lowHealth ? 1 + lowHealthDamage / 100 : 1) *
        Math.max(0, playerDamageMultiplier),
    ),
    );
  const tierAttack =
    balanceConfig.combat.tierAttack[tier] *
    checkpoint.attack *
    lateGameScale.attack *
    (localFloor % 10 === 0
      ? 1 - balanceConfig.combat.monsterDamage.milestoneAttackReduction
      : 1);
  const ordinaryPressure =
    tier === "normal" ? balanceConfig.combat.monsterDamage.normalPressure : 1;
  const monsterAttack =
    (monsterStats.baseAttack +
      Math.max(0, localFloor - 1) * monsterStats.floorAttackGrowth +
      Math.max(0, mapId - 1) * monsterStats.mapAttackGrowth) *
    tierAttack *
    ordinaryPressure *
    profile.attack;
  const monsterAttackScale =
    tier === "normal" ? monsterStats.normalAttackScale : monsterStats.attackScale;
  const progressionDamageFloor =
    recommendedPower *
    monsterStats.recommendedPowerAttackScale *
    tierAttack *
    ordinaryPressure *
    profile.attack;
  const monsterDamage = Math.max(
    balanceConfig.combat.monsterDamage.minimum,
    Math.round(
      Math.max(monsterAttack * monsterAttackScale, progressionDamageFloor) *
        suppression.damageMultiplier *
        (tier === "boss" ? 1 - Math.min(balanceConfig.progression.damageReductionCap, bossReduction) / 100 : 1) *
        (lowHealth ? 1 - Math.min(balanceConfig.progression.damageReductionCap, lowHealthReduction) / 100 : 1) *
        (1 - defenseMitigation),
    ),
  );
  return {
    playerDamage,
    monsterDamage,
    monsterAttackSpeed: profile.speed * 100,
    monsterProfile: profile,
    monsterAttack,
    progressionDamageFloor,
    monsterDefense,
    tierDefense,
    // 保留輸入參數以避免舊存檔與既有呼叫端變動；戰力不再參與實戰。
    combatPower,
    recommendedPower,
    defenseMitigation,
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
