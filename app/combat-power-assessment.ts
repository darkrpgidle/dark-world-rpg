import { balanceConfig } from "./balance-config";
import { hitChanceFromRatings } from "./balance";
import { armorMitigation, additiveDamageMultiplier } from "./combat-math";
import { restoreSkillBuild, type SkillBuild, type SkillClass } from "./skill-rework";
import { restoreSkillAscensions, type SkillAscensionState } from "./skill-ascensions";
import { syncLiveCombat, advanceLiveCombat, resolveLiveCombatAttack,
  resolveLiveEnemyAttack, liveCombatSpeedBonus, liveEnemyControl } from "./skill-live-combat";
import { TITAN_RIFT_DURATION_MS, TITAN_RIFT_FRAME_STARTS_MS } from "./titan-rift-timing";
import { SKY_RAIN_DURATION_MS } from "./sky-queen-rain-timing";
import { ASTRAL_TIMING } from "./astral-annihilation-frames";

export type AssessmentStats = {
  hp: number; attack: number; defense: number; speed: number; hit: number; dodge: number;
  crit: number; critDamage: number; lifesteal: number; bossDamage: number;
  damageReduction: number; bossReduction: number; skillDamage: number;
};
export type SkillEstimate = { damageFactor: number; skillShare: number; protection: number; lifesteal: number };
const cache = new Map<string, SkillEstimate>();

// A normalized training target isolates build effects from equipment. Reused for
// every gear comparison; it never touches live combat, HP, rewards or save state.
export function estimateSkillContribution(characterClass: SkillClass, level: number,
  savedBuild: SkillBuild, savedAscensions: SkillAscensionState): SkillEstimate {
  const build = restoreSkillBuild(savedBuild, characterClass, level);
  if (Object.keys(build.ranks).length === 0) {
    return { damageFactor: 1, skillShare: 0, protection: 1, lifesteal: 0 };
  }
  const ascensions = restoreSkillAscensions(savedAscensions, characterClass);
  const key = JSON.stringify([characterClass, level, build, ascensions]);
  const cached = cache.get(key);
  if (cached) return cached;
  let seed = 20261007;
  const roll = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  const battle = syncLiveCombat(null, key, "assessment", build, characterClass, level, ascensions);
  let playerClock = 0, enemyClock = 0, lockUntil = 0, health = 10000;
  let damage = 0, skillDamage = 0, incoming = 0, received = 0, leech = 0;
  const rules = balanceConfig.character.powerAssessment;
  for (let now = 100; now <= rules.sampleSeconds * 1000; now += 100) {
    if (now < lockUntil) continue;
    for (const tick of advanceLiveCombat(battle, now)) damage += tick;
    playerClock += 100;
    enemyClock += 100;
    const interval = 1000 / (1 + liveCombatSpeedBonus(battle) / 100);
    if (playerClock >= interval) {
      playerClock %= interval;
      const action = resolveLiveCombatAttack(battle, { now, healthPercent: health / 100,
        attack: 100, hitChance: 100, criticalChance: 20, criticalDamage: 50, roll });
      const direct = action.damagePercent * (1 - armorMitigation(100, 100, action.defenseIgnore));
      damage += direct;
      if (action.name) skillDamage += direct;
      leech += direct * action.lifestealPercent / 100;
      health = Math.min(10000, health + direct * action.lifestealPercent / 100);
      const duration = action.name === "泰坦斷界斬"
        ? action.hits.some(hit => hit.hit) ? TITAN_RIFT_DURATION_MS : TITAN_RIFT_FRAME_STARTS_MS[11] + 300
        : action.name === "蒼穹箭雨" ? SKY_RAIN_DURATION_MS
        : action.name === "星界寂滅" ? ASTRAL_TIMING.duration : 0;
      if (duration) lockUntil = now + duration;
    }
    if (enemyClock >= 800 && now >= lockUntil) {
      enemyClock %= 800;
      incoming += 600;
      const control = liveEnemyControl(battle, now);
      if (!control.frozen && roll() < control.speedMultiplier) {
        const result = resolveLiveEnemyAttack(battle, { healthPercent: health / 100,
          maxHealth: 10000, damage: 600, defense: 0, baseDodgeChance: 0, roll });
        received += result.damage;
        health -= result.damage;
        damage += result.counterDamagePercent * (1 - armorMitigation(100, 100));
        if (health <= 0) health = 10000;
      }
    }
  }
  const estimate = Object.freeze({
    damageFactor: Math.max(1, damage / (rules.sampleSeconds * 100 * (1 - armorMitigation(100, 100)) * 1.1)),
    skillShare: Math.min(1, skillDamage / Math.max(1, damage)),
    protection: Math.min(rules.maxSkillProtection, incoming / Math.max(1, received)),
    lifesteal: leech / Math.max(1, damage),
  });
  if (cache.size >= rules.cacheEntries) cache.delete(cache.keys().next().value!);
  cache.set(key, estimate);
  return estimate;
}

// Expected output and effective HP, against fixed ratings rather than the current
// map. Temporary combat buffs/HP and blessings are deliberately excluded.
export function assessCombatPower(stats: AssessmentStats, _level: number,
  skill: SkillEstimate, setPieces: number) {
  const rules = balanceConfig.character.powerAssessment;
  const crit = Math.min(100, Math.max(0, stats.crit)) / 100;
  const critical = 1 + crit * Math.max(0, stats.critDamage) / 100;
  const hit = hitChanceFromRatings(stats.hit, rules.referenceEvasion) / 100;
  const elemental = (setPieces >= 6 ? 0.15 : 0) + (setPieces >= 10 ? 2 / 10 : 0);
  const dps = Math.max(0, stats.attack) * Math.max(0, stats.speed) / 100 * critical * hit
    * skill.damageFactor * additiveDamageMultiplier({
      bossDamage: stats.bossDamage * rules.bossShare,
      skillDamage: (stats.skillDamage + (setPieces >= 8 ? 20 : 0)) * skill.skillShare,
      bossTarget: true, skillTriggered: true })
    * (1 + elemental);
  const mitigation = armorMitigation(stats.defense, rules.referenceDefenseScale);
  const reduction = 1 - Math.min(balanceConfig.progression.damageReductionCap, Math.max(0, stats.damageReduction)) / 100;
  const bossReduction = 1 - Math.min(balanceConfig.progression.damageReductionCap, Math.max(0, stats.bossReduction)) * rules.bossShare / 100;
  const enemyHit = hitChanceFromRatings(rules.referenceAccuracy,
    Math.max(0, stats.dodge) * balanceConfig.combat.evasionModel.statToRating) / 100;
  const healing = dps * Math.min(1, Math.max(0, stats.lifesteal) / 100 + skill.lifesteal);
  const sustain = Math.min(rules.maxSustainBonus,
    healing / Math.max(1, stats.hp * rules.sustainPressurePerSecond));
  const effectiveHealth = Math.max(0, stats.hp) / Math.max(0.001,
    (1 - mitigation) * reduction * bossReduction * enemyHit) * skill.protection * (1 + sustain);
  return Math.max(1, Math.round(rules.base + dps * rules.damageWeight
    + effectiveHealth * rules.effectiveHealthWeight));
}
