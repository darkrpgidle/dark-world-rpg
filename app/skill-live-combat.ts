// Live adapter for the existing tower and boss HP settlement.
// Combat rules own charge, status and passive state; the caller owns HP, rewards and visuals.
import { enabledAscensions, type SkillAscensionState } from "./skill-ascensions";
import { advanceCombatSession, takeReadySkill, trySkillProc } from "./skill-combat-session";
import { grantUltimateEnergy } from "./skill-combat-queue";
import { hasCatalogItem } from "./mythic-data";
import { balanceConfig } from "./balance-config";
import { calculateDebuffTickRawDamage, type DebuffTick } from "./skill-debuff-timer";
import { createWarriorCombat, resolveWarriorTurn, transitionWarriorNormalKill, type WarriorCombat } from "./skill-warrior-combat";
import { createRangerCombat, resolveRangerTurn, transitionRangerNormalKill, type RangerCombat } from "./skill-ranger-combat";
import { createMageCombat, resolveMageTurn, transitionMageCombat, type MageCombat } from "./skill-mage-combat";
import { recordWarriorEnemyAttack, recordWarriorSuccessfulBlock, recordWarriorCounter } from "./skill-warrior-defense";
import { recordRangerEnemyAttack, recordRangerSuccessfulDodge } from "./skill-ranger-defense";
import { recordMageIncomingAttack, tryActivateMageShield } from "./skill-mage-shield";
import { rangerPassiveStats } from "./skill-ranger-passives";
import { warriorPassiveBleedDamageBonusPercent } from "./skill-warrior-passives";
import { RANGER_ACTIVE_RULES, RANGER_PASSIVE_RULES, rangerSkillRankValue } from "./skill-ranger-rules";
import { advanceMageOverload, MAGE_ACTIVE_RULES, MAGE_PASSIVE_RULES } from "./skill-mage-rules";
import { restoreSkillBuild, SKILL_REWORK_CATALOG, type SkillBuild, type SkillClass } from "./skill-rework";
import type { PrimaryAttackEvent } from "./skill-combat-queue";
import type { PhantomStepEvent } from "./ranger-phantom-state";

export type LiveCombatBattle = {
  owner: string | object; signature: string; target: string;
  characterClass: SkillClass; build: SkillBuild; ascended: ReadonlySet<string>;
  combat: WarriorCombat | RangerCombat | MageCombat;
  dotAttack: { bleed: number; burn: number };
  fallenCityDamagePending: number; hunterEyeCritDamagePending: boolean;
  queenCarryForNextTarget: boolean; queenCarry: number;
  akashaStacks: number; akashaReady: boolean;   executionEnergyRemainder: number;
  emberEchoes: { at: number; attack: number; percent: number; hitChance: number; critChance: number; critDamage: number; roll: () => number }[];
  fissureNormalsRemaining: number; skyPiercerNextAttack: boolean;
};
export type LiveCombatAction = {
  name: string | null; hits: PrimaryAttackEvent["hits"];
  damagePercent: number; defenseIgnore: number; lifestealPercent: number; bloodRoarEmpowered: boolean; stanceEmpowered: boolean;
  statuses: string[]; ticks: LiveDotDamageEvent[]; critical: boolean;
  bloodBrandExpiresAt: number | null; bloodBrandBurst: boolean;
  repeatedArmorBreakBonusPercent: number;
  titanSlashHits: number; titanSlashIndex: number | null;
  groundShockDamagePercent: number;
  tailwindEcho: { hit: boolean; critical: boolean; damagePercent: number } | null;
  tailwindChargeRecovered: boolean;
  starbreakChargeRecovered: boolean;
  astralSegments: { hit: boolean; critical: boolean; damagePercent: number; label?: string }[];
  skyArrows: { hit: boolean; critical: boolean; damagePercent: number }[];
  hunterMark: { expiresAt: number; criticals: number; pending: boolean; ascended: boolean;
    activated: boolean; criticalHit: boolean } | null;
  volleyArrows: { hit: boolean; critical: boolean; damagePercent: number; sixth: boolean }[];
  hunterExplosion: { hit: boolean; critical: boolean; damagePercent: number } | null;
  lightningSegments: { hit: boolean; critical: boolean; damagePercent: number }[];
  frostfireAfterburst: { hit: boolean; critical: boolean; damagePercent: number } | null;
  meteorAfterburst: { hit: boolean; critical: boolean; damagePercent: number } | null;
  equipmentHits: { label: string; damagePercent: number; critical: boolean }[];
  currentHealthCostPercent: number;
  bloodRoarActivated: boolean;
};
type AttackOptions = { now: number; healthPercent: number; attack: number;
  hitChance: number; criticalChance: number; criticalDamage: number; roll?: () => number;
  equippedItems?: { mythicId?: string; legendaryId?: string; name?: string }[] };

