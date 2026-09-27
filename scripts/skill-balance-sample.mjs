// Reproducible branch-only combat sampling; never substitute for browser/account acceptance.
import { registerHooks } from "node:module";
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const { balanceConfig } = await import("../app/balance-config.ts");
const { towerCombatValues, hitChanceFromRatings, enhancementBonusPercent } = await import("../app/balance.ts");
const { maps, personalBosses, worldBosses } = await import("../app/game-data.ts");
const { rangerPassiveStats } = await import("../app/skill-ranger-passives.ts");
const { createSkillAscensions } = await import("../app/skill-ascensions.ts");
const { skillBalanceScenarios, summarizeSkillBalance } = await import("../app/skill-balance-matrix.ts");
const { syncLiveCombat, liveCombatSpeedBonus, liveCombatMaxHealthBonus,
  advanceLiveCombat, resolveLiveCombatAttack, resolveLiveEnemyAttack } = await import("../app/skill-live-combat.ts");
const { settleCombatHealth } = await import("../app/skill-health-settlement.ts");
const { createBossDamageLedger, settleBossDamageEvent } = await import("../app/skill-boss-damage.ts");

const slots = ["武器", "頭盔", "胸甲", "手套", "鞋子", "項鍊", "戒指", "腰帶", "護腕", "披風"];
const layouts = {
  戰士: ["血刃斬", "裂地斬", "血戰烙印", "泰坦斷界斬", "重刃專精",
    "鐵骨", "裂傷本能", "破鎧追擊", "血氣汲取", "泰坦餘震"],
  遊俠: ["追風箭", "獵殺標記", "疾風連射", "蒼穹箭雨", "鷹眼",
    "迅捷手感", "精準連射", "狩獵節奏", "乘風閃擊", "要害穿透"],
  法師: ["奧術飛彈", "霜火新星", "隕星術", "星界寂滅", "奧術循環",
    "奧術感知", "焰脈", "精密咒式", "餘燼回響", "元素共振"],
};
const mythic = {
  戰士: [{ mythicId: "skill-warrior-fallen-city" }, { mythicId: "skill-warrior-executioner" }],
  遊俠: [{ mythicId: "skill-ranger-hunter-eye" }, { mythicId: "skill-ranger-queen-contract" }],
  法師: [{ mythicId: "skill-mage-akasha-pages" }],
};
function rng(seed) {
  let state = seed >>> 0;
  return () => ((state = (1664525 * state + 1013904223) >>> 0) / 4294967296);
}
function snapshot(scenario) {
  const { characterClass, level, equipment } = scenario;
  const mapId = level === 50 ? 5 : 9;
  const base = balanceConfig.character.baseStats[characterClass];
  const growth = balanceConfig.character.levelGrowth;
  const stats = { hp: base.hp + (level - 1) * growth.hp,
    attack: base.attack + (level - 1) * growth.attack,
    defense: base.defense + (level - 1) * growth.defense,
    speed: base.speed, hit: base.hit, dodge: base.dodge, crit: base.crit, critDamage: 50 };
  if (equipment !== "空裝") {
    const quality = equipment === "傳奇" ? 4 : 5;
    const enhance = level === 50 ? 5 : 10;
    const scale = balanceConfig.equipment.baseScaleByMap[mapId];
    for (const slot of slots) for (const [stat, baseValue, growthValue] of balanceConfig.equipment.baseStats[slot]) {
      const value = Math.round(Math.round((baseValue + mapId * growthValue) * scale *
        balanceConfig.equipment.baseQualityMultipliers[quality]) * (1 + enhancementBonusPercent(enhance) / 100));
      stats[stat === "生命" ? "hp" : stat === "攻擊" ? "attack" : "defense"] += value;
    }
    // Fixed, conservative snapshots: no random affixes, gems, rebirth or blessing.
  }
  const chosen = layouts[characterClass].slice(0, level === 50 ? 5 : 10);
  const build = { ranks: Object.fromEntries(chosen.map(name => [name, 5])), activeSlots: chosen.slice(0, 3) };
  if (characterClass === "遊俠") stats.crit += rangerPassiveStats(build).criticalChancePoints;
  const equippedItems = equipment === "神話" ? mythic[characterClass] : [];
  return { stats, build, mapId, equippedItems };
}
function sample(scenario, index) {
  const { characterClass, level, encounter } = scenario;
  const { stats, build, mapId, equippedItems } = snapshot(scenario);
  const map = maps[mapId - 1];
  const boss = encounter === "個人首領" ? personalBosses.find(b => b.id === `${mapId}-2`)
    : encounter === "世界首領60秒" ? worldBosses[0] : null;
  const recommendedPower = boss?.recommendedPower ?? Math.round((map.phasePower[0] + map.phasePower[1]) / 2);
  const floor = boss?.baseFloor ?? 14;
  const tier = boss ? "boss" : "normal";
  const monsterName = boss ? (boss.name.endsWith("・真身") ? boss.name.slice(0, -3) : boss.name) : map.monsters[0];
  const maxEnemyHp = boss?.hp ?? Math.max(100, Math.round(recommendedPower *
    balanceConfig.mapFloors.monsterHealth.normal * balanceConfig.mapFloors.monsterHealth.combatMultiplier.normal *
    (balanceConfig.lateGameMonsterScaling.health[mapId] ?? 1)));
  const maxHp = Math.round(stats.hp * (1 + liveCombatMaxHealthBonus(
    syncLiveCombat(null, `sample:${index}`, "initial", build, characterClass, level, createSkillAscensions())) / 100));
  const random = rng(1777 + index * 101);
  const combat = syncLiveCombat(null, `sample:${index}`, monsterName, build, characterClass, level, createSkillAscensions());
  let playerHp = maxHp, enemyPercent = 100, dealt = 0, enemyLedger = boss ? createBossDamageLedger(maxEnemyHp) : null;
  let playerClock = 0, enemyClock = 0, elapsedMs = 0, kills = 0;
  const skillCasts = {};
  const limitMs = encounter === "世界首領60秒" ? 60000 : 120000;
  const monster = towerCombatValues({ combatPower: recommendedPower, recommendedPower, mapId, localFloor: floor,
    tier, attacks: 1, skillTriggered: false, setTier: 0, monsterName,
    playerDefense: boss ? 0 : stats.defense });
  function applyDamage(raw) {
    if (raw <= 0 || enemyPercent <= 0) return;
    const result = enemyLedger ? settleBossDamageEvent(enemyLedger, Math.max(0, raw))
      : settleCombatHealth(enemyPercent, maxEnemyHp, Math.max(0, raw));
    if (enemyLedger) enemyLedger = result.ledger;
    enemyPercent = result.remainingPercent;
    dealt += result.actualDamage;
    if (result.defeated) kills++;
  }
  while (elapsedMs < limitMs && playerHp > 0 && enemyPercent > 0) {
    elapsedMs += 50;
    for (const tick of advanceLiveCombat(combat, elapsedMs)) applyDamage(tick);
    if (enemyPercent <= 0) break;
    playerClock += 50; enemyClock += 50;
    const passiveSpeed = characterClass === "遊俠" ? rangerPassiveStats(build).attackSpeedBonusPercent : 0;
    const attackInterval = 100000 / Math.max(1, stats.speed * (1 + (passiveSpeed + liveCombatSpeedBonus(combat)) / 100));
    if (playerClock >= attackInterval) {
      playerClock %= attackInterval;
      const hitChance = boss ? hitChanceFromRatings(stats.hit,
        20 + boss.level * balanceConfig.combat.evasionModel.bossEvasionPerLevel) :
        Math.max(5, hitChanceFromRatings(stats.hit,
          balanceConfig.combat.evasionModel.monsterEvasionBase + mapId * balanceConfig.combat.evasionModel.monsterEvasionPerMap +
          balanceConfig.combat.evasionModel.monsterEvasionBonusByMap[mapId]));
      const action = resolveLiveCombatAttack(combat, { now: elapsedMs,
        healthPercent: playerHp / maxHp * 100, attack: stats.attack, hitChance,
        criticalChance: stats.crit, criticalDamage: stats.critDamage, equippedItems, roll: random });
      if (action.name) skillCasts[action.name] = (skillCasts[action.name] ?? 0) + 1;
      let damage;
      if (boss) {
        const baseline = towerCombatValues({ combatPower: recommendedPower, recommendedPower,
          mapId: boss.mapId ?? 9, localFloor: boss.baseFloor ?? 30, tier: "boss", attacks: 1,
          skillTriggered: false, setTier: 0, monsterName, playerDefense: 0 });
        const defense = baseline.monsterDefense * (boss.multiplier ?? 1) *
          (1 - Math.min(0.8, action.defenseIgnore / 100));
        damage = Math.round(stats.attack * (1 - Math.min(0.65, defense / (defense + 100))) *
          action.damagePercent / 100);
      } else {
        damage = towerCombatValues({ combatPower: recommendedPower, recommendedPower, mapId,
          localFloor: floor, tier, attacks: 1, skillTriggered: !!action.name, setTier: 0,
          monsterName, playerAttack: stats.attack, playerDefense: stats.defense,
          roll: 0, skillMultiplier: action.damagePercent / 100,
          defenseIgnore: action.defenseIgnore }).playerDamage;
        if (action.damagePercent === 0) damage = 0;
      }
      if (action.name === "泰坦斷界斬" && equippedItems.some(i => i.mythicId === "skill-warrior-executioner") && enemyPercent < 25)
        damage *= 2;
      applyDamage(damage);
      if (damage > 0 && action.lifestealPercent > 0)
        playerHp = Math.min(maxHp, playerHp + damage * Math.min(100, action.lifestealPercent) / 100);
    }
    if (enemyPercent <= 0) break;
    if (encounter !== "世界首領60秒" && enemyClock >= (encounter === "個人首領" ? 800 : 100000 / monster.monsterAttackSpeed)) {
      enemyClock %= encounter === "個人首領" ? 800 : 100000 / monster.monsterAttackSpeed;
      const dodgeRating = Math.min(balanceConfig.progression.dodgeCap, stats.dodge) *
        balanceConfig.combat.evasionModel.statToRating;
      const bossAccuracy = balanceConfig.combat.evasionModel.monsterAccuracyBase +
        (boss?.level ?? 0) * balanceConfig.combat.evasionModel.bossAccuracyPerLevel;
      const dodged = boss ? random() * 100 > hitChanceFromRatings(bossAccuracy, dodgeRating)
        : random() * 100 < stats.dodge;
      const counterDamage = boss ? Math.max(2, Math.round(monster.monsterDamage * boss.multiplier *
        (1 - (stats.defense / Math.max(1, stats.defense + boss.level * 8)) * 0.65)))
        : monster.monsterDamage;
      const result = resolveLiveEnemyAttack(combat, { healthPercent: playerHp / maxHp * 100,
        maxHealth: maxHp, damage: counterDamage,
        defense: stats.defense, baseDodgeChance: dodged ? 100 : 0, equippedItems, roll: random });
      playerHp = Math.max(0, playerHp - result.damage);
      if (result.counterDamagePercent > 0) applyDamage(Math.round(stats.attack * result.counterDamagePercent / 100));
    }
  }
  // The published world-boss loop ends the round with an unavoidable finishing move.
  if (encounter === "世界首領60秒" && enemyPercent > 0 && elapsedMs >= 60000) playerHp = 0;
  return { ...scenario, elapsedSeconds: elapsedMs / 1000, damageDealt: dealt,
    maximumHealth: maxHp, remainingHealth: Math.max(0, playerHp), skillCasts,
    mapId, enemy: boss?.name ?? `${map.name}第14層`, enemyMaximumHealth: maxEnemyHp,
    defeatedEnemy: enemyPercent === 0, kills };
}
const samples = skillBalanceScenarios().map(sample);
const summary = summarizeSkillBalance(samples);
if (summary.measured !== 54 || summary.missing.length) throw new Error("Incomplete balance sample");
if (process.argv.includes("--json")) console.log(JSON.stringify({ assumptions: {
  seed: 1777, equipment: "10件同地圖、傳奇/神話+5(50級)/+10(100級)、無隨機詞綴與寶石",
  maps: "Lv50=地圖5、Lv100=地圖9，普通怪第14層；個人首領真身；世界首領深淵王60秒",
  excluded: "轉生、祝福、套裝、伺服器獎勵與瀏覽器渲染；模擬不計為正式帳號實戰驗收",
}, samples, metrics: summary.rows.map(row => row.metrics) }, null, 2));
else console.log(JSON.stringify({ scenarios: summary.measured, results: samples.map(s => ({
  class: s.characterClass, level: s.level, equipment: s.equipment, encounter: s.encounter,
  map: s.mapId, dps: Math.round(s.damageDealt / s.elapsedSeconds), survived: s.remainingHealth > 0,
  won: s.defeatedEnemy, casts: Object.values(s.skillCasts).reduce((a,b) => a+b,0),
})) }, null, 2));
