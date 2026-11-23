import { balanceConfig } from "./balance-config";
import { armorMitigation } from "./combat-math";
import type { AssessmentStats, SkillEstimate } from "./combat-power-assessment";
import { findEquipmentDefinition } from "./mythic-data";
import { restoreSkillBuild, type SkillBuild, type SkillClass } from "./skill-rework";
import { restoreSkillAscensions, type SkillAscensionState } from "./skill-ascensions";
import { syncLiveCombat, advanceLiveCombatEvents, resolveLiveCombatAttack,
  resolveLiveEnemyAttack, liveCombatSpeedBonus, liveEnemyControl } from "./skill-live-combat";
import { TITAN_RIFT_DURATION_MS, TITAN_RIFT_FRAME_STARTS_MS } from "./titan-rift-timing";
import { SKY_RAIN_DURATION_MS } from "./sky-queen-rain-timing";
import { ASTRAL_TIMING } from "./astral-annihilation-frames";

type Equipment = { mythicId?: string; legendaryId?: string; name?: string };
type Ratios = { damage: number; protection: number; lifesteal: number; skillShare: number };
const cache = new Map<string, Ratios>();
const bounded = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));

// Paired, isolated training fights value equipped skill mechanisms, not item rarity.
// Character stats and set thresholds remain in the shared assessment exactly once.
export function estimateEquipmentSkillContribution(
  characterClass: SkillClass, level: number, savedBuild: SkillBuild,
  savedAscensions: SkillAscensionState, gear: Equipment[], stats: AssessmentStats,
  base: SkillEstimate,
): SkillEstimate {
  const ids = [...new Set(gear.map(findEquipmentDefinition)
    .filter(definition => definition?.kind === "skill-mythic" && definition.className === characterClass)
    .map(definition => definition!.id))].sort();
  const gemBonuses={gemBasicDamage:stats.gemBasicDamage??0,gemDotDamage:stats.gemDotDamage??0,gemShieldBonus:stats.gemShieldBonus??0,gemThorns:stats.gemThorns??0};
  const hasGems=Object.values(gemBonuses).some(value=>value>0);
  if (!ids.length&&!hasGems) return base;
  const build = restoreSkillBuild(savedBuild, characterClass, level);
  if (!Object.keys(build.ranks).length&&!hasGems) return base;
  const ascensions = restoreSkillAscensions(savedAscensions, characterClass);
  // Dimensionless HP/attack and defense/attack preserve HP explosions and armor counters.
  // Rounded ratios bound cache variety without using current HP, buffs or random live state.
  const rounded = (value: number) => Math.round(value * 100) / 100;
  const context = {
    hp: rounded(bounded(stats.hp / Math.max(1, stats.attack), 1, 100)) * 100,
    defense: rounded(bounded(stats.defense / Math.max(1, stats.attack), 0, 20)) * 100,
    speed: rounded(bounded(stats.speed, 1, 1000)),
    crit: rounded(bounded(stats.crit, 0, 100)),
    critDamage: rounded(bounded(stats.critDamage, 0, 1000)),
    lifesteal: rounded(bounded(stats.lifesteal, 0, 100)),
  };
  const key = JSON.stringify([characterClass, level, build, ascensions, ids, context,gemBonuses]);
  let ratios = cache.get(key);
  if (!ratios) {
    const rules = balanceConfig.character.powerAssessment;
    function sample(equippedItems: Equipment[], seedStart: number,withGems=false) {
      let seed = seedStart;
      const roll = () => ((seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296);
      const battle = syncLiveCombat(null, "equipment-assessment", "training", build, characterClass, level, ascensions);
      let playerClock = 0, enemyClock = 0, incomingClock = 0, lockUntil = 0, health = context.hp;
      let damage = 0, skillDamage = 0, incoming = 0, received = 0, leech = 0;
      for (let now = 100; now <= rules.sampleSeconds * 1000; now += 100) {
        if (now < lockUntil) continue;
        for (const tick of advanceLiveCombatEvents(battle, now)) damage += tick.damage;
        playerClock += 100;
        incomingClock += 100;
        if (incomingClock >= 800) {
          incomingClock %= 800;
          incoming += context.hp * rules.equipmentIncomingHealthShare;
        }
        const control = liveEnemyControl(battle, now);
        enemyClock = control.frozen ? 0 : enemyClock + 100 * control.speedMultiplier;
        const interval = 100000 / (context.speed * (1 + liveCombatSpeedBonus(battle) / 100));
        if (playerClock >= interval) {
          playerClock %= interval;
          const action = resolveLiveCombatAttack(battle, { now, healthPercent: health / context.hp * 100,
            attack: 100, hitChance: 100, criticalChance: context.crit,
            criticalDamage: context.critDamage,...(withGems?gemBonuses:{}), equippedItems, roll });
          const cost = health * action.currentHealthCostPercent / 100;
          health = Math.max(1, health - cost);
          received += cost;
          let direct = action.damagePercent * (1 - armorMitigation(100, 100, action.defenseIgnore));
          // Executioner is a client-settled effect. The final quarter is the fixed execute phase.
          if (action.name === "泰坦斷界斬" && now > rules.sampleSeconds * 750 &&
              equippedItems.some(item => item.mythicId === "skill-warrior-executioner")) direct *= 2;
          damage += direct;
          if (action.name) skillDamage += direct;
          for (const tick of action.ticks) damage += tick.damage;
          const heal = direct * Math.min(100, context.lifesteal + action.lifestealPercent) / 100;
          leech += direct * action.lifestealPercent / 100;
          health = Math.min(context.hp, health + heal);
          const duration = action.name === "泰坦斷界斬"
            ? action.hits.some(hit => hit.hit) ? TITAN_RIFT_DURATION_MS : TITAN_RIFT_FRAME_STARTS_MS[11] + 300
            : action.name === "蒼穹箭雨" ? SKY_RAIN_DURATION_MS
            : action.name === "星界寂滅" ? ASTRAL_TIMING.duration : 0;
          if (duration) lockUntil = now + duration;
        }
        if (enemyClock >= 800 && now >= lockUntil && !liveEnemyControl(battle, now).frozen) {
          enemyClock %= 800;
          const raw = context.hp * rules.equipmentIncomingHealthShare;
          const defense = resolveLiveEnemyAttack(battle, { healthPercent: health / context.hp * 100,
            maxHealth: context.hp, damage: raw, defense: context.defense,
            baseDodgeChance: 0,...(withGems?gemBonuses:{}), equippedItems, roll });
          received += defense.damage;
          health -= defense.damage;
          damage += defense.counterDamagePercent * (1 - armorMitigation(100, 100));
          const burst = defense.equipmentDamage ?? 0;
          damage += burst + defense.reflectedDamage;
          skillDamage += burst;
          if (health <= 0) health = context.hp;
        }
      }
      return { damage, skillDamage, incoming, received, leech };
    }
    const plain = { damage: 0, skillDamage: 0, incoming: 0, received: 0, leech: 0 };
    const equipped = { ...plain };
    const items = ids.map(mythicId => ({ mythicId }));
    for (let trial = 0; trial < rules.equipmentSampleTrials; trial++) {
      const seed = 20261011 + trial * 100003;
      const before = sample([], seed), after = sample(items, seed,true);
      for (const field of Object.keys(plain) as (keyof typeof plain)[]) {
        plain[field] += before[field];
        equipped[field] += after[field];
      }
    }
    const protection = (result: typeof plain) => result.incoming / Math.max(1, result.received);
    ratios = Object.freeze({ damage: equipped.damage / Math.max(1, plain.damage),
      protection: protection(equipped) / Math.max(0.001, protection(plain)),
      lifesteal: equipped.leech / Math.max(1, equipped.damage) - plain.leech / Math.max(1, plain.damage),
      skillShare: equipped.skillDamage / Math.max(1, equipped.damage) - plain.skillDamage / Math.max(1, plain.damage) });
    if (cache.size >= rules.equipmentCacheEntries) cache.delete(cache.keys().next().value!);
    cache.set(key, ratios);
  }
  return Object.freeze({ damageFactor: base.damageFactor * ratios.damage,
    protection: bounded(base.protection * ratios.protection, 0.1, balanceConfig.character.powerAssessment.maxSkillProtection),
    lifesteal: Math.max(0, base.lifesteal + ratios.lifesteal),
    skillShare: bounded(base.skillShare + ratios.skillShare, 0, 1) });
}