function createCombat(characterClass: SkillClass, build: SkillBuild, level: number) {
  const unequipped = new Set(SKILL_REWORK_CATALOG[characterClass]
    .filter((skill) => skill.kind === "active" && skill.category !== "ultimate"
      && !build.activeSlots.includes(skill.name)).map((skill) => skill.name));
  const activeBuild = { ...build, ranks: Object.fromEntries(Object.entries(build.ranks)
    .filter(([name]) => !unequipped.has(name))) };
  return characterClass === "戰士" ? createWarriorCombat(activeBuild, level)
    : characterClass === "遊俠" ? createRangerCombat(activeBuild, level) : createMageCombat(activeBuild, level);
}

export function syncLiveCombat(
  previous: LiveCombatBattle | null, owner: string | object, target: string,
  build: SkillBuild, characterClass: SkillClass, level: number, ascensions: SkillAscensionState,
): LiveCombatBattle {
  const canonical = restoreSkillBuild(build, characterClass, level);
  const signature = JSON.stringify([characterClass, level, canonical, ascensions]);
  if (previous && previous.owner === owner && previous.signature === signature) {
    if (previous.target !== target) {
      previous.combat = previous.characterClass === "戰士"
        ? transitionWarriorNormalKill(previous.combat as WarriorCombat)
        : previous.characterClass === "遊俠"
          ? transitionRangerNormalKill(previous.combat as RangerCombat)
          : transitionMageCombat(previous.combat as MageCombat, "normal-kill");
      previous.target = target;
      previous.dotAttack = { bleed: 0, burn: 0 };
      previous.emberEchoes = [];
      previous.fissureNormalsRemaining = 0;
      previous.queenCarry = previous.queenCarryForNextTarget ? 2 : 0;
      previous.queenCarryForNextTarget = false;
    }
    return previous;
  }
  return { owner, target, signature, characterClass, build: canonical,
    ascended: new Set(enabledAscensions(ascensions, characterClass)),
    combat: createCombat(characterClass, canonical, level), dotAttack: { bleed: 0, burn: 0 },
    fallenCityDamagePending: 0, hunterEyeCritDamagePending: false,
    queenCarryForNextTarget: false, queenCarry: 0, akashaStacks: 0, akashaReady: false,
    executionEnergyRemainder: 0, emberEchoes: [], fissureNormalsRemaining: 0, skyPiercerNextAttack: false };
}

export function nextLiveSkill(battle: LiveCombatBattle, now = Date.now()): string | null {
  if (battle.characterClass === "法師") {
    const mage = battle.combat as MageCombat;
    mage.overload = advanceMageOverload(mage.overload, now);
  }
  const blocked = battle.characterClass === "法師"
    && (battle.combat as MageCombat).overload.phase !== "idle" ? new Set(["奧術超載"]) : new Set<string>();
  return takeReadySkill(battle.combat.session, true, blocked)?.skill ?? null;
}

export function liveCombatSpeedBonus(battle: LiveCombatBattle): number {
  if (battle.characterClass === "遊俠") {
    const ranger = battle.combat as RangerCombat;
    const windRank = battle.build.ranks["風之積蓄"] ?? 0;
    const windPassive = ranger.passives.windMomentumRemaining > 0 && windRank > 0
      ? ranger.passives.windMomentumStacks * rangerSkillRankValue(RANGER_PASSIVE_RULES.風之積蓄.speedPerStack, windRank) : 0;
    return windPassive + (ranger.windDomain.remainingActions > 0
      ? rangerSkillRankValue(RANGER_ACTIVE_RULES.風行領域.attackSpeedBonus, ranger.windDomain.rank)
        + (ranger.windDomain.ascended ? ranger.windDomain.galeStacks * 3 : 0) : 0);
  }
  if (battle.characterClass === "戰士") {
    const stance = (battle.combat as WarriorCombat).buffs;
    return stance.stanceRemaining > 0 ? ([10, 14, 18, 22, 26][stance.stanceRank - 1] ?? 0) : 0;
  }
  return 0;
}

export function liveCombatMaxHealthBonus(battle: LiveCombatBattle): number {
  if (battle.characterClass === "戰士") return 0;
  return 0;
}

export type LiveDotDamageEvent = { kind: "bleed" | "burn" | "freeze" | "echo"; damage: number; critical?: boolean };

// Used by both tower and boss clocks; frozen time never banks enemy attacks.
export function liveEnemyControl(battle: LiveCombatBattle | null, now: number) {
  const enemy = battle?.combat.session.enemy;
  const frozen = Boolean(enemy?.freeze && enemy.freeze.expiresAt > now);
  const slowed = enemy?.paralysis && enemy.paralysis.expiresAt > now ? enemy.paralysis.strength : 0;
  return { frozen, speedMultiplier: frozen ? 0 : Math.max(0, 1 - slowed / 100) };
}

export function advanceLiveCombatEvents(battle: LiveCombatBattle, now: number): LiveDotDamageEvent[] {
  const next = advanceCombatSession(battle.combat.session, now);
  battle.combat = { ...battle.combat, session: next.session } as LiveCombatBattle["combat"];
  if (battle.characterClass === "法師") {
    const mage = battle.combat as MageCombat;
    mage.overload = advanceMageOverload(mage.overload, now);
  }
  const events: LiveDotDamageEvent[] = next.ticks.map((tick) => ({ kind: tick.kind, damage: liveTickDamage(battle, tick) }));
  // At most one step per chain per clock tick: no recursive proc loop or catch-up burst.
  battle.emberEchoes = battle.emberEchoes.flatMap((echo) => {
    if (echo.at > now) return [echo];
    const hit = echo.roll() * 100 < echo.hitChance;
    const critical = hit && echo.roll() * 100 < echo.critChance;
    if (hit) events.push({ kind: "echo", ...(critical ? { critical: true } : {}), damage: echo.attack * echo.percent / 100 * (critical ? 1 + echo.critDamage / 100 : 1) });
    return echo.roll() * 100 < MAGE_PASSIVE_RULES.餘燼回響.procChance ? [{ ...echo, at: now + 180 }] : [];
  });
  return events;
}

export function advanceLiveCombat(battle: LiveCombatBattle, now: number): number[] {
  return advanceLiveCombatEvents(battle, now).map((event) => event.damage);
}

function liveTickDamage(battle: LiveCombatBattle, tick: DebuffTick): number {
  const bonus = tick.kind === "bleed" && battle.characterClass === "戰士"
    ? warriorPassiveBleedDamageBonusPercent(battle.build) : 0;
  return calculateDebuffTickRawDamage({ ...tick,
    ...(bonus > 0 ? { bleedDamageBonusPercent: 100 * ((1 + (tick.bleedDamageBonusPercent ?? 0) / 100) * (1 + bonus / 100) - 1) } : {}),
  }, tick.kind === "freeze" ? tick.attackSnapshot ?? 0 : battle.dotAttack[tick.kind]);
}

function segmentCount(name: string | null): number {
  return name === "疾風連射" ? 5 : name === "蒼穹箭雨" ? 9
    : name === "閃電鏈" ? 3 : name === "星界寂滅" ? MAGE_ACTIVE_RULES.星界寂滅.beamCount + 1
    : name === "奧術超載" ? 0 : 1;
}

export function resolveLiveCombatAttack(battle: LiveCombatBattle, options: AttackOptions): LiveCombatAction {
  const name = nextLiveSkill(battle, options.now);
  const random = options.roll ?? Math.random;
  const hasMythic = (id: string) => hasCatalogItem(options.equippedItems ?? [], id);
  const energyBefore = battle.combat.session.charge.ultimateEnergy;
  const ranger = battle.characterClass === "遊俠" ? battle.combat as RangerCombat : null;
  const nextCritRank = battle.build.ranks["影步反射"] ?? 0;
  const pendingCrit = ranger?.passives.nextPrimaryCriticalPending && nextCritRank
    ? rangerSkillRankValue(RANGER_PASSIVE_RULES.影步反射.nextPrimaryCriticalChancePoints, nextCritRank) : 0;
  const eagleEye = rangerPassiveStats(battle.build).criticalChancePoints;
  const critChance = Math.min(100, options.criticalChance
    + (ranger && hasMythic("skill-ranger-hunter-eye") ? eagleEye * 0.5 : 0)
    + (ranger?.session.enemy.hunterMark?.strength ?? 0)
    + (ranger?.defense.nextHitCriticalChancePoints ?? 0) + pendingCrit);
  const snipeRank = name === "破星狙擊" ? battle.build.ranks[name] ?? 0 : 0;
  const criticalDamage = options.criticalDamage + (name && ranger?.passives && battle.hunterEyeCritDamagePending ? 40 : 0) + (snipeRank
    ? rangerSkillRankValue(RANGER_ACTIVE_RULES.破星狙擊.criticalDamageBonus, snipeRank) : 0)
    + (name && ranger?.defense.nextSkillCriticalDamagePending ? RANGER_ACTIVE_RULES.幻影步.nextSkillCritDamage : 0);
  const feathers = name === "疾風連射" && hasMythic("skill-ranger-thousand-feathers");
  const originalSegments = feathers ? balanceConfig.equipment.skillMythics.thousandFeathers.arrows : segmentCount(name);
  const hits = Array.from({ length: originalSegments }, (_, index) => {
    const hit = random() * 100 < options.hitChance;
    return { hit, critical: hit && (feathers && index === originalSegments - 1 || random() * 100 < critChance) };
  });
  const critical = hits.some((part) => part.hit && part.critical);
  const percent = (value: number, index = 0) => hits[index]?.hit
    ? value * (hits[index]?.critical ? 1 + criticalDamage / 100 : 1) : 0;
  const statuses: string[] = [];
  let damagePercent = 0;
  let targetDamageTakenBonusPercent = 0;
  let defenseIgnore = battle.combat.session.enemy.armorBreak?.strength ?? 0;
  let lifestealPercent = 0;
  let bloodRoarEmpowered = false;
  let stanceEmpowered = false;
  let ticks: DebuffTick[] = [];
  let bloodBrandBurst = false;
  let repeatedArmorBreakBonusPercent = 0;
  let titanSlashHits = 0;
  let titanSlashIndex: number | null = null;
  let groundShockDamagePercent = 0;
  let tailwindEcho: LiveCombatAction["tailwindEcho"] = null;
  let tailwindChargeRecovered = false;
  let starbreakChargeRecovered = false;
  let hunterMark: LiveCombatAction["hunterMark"] = null;
  const volleyArrows: LiveCombatAction["volleyArrows"] = [];
  const astralSegments: LiveCombatAction["astralSegments"] = [];
  const skyArrows: LiveCombatAction["skyArrows"] = [];
  let hunterExplosion: LiveCombatAction["hunterExplosion"] = null;
  const lightningSegments: LiveCombatAction["lightningSegments"] = [];
  let frostfireAfterburst: LiveCombatAction["frostfireAfterburst"] = null;
  let meteorAfterburst: LiveCombatAction["meteorAfterburst"] = null;
  const equipmentHits: LiveCombatAction["equipmentHits"] = [];
  let currentHealthCostPercent = 0;
  let bloodRoarActivated = false;
  if (battle.characterClass === "戰士") {
    const previousRoar = (battle.combat as WarriorCombat).buffs;
    stanceEmpowered = previousRoar.stanceRemaining > 0;
    const result = resolveWarriorTurn(battle.combat as WarriorCombat, {
      skill: (name ?? "normal") as Parameters<typeof resolveWarriorTurn>[1]["skill"],
      hits, now: options.now, healthPercent: options.healthPercent,
      ascended: battle.ascended as ReadonlySet<Exclude<Parameters<typeof resolveWarriorTurn>[1]["skill"], "normal">>,
      roll: random, equippedItems: options.equippedItems,
    });
    if (!result) throw new Error("Warrior action and charge queue disagree");
    bloodRoarEmpowered = previousRoar.bloodRoarRemaining > 0 || (!previousRoar.bloodRoarUsed && result.combat.buffs.bloodRoarUsed);
    bloodRoarActivated = !previousRoar.bloodRoarUsed && result.combat.buffs.bloodRoarUsed;
    battle.combat = result.combat;
    if (!hasMythic("skill-warrior-titan-axe")) battle.fissureNormalsRemaining = 0;
    if (name === null && battle.fissureNormalsRemaining > 0) {
      battle.fissureNormalsRemaining--;
      const proc = trySkillProc(battle.combat.session, { id: "skill-warrior-titan-axe", kind: "damage", source: "primary", family: "equipment" });
      battle.combat.session = proc.session;
      if (hits[0]?.hit && proc.allowed) {
        equipmentHits.push({ label: "大地崩解", damagePercent: balanceConfig.equipment.skillMythics.titanAxe.extraAttackPercent, critical: false });
        if (battle.fissureNormalsRemaining === 0) equipmentHits.push({ label: "裂痕引爆", damagePercent: balanceConfig.equipment.skillMythics.titanAxe.detonationPercent, critical: false });
      }
    }
    if (name === "裂地斬" && hits[0]?.hit && hasMythic("skill-warrior-titan-axe"))
      battle.fissureNormalsRemaining = balanceConfig.equipment.skillMythics.titanAxe.normalAttacks;
    if (previousRoar.bloodRoarRemaining === 1 && hasMythic("skill-warrior-blood-heart")) {
      currentHealthCostPercent = balanceConfig.equipment.skillMythics.bloodHeart.currentHealthCostPercent;
      const proc = trySkillProc(battle.combat.session, { id: "skill-warrior-blood-heart", kind: "damage", source: "primary", family: "equipment" });
      battle.combat.session = proc.session;
      if (hits.some(part => part.hit) && proc.allowed) equipmentHits.push({ label: "血神降臨", damagePercent: balanceConfig.equipment.skillMythics.bloodHeart.burstPercent, critical: false });
    }
    targetDamageTakenBonusPercent = result.targetDamageTakenBonusPercent;
    bloodBrandBurst = result.ascensionDamageEvents.some((event) => event.id === "血祭印記");
    repeatedArmorBreakBonusPercent = result.repeatedArmorBreakBonusPercent;
    if (hasMythic("skill-warrior-executioner")) {
      if (name === "泰坦斷界斬") battle.executionEnergyRemainder = 0;
      const earned = Math.max(0, battle.combat.session.charge.ultimateEnergy - energyBefore);
      const quarters = earned + battle.executionEnergyRemainder;
      battle.executionEnergyRemainder = quarters % 4;
      if (quarters >= 4) battle.combat.session = { ...battle.combat.session,
        charge: grantUltimateEnergy(battle.combat.session.charge, Math.floor(quarters / 4)) };
    }
    damagePercent = percent(result.effectiveBaseDamagePercent * (1 + result.bonusDamagePercent / 100));
    for (const [extraIndex, extra] of result.extraDamagePercents.entries()) {
      if (!hits.some((part) => part.hit) || random() * 100 >= options.hitChance) continue;
      const extraDamage = extra * (random() * 100 < critChance ? 1 + options.criticalDamage / 100 : 1);
      damagePercent += extraDamage;
      if (result.ascensionDamageEvents[extraIndex]?.id === "地脈崩裂") groundShockDamagePercent += extraDamage;
      if (result.ascensionDamageEvents[extraIndex]?.id === "天地斷絕") {
        titanSlashHits += 1;
        titanSlashIndex = Math.min(3, 3 - result.combat.buffs.titanSlashesRemaining);
      }
    }
    if (battle.fallenCityDamagePending > 0) {
      const extra = battle.fallenCityDamagePending;
      battle.fallenCityDamagePending = 0;
      if (hits.some((part) => part.hit)) {
        const checked = trySkillProc(battle.combat.session,
          { id: "skill-warrior-fallen-city", kind: "damage", source: "primary", family: "equipment" });
        battle.combat.session = checked.session;
        if (checked.allowed) damagePercent += 100 * extra / Math.max(1, options.attack);
      }
    }
    lifestealPercent = result.lifestealPercent;
    statuses.push(...result.statusApplications.map((item) => item.kind));
    ticks = result.dueTicks;
  } else if (battle.characterClass === "遊俠") {
    const result = resolveRangerTurn(battle.combat as RangerCombat, {
      skill: (name ?? "normal") as Parameters<typeof resolveRangerTurn>[1]["skill"],
      hits, now: options.now,
      ascended: battle.ascended as ReadonlySet<Exclude<Parameters<typeof resolveRangerTurn>[1]["skill"], "normal">>,
      roll: random, equippedItems: options.equippedItems,
    });
    if (!result) throw new Error("Ranger action and charge queue disagree");
    tailwindChargeRecovered = result.tailwindChargeReductionTriggered;
    starbreakChargeRecovered = name === "破星狙擊" && result.attackChargeRecovered > 0;
    battle.combat = result.combat;
    if (name) battle.hunterEyeCritDamagePending = false;
    if (battle.queenCarry > 0 && hasMythic("skill-ranger-queen-contract")
        && result.statusApplications.some((item) => item.kind === "hunterMark")) {
      (battle.combat as RangerCombat).hunterMarkCriticalHits = battle.queenCarry;
      battle.queenCarry = 0;
    }
    const segmentDamages = result.damageSegmentPercents.map((value, index) =>
      percent(value * (1 + result.damageBonusPercent / 100) +
        (result.criticalDirectDamageBonusPercentBySegment[index] ?? 0) +
        (index === 8 ? result.mainArrowDamageBonusPercent : 0), index));
    damagePercent = segmentDamages.reduce((sum, value) => sum + value, 0);
    if (name === "疾風連射") hits.forEach((part, index) =>
      volleyArrows.push({ ...part, damagePercent: segmentDamages[index] ?? 0, sixth: false }));
    if (name === "蒼穹箭雨") hits.forEach((part, index) =>
      skyArrows.push({ ...part, damagePercent: segmentDamages[index] ?? 0 }));
    if (name === null) damagePercent *= 1 - result.normalDamagePenaltyPercent / 100;
    for (const extra of [...result.additionalArrowEvents, ...result.hunterExplosionEvents,
      ...result.passiveDamageProcs]) {
      const extraHit = random() * 100 < options.hitChance;
      const extraCritical = extraHit && random() * 100 < critChance;
      const extraDamage = extraHit ? extra.percent
        * (extra.id === "死亡鎖定" && hasMythic("skill-ranger-queen-contract") ? 1.5 : 1)
        * (extraCritical ? 1 + options.criticalDamage / 100 : 1) : 0;
      damagePercent += extraDamage;
      if (extra.id === "六重風葬") volleyArrows.push({ hit: extraHit, critical: extraCritical, damagePercent: extraDamage, sixth: true });
      if (extra.id === "風痕追獵") tailwindEcho = { hit: extraHit, critical: extraCritical, damagePercent: extraDamage };
      if (extra.id === "死亡鎖定") hunterExplosion = { hit: extraHit, critical: extraCritical, damagePercent: extraDamage };
    }
    if (result.hunterExplosionEvents.length && hasMythic("skill-ranger-queen-contract"))
      battle.queenCarryForNextTarget = true;
    const rangerCombat = battle.combat as RangerCombat;
    const mark = rangerCombat.session.enemy.hunterMark;
    if (mark || rangerCombat.hunterExplosionPending) hunterMark = {
      expiresAt: mark?.expiresAt ?? options.now,
      criticals: rangerCombat.hunterExplosionPending ? 3 : Math.min(3, rangerCombat.hunterMarkCriticalHits),
      pending: rangerCombat.hunterExplosionPending,
      ascended: battle.ascended.has("獵殺標記"),
      activated: result.statusApplications.some((item) => item.kind === "hunterMark"),
      criticalHit: Boolean(mark) && hits.some((part) => part.hit && part.critical),
    };
    if (critical && (battle.build.ranks["鷹眼"] ?? 0) > 0
        && hasMythic("skill-ranger-hunter-eye") && random() < 0.2) {
      const checked = trySkillProc(battle.combat.session,
        { id: "skill-ranger-hunter-eye", kind: "damage", source: "primary", family: "equipment" });
      battle.combat.session = checked.session;
      if (checked.allowed && random() * 100 < options.hitChance) {
        const extraCritical = random() * 100 < critChance;
        damagePercent += 60 * (extraCritical ? 1 + options.criticalDamage / 100 : 1);
        if (extraCritical) battle.hunterEyeCritDamagePending = true;
      }
    }
    defenseIgnore += result.ignoreDefensePercent;
    statuses.push(...result.statusApplications.map((item) => item.kind));
    ticks = result.dueTicks;
  } else {
    const result = resolveMageTurn(battle.combat as MageCombat, {
      skill: (name ?? "normal") as Parameters<typeof resolveMageTurn>[1]["skill"],
      hits, now: options.now,
      ascended: battle.ascended as ReadonlySet<Exclude<Parameters<typeof resolveMageTurn>[1]["skill"], "normal">>,
      roll: random, equippedItems: options.equippedItems, attackSnapshot: options.attack,
      burnAttackSnapshot: battle.dotAttack.burn,
      finalExplosionConfirmed: name === "星界寂滅",
    });
    if (!result) throw new Error("Mage action and charge queue disagree");
    battle.combat = result.combat;
    if (result.equipmentBurnDetonationDamage > 0) equipmentHits.push({ label: "冰火悖論", critical: false,
      damagePercent: result.equipmentBurnDetonationDamage * 100 / Math.max(1, options.attack) });
    const akashaEquipped = (battle.build.ranks["奧術循環"] ?? 0) > 0
      && hasMythic("skill-mage-akasha-pages");
    const replayReady = akashaEquipped && battle.akashaReady && Boolean(name)
      && hits.some((part) => part.hit) && result.damageSegmentPercents.length > 0;
    const segments = result.damageSegmentPercents;
    const bonus = result.conditionalDamageBonusPercent + result.voidAscensionDamageBonusPercent +
      result.equipmentSkillDamageBonusPercent +
      result.shieldAscensionDamageBonusPercent;
    const originalPercents = segments.map((value, index) => percent(value * (1 + bonus / 100) * result.passiveDirectDamageMultiplier * (1 + result.skillEfficiencyBonusPercent / 100) * (1 - result.skillDamagePenaltyPercent / 100) *
      (index === segments.length - 1 && name === "星界寂滅"
        ? 1 + result.finalExplosionDamageBonusPercent / 100 : 1), index));
    damagePercent = originalPercents.reduce((sum, value) => sum + value, 0);
    if (name === "星界寂滅") hits.forEach((part, index) => astralSegments.push({ ...part,
      damagePercent: originalPercents[index] ?? 0, label: index === 6 ? "寂滅尾爆" : "星界光束" }));
    if (name === "閃電鏈") {
      for (let index = 0; index < hits.length; index++) lightningSegments.push({ ...hits[index],
        damagePercent: percent(segments[index] * (1 + bonus / 100) * result.passiveDirectDamageMultiplier
          * (1 + result.skillEfficiencyBonusPercent / 100) * (1 - result.skillDamagePenaltyPercent / 100), index) });
    }
    if (replayReady) {
      const checked = trySkillProc(battle.combat.session,
        { id: "skill-mage-akasha-pages", kind: "damage", source: "primary", family: "equipment" });
      battle.combat.session = checked.session;
      if (checked.allowed) {
        damagePercent += damagePercent * 0.6;
        battle.akashaReady = false;
        battle.akashaStacks = 0;
      }
    } else if (akashaEquipped && !battle.akashaReady && name && hits.some((part) => part.hit)) {
      battle.akashaStacks++;
      if (battle.akashaStacks >= 4) battle.akashaReady = true;
    }
    for (const extra of [...result.ascensionDamageEvents, ...result.equipmentDamageEvents,
      ...result.passiveDamageProcs]) {
      if (extra.id === "餘燼回響") {
        battle.emberEchoes.push({ at: options.now + 180, attack: options.attack, percent: extra.percent,
          hitChance: options.hitChance, critChance, critDamage: options.criticalDamage, roll: random });
      } else {
        const extraHit = random() * 100 < options.hitChance;
        const extraCritical = extraHit && (("guaranteedCritical" in extra && extra.guaranteedCritical) || random() * 100 < critChance);
        const extraPercent = extraHit ? extra.percent * (extraCritical ? 1 + options.criticalDamage / 100 : 1) : 0;
        damagePercent += extraPercent;
        if (name === "星界寂滅") astralSegments.push({ hit: extraHit, critical: extraCritical, damagePercent: extraPercent, label: extra.id });
        if (extra.id === "雷環共鳴") lightningSegments.push({ hit: extraHit, critical: extraCritical, damagePercent: extraPercent });
        if (extra.id === "極炎霜爆") frostfireAfterburst = { hit: extraHit, critical: extraCritical, damagePercent: extraPercent };
        if (extra.id === "天火墜星") meteorAfterburst = { hit: extraHit, critical: extraCritical, damagePercent: extraPercent };
      }
    }
    if (name === "星界寂滅") {
      const originals = astralSegments.slice(0, 7);
      const sum = originals.reduce((value, part) => value + part.damagePercent, 0);
      const extras = astralSegments.slice(7).reduce((value, part) => value + part.damagePercent, 0);
      const scale = sum > 0 ? (damagePercent - extras) / sum : 1;
      originals.forEach(part => { part.damagePercent *= scale; });
    }
    if (name === "閃電鏈") {
      const original = lightningSegments.slice(0, 3);
      const originalTotal = original.reduce((sum, part) => sum + part.damagePercent, 0);
      const extraTotal = lightningSegments.slice(3).reduce((sum, part) => sum + part.damagePercent, 0);
      // Existing equipment additions/replay remain part of the settled original total.
      const scale = originalTotal > 0 ? (damagePercent - extraTotal) / originalTotal : 1;
      original.forEach(part => { part.damagePercent *= scale; });
    }
    statuses.push(...result.statusApplications.map((item) => item.kind));
    ticks = result.dueTicks;
  }
  // Settle ticks due before this cast refreshes a status. They belong to the
  // previous attack snapshot, even when the refreshed status has the same kind.
  const dueTickDamage = ticks.map((tick) => ({ kind: tick.kind, damage: liveTickDamage(battle, tick) }));
  if (targetDamageTakenBonusPercent > 0) {
    damagePercent *= 1 + targetDamageTakenBonusPercent / 100;
    groundShockDamagePercent *= 1 + targetDamageTakenBonusPercent / 100;
  }
  // Equipment additions are secondary damage, never another primary event:
  // no charge, status application, or recursive passive/equipment trigger.
  for (const extra of equipmentHits) {
    extra.damagePercent *= 1 + targetDamageTakenBonusPercent / 100;
    damagePercent += extra.damagePercent;
  }
  if (battle.characterClass === "遊俠") {
    const consumePiercer = battle.skyPiercerNextAttack && hasMythic("skill-ranger-sky-piercer");
    battle.skyPiercerNextAttack = name === "穿雲箭" && hits.some(part => part.hit) && hasMythic("skill-ranger-sky-piercer");
    if (consumePiercer) {
      const multiplier = 1 + balanceConfig.equipment.skillMythics.skyPiercer.nextAttackBonusPercent / 100;
      damagePercent *= multiplier;
      for (const arrow of [...volleyArrows, ...skyArrows]) arrow.damagePercent *= multiplier;
      if (tailwindEcho) tailwindEcho.damagePercent *= multiplier;
      if (hunterExplosion) hunterExplosion.damagePercent *= multiplier;
    }
  }
  for (const kind of statuses) if (kind === "bleed" || kind === "burn")
    battle.dotAttack[kind] = options.attack;
  const bloodBrandExpiresAt = battle.characterClass === "戰士"
    ? (battle.combat as WarriorCombat).session.enemy.bloodBrand?.expiresAt ?? null : null;
  return { name, hits, damagePercent, defenseIgnore, lifestealPercent, bloodRoarEmpowered, stanceEmpowered,
    statuses, ticks: dueTickDamage, critical, bloodBrandExpiresAt, bloodBrandBurst,
    repeatedArmorBreakBonusPercent, titanSlashHits, titanSlashIndex, groundShockDamagePercent,
    tailwindEcho, tailwindChargeRecovered, hunterMark, hunterExplosion, frostfireAfterburst, meteorAfterburst, lightningSegments, volleyArrows, starbreakChargeRecovered, skyArrows, astralSegments, equipmentHits, currentHealthCostPercent, bloodRoarActivated };
}

export function resolveLiveEnemyAttack(
  battle: LiveCombatBattle, input: { healthPercent: number; maxHealth: number; damage: number;
    baseDodgeChance?: number; defense?: number;
    equippedItems?: { mythicId?: string; legendaryId?: string; name?: string }[]; roll?: () => number },
): { damage: number; counterDamagePercent: number; blocked: boolean; dodged: boolean;
  equipmentDamage?: number;
  phantomStep?: PhantomStepEvent;
  manaShield?: { activated: boolean; absorbed: boolean; broke: boolean; stacked: boolean };
  unyielding: { enabled: boolean; activated: boolean; active: boolean; blocked: boolean; countered: boolean;
    remainingEnemyAttacks: number; ascendedCounterStacks: number } | null } {
  const random = input.roll ?? Math.random;
  if (battle.characterClass === "戰士") {
    const outcome = recordWarriorEnemyAttack(battle.combat as WarriorCombat, {
      segments: 1, healthPercent: input.healthPercent, ascended: battle.ascended.has("不屈戰意"),
    });
    battle.combat = outcome.combat;
    const unyielding = {
      enabled: (outcome.combat.build.ranks["不屈戰意"] ?? 0) > 0,
      activated: Boolean(outcome.activation),
      active: outcome.activeForAttack,
      blocked: false,
      countered: false,
      remainingEnemyAttacks: outcome.activeForAttack ? outcome.combat.defense.activeAttacksRemaining + 1 : 0,
      ascendedCounterStacks: outcome.combat.defense.ascendedCounterStacks,
    };
    if (random() * 100 < (input.baseDodgeChance ?? 0))
      return { damage: 0, counterDamagePercent: 0, blocked: false, dodged: true, unyielding };
    const blocked = outcome.combat.defense.guaranteedBlockPending ||
      random() * 100 < outcome.blockChancePercent + outcome.passive.blockChancePoints;
    if (blocked) {
      battle.combat = recordWarriorSuccessfulBlock(battle.combat as WarriorCombat, battle.ascended.has("不屈戰意")).combat;
      if (hasCatalogItem(input.equippedItems ?? [], "skill-warrior-fallen-city"))
        battle.fallenCityDamagePending = Math.max(0, input.defense ?? 0) * 1.5;
      if (random() * 100 < outcome.counterChancePercent) {
        const counter = recordWarriorCounter(battle.combat as WarriorCombat);
        battle.combat = counter.combat;
        unyielding.blocked = outcome.activeForAttack;
        unyielding.countered = outcome.activeForAttack;
        unyielding.ascendedCounterStacks = counter.combat.defense.ascendedCounterStacks;
        return { damage: 0, counterDamagePercent: 100 + counter.damageBonusPercent, blocked: true, dodged: false, unyielding };
      }
    }
    unyielding.blocked = blocked && outcome.activeForAttack;
    return { damage: blocked ? 0 : Math.round(input.damage *
      (1 - outcome.passive.incomingDamageReductionPercent / 100)), counterDamagePercent: 0, blocked, dodged: false, unyielding };
  }
  if (battle.characterClass === "遊俠") {
    const outcome = recordRangerEnemyAttack(battle.combat as RangerCombat, {
      segments: 1, healthPercent: input.healthPercent, canActivateFromHealth: true,
      ascended: battle.ascended.has("幻影步"),
    });
    battle.combat = outcome.combat;
    const dodged = outcome.guaranteedDodgeForAttack || random() * 100 < Math.min(100,
      outcome.dodgeChancePoints + (input.baseDodgeChance ?? 0));
    const dodge = dodged ? recordRangerSuccessfulDodge(battle.combat as RangerCombat, {
      phantomStepActive: outcome.phantomActiveForAttack, ascended: battle.ascended.has("幻影步"),
    }) : null;
    if (dodge) battle.combat = dodge.combat;
    return { damage: dodged ? 0 : input.damage, counterDamagePercent: 0, blocked: false, dodged, unyielding: null,
      phantomStep: { activated: Boolean(outcome.activation),
        dodged: dodged && outcome.phantomActiveForAttack,
        guaranteedConsumed: Boolean(dodge?.consumedGuaranteedDodge) } };
  }
  if (random() * 100 < (input.baseDodgeChance ?? 0))
    return { damage: 0, counterDamagePercent: 0, blocked: false, dodged: true, unyielding: null };
  const combat = battle.combat as MageCombat;
  const activation = tryActivateMageShield(combat, {
    currentHealth: input.maxHealth * input.healthPercent / 100,
    maxHealth: input.maxHealth,
    ascended: battle.ascended.has("魔力護盾"),
  });
  battle.combat = activation.combat;
  const shielded = recordMageIncomingAttack(battle.combat as MageCombat, [input.damage], {
    maxHealth: input.maxHealth, roll: random,
  });
  battle.combat = shielded.combat;
  return { damage: shielded.remainingDamage, counterDamagePercent: 0, blocked: false, dodged: false, unyielding: null,
    equipmentDamage: shielded.shieldBroke && hasCatalogItem(input.equippedItems ?? [], "skill-mage-eternal-core")
      ? input.maxHealth * balanceConfig.equipment.skillMythics.eternalCore.maxHealthBurstPercent / 100 : 0,
    manaShield: { activated: activation.activated, absorbed: shielded.absorbedDamage > 0,
      broke: shielded.shieldBroke, stacked: shielded.passiveShieldActivated } };
}
