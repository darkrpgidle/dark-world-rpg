// Live adapter for the existing tower and boss HP settlement.
// Combat rules own charge, status and passive state; the caller owns HP, rewards and visuals.
import { enabledAscensions, type SkillAscensionState } from "./skill-ascensions";
import { advanceCombatSession, takeReadySkill, trySkillProc } from "./skill-combat-session";
import { grantUltimateEnergy } from "./skill-combat-queue";
import { hasCatalogItem } from "./mythic-data";
import { calculateDebuffTickRawDamage, type DebuffTick } from "./skill-debuff-timer";
import { createWarriorCombat, resolveWarriorTurn, transitionWarriorNormalKill, type WarriorCombat } from "./skill-warrior-combat";
import { createRangerCombat, resolveRangerTurn, transitionRangerNormalKill, type RangerCombat } from "./skill-ranger-combat";
import { createMageCombat, resolveMageTurn, transitionMageCombat, type MageCombat } from "./skill-mage-combat";
import { recordWarriorEnemyAttack, recordWarriorSuccessfulBlock, recordWarriorCounter } from "./skill-warrior-defense";
import { recordRangerEnemyAttack, recordRangerSuccessfulDodge } from "./skill-ranger-defense";
import { recordMageIncomingAttack, tryActivateMageShield } from "./skill-mage-shield";
import { rangerPassiveStats } from "./skill-ranger-passives";
import { RANGER_ACTIVE_RULES, RANGER_PASSIVE_RULES, rangerSkillRankValue } from "./skill-ranger-rules";
import { warriorPassiveDefenses } from "./skill-warrior-passives";
import { magePassiveStats } from "./skill-mage-passives";
import { MAGE_ACTIVE_RULES } from "./skill-mage-rules";
import { restoreSkillBuild, SKILL_REWORK_CATALOG, type SkillBuild, type SkillClass } from "./skill-rework";
import type { PrimaryAttackEvent } from "./skill-combat-queue";

export type LiveCombatBattle = {
  owner: string | object; signature: string; target: string;
  characterClass: SkillClass; build: SkillBuild; ascended: ReadonlySet<string>;
  combat: WarriorCombat | RangerCombat | MageCombat;
  dotAttack: { bleed: number; burn: number };
  fallenCityDamagePending: number; hunterEyeCritDamagePending: boolean;
  queenCarryForNextTarget: boolean; queenCarry: number;
  akashaStacks: number; akashaReady: boolean; executionEnergyRemainder: number;
};
export type LiveCombatAction = {
  name: string | null; hits: PrimaryAttackEvent["hits"];
  damagePercent: number; defenseIgnore: number; lifestealPercent: number;
  statuses: string[]; ticks: LiveDotDamageEvent[]; critical: boolean;
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
    executionEnergyRemainder: 0 };
}

export function nextLiveSkill(battle: LiveCombatBattle): string | null {
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
  if (battle.characterClass === "戰士") return warriorPassiveDefenses(battle.build, 100).maxHealthBonusPercent;
  if (battle.characterClass === "法師") return magePassiveStats(battle.build).maxHealthBonusPercent;
  return 0;
}

export type LiveDotDamageEvent = { kind: "bleed" | "burn"; damage: number };

export function advanceLiveCombatEvents(battle: LiveCombatBattle, now: number): LiveDotDamageEvent[] {
  const next = advanceCombatSession(battle.combat.session, now);
  battle.combat = { ...battle.combat, session: next.session } as LiveCombatBattle["combat"];
  return next.ticks.map((tick) => ({ kind: tick.kind, damage: liveTickDamage(battle, tick) }));
}

export function advanceLiveCombat(battle: LiveCombatBattle, now: number): number[] {
  return advanceLiveCombatEvents(battle, now).map((event) => event.damage);
}

function liveTickDamage(battle: LiveCombatBattle, tick: DebuffTick): number {
  return calculateDebuffTickRawDamage(tick, battle.dotAttack[tick.kind]);
}

function segmentCount(name: string | null): number {
  return name === "疾風連射" ? 5 : name === "蒼穹箭雨" ? 9
    : name === "奧術飛彈" ? 3 : name === "星界寂滅" ? MAGE_ACTIVE_RULES.星界寂滅.beamCount + 1
    : name === "奧術超載" ? 0 : 1;
}

export function resolveLiveCombatAttack(battle: LiveCombatBattle, options: AttackOptions): LiveCombatAction {
  const name = nextLiveSkill(battle);
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
  const hits = Array.from({ length: segmentCount(name) }, () => {
    const hit = random() * 100 < options.hitChance;
    return { hit, critical: hit && random() * 100 < critChance };
  });
  const critical = hits.some((part) => part.hit && part.critical);
  const percent = (value: number, index = 0) => hits[index]?.hit
    ? value * (hits[index]?.critical ? 1 + criticalDamage / 100 : 1) : 0;
  const statuses: string[] = [];
  let damagePercent = 0;
  let defenseIgnore = battle.combat.session.enemy.armorBreak?.strength ?? 0;
  let lifestealPercent = 0;
  let ticks: DebuffTick[] = [];
  if (battle.characterClass === "戰士") {
    const result = resolveWarriorTurn(battle.combat as WarriorCombat, {
      skill: (name ?? "normal") as Parameters<typeof resolveWarriorTurn>[1]["skill"],
      hits, now: options.now, healthPercent: options.healthPercent,
      ascended: battle.ascended as ReadonlySet<Exclude<Parameters<typeof resolveWarriorTurn>[1]["skill"], "normal">>,
      roll: random,
    });
    if (!result) throw new Error("Warrior action and charge queue disagree");
    battle.combat = result.combat;
    if (hasMythic("skill-warrior-executioner")) {
      if (name === "泰坦斷界斬") battle.executionEnergyRemainder = 0;
      const earned = Math.max(0, battle.combat.session.charge.ultimateEnergy - energyBefore);
      const quarters = earned + battle.executionEnergyRemainder;
      battle.executionEnergyRemainder = quarters % 4;
      if (quarters >= 4) battle.combat.session = { ...battle.combat.session,
        charge: grantUltimateEnergy(battle.combat.session.charge, Math.floor(quarters / 4)) };
    }
    damagePercent = percent(result.effectiveBaseDamagePercent * (1 + result.bonusDamagePercent / 100));
    for (const extra of result.extraDamagePercents) if (hits.some((part) => part.hit) && random() * 100 < options.hitChance)
      damagePercent += extra * (random() * 100 < critChance ? 1 + options.criticalDamage / 100 : 1);
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
      roll: random,
    });
    if (!result) throw new Error("Ranger action and charge queue disagree");
    battle.combat = result.combat;
    if (name) battle.hunterEyeCritDamagePending = false;
    if (battle.queenCarry > 0 && hasMythic("skill-ranger-queen-contract")
        && result.statusApplications.some((item) => item.kind === "hunterMark")) {
      (battle.combat as RangerCombat).hunterMarkCriticalHits = battle.queenCarry;
      battle.queenCarry = 0;
    }
    damagePercent = result.damageSegmentPercents.reduce((sum, value, index) =>
      sum + percent(value * (1 + result.damageBonusPercent / 100) +
        (result.criticalDirectDamageBonusPercentBySegment[index] ?? 0) +
        (index === 8 ? result.mainArrowDamageBonusPercent : 0), index), 0);
    if (name === null) damagePercent *= 1 - result.normalDamagePenaltyPercent / 100;
    for (const extra of [...result.additionalArrowEvents, ...result.hunterExplosionEvents,
      ...result.passiveDamageProcs]) if (random() * 100 < options.hitChance)
      damagePercent += extra.percent * (extra.id === "死亡鎖定" && hasMythic("skill-ranger-queen-contract") ? 1.5 : 1)
        * (random() * 100 < critChance ? 1 + options.criticalDamage / 100 : 1);
    if (result.hunterExplosionEvents.length && hasMythic("skill-ranger-queen-contract"))
      battle.queenCarryForNextTarget = true;
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
      roll: random, equippedItems: options.equippedItems,
      finalExplosionConfirmed: name === "星界寂滅",
    });
    if (!result) throw new Error("Mage action and charge queue disagree");
    battle.combat = result.combat;
    const akashaEquipped = (battle.build.ranks["奧術循環"] ?? 0) > 0
      && hasMythic("skill-mage-akasha-pages");
    const replayReady = akashaEquipped && battle.akashaReady && Boolean(name)
      && hits.some((part) => part.hit) && result.damageSegmentPercents.length > 0;
    const segments = result.damageSegmentPercents;
    const bonus = result.conditionalDamageBonusPercent + result.voidAscensionDamageBonusPercent +
      result.skillEfficiencyBonusPercent - result.skillDamagePenaltyPercent +
      result.passiveDirectDamageBonusPercent + result.equipmentSkillDamageBonusPercent +
      result.shieldAscensionDamageBonusPercent;
    damagePercent = segments.reduce((sum, value, index) => sum + percent(value * (1 + bonus / 100) *
      (index === segments.length - 1 && name === "星界寂滅"
        ? 1 + result.finalExplosionDamageBonusPercent / 100 : 1), index), 0);
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
      ...result.passiveDamageProcs]) if (random() * 100 < options.hitChance)
      damagePercent += extra.percent * (("guaranteedCritical" in extra && extra.guaranteedCritical)
        || random() * 100 < critChance ? 1 + options.criticalDamage / 100 : 1);
    statuses.push(...result.statusApplications.map((item) => item.kind));
    ticks = result.dueTicks;
  }
  // Settle ticks due before this cast refreshes a status. They belong to the
  // previous attack snapshot, even when the refreshed status has the same kind.
  const dueTickDamage = ticks.map((tick) => ({ kind: tick.kind, damage: liveTickDamage(battle, tick) }));
  for (const kind of statuses) if (kind === "bleed" || kind === "burn")
    battle.dotAttack[kind] = options.attack;
  return { name, hits, damagePercent, defenseIgnore, lifestealPercent,
    statuses, ticks: dueTickDamage, critical };
}

export function resolveLiveEnemyAttack(
  battle: LiveCombatBattle, input: { healthPercent: number; maxHealth: number; damage: number;
    baseDodgeChance?: number; defense?: number;
    equippedItems?: { mythicId?: string; legendaryId?: string; name?: string }[]; roll?: () => number },
): { damage: number; counterDamagePercent: number; blocked: boolean; dodged: boolean } {
  const random = input.roll ?? Math.random;
  if (battle.characterClass === "戰士") {
    const outcome = recordWarriorEnemyAttack(battle.combat as WarriorCombat, {
      segments: 1, healthPercent: input.healthPercent, ascended: battle.ascended.has("不屈戰意"),
    });
    battle.combat = outcome.combat;
    if (random() * 100 < (input.baseDodgeChance ?? 0))
      return { damage: 0, counterDamagePercent: 0, blocked: false, dodged: true };
    const blocked = outcome.combat.defense.guaranteedBlockPending ||
      random() * 100 < outcome.blockChancePercent + outcome.passive.blockChancePoints;
    if (blocked) {
      battle.combat = recordWarriorSuccessfulBlock(battle.combat as WarriorCombat, battle.ascended.has("不屈戰意")).combat;
      if (hasCatalogItem(input.equippedItems ?? [], "skill-warrior-fallen-city"))
        battle.fallenCityDamagePending = Math.max(0, input.defense ?? 0) * 1.5;
      if (random() * 100 < outcome.counterChancePercent) {
        const counter = recordWarriorCounter(battle.combat as WarriorCombat);
        battle.combat = counter.combat;
        return { damage: 0, counterDamagePercent: 100 + counter.damageBonusPercent, blocked: true, dodged: false };
      }
    }
    return { damage: blocked ? 0 : Math.round(input.damage *
      (1 - outcome.passive.incomingDamageReductionPercent / 100)), counterDamagePercent: 0, blocked, dodged: false };
  }
  if (battle.characterClass === "遊俠") {
    const outcome = recordRangerEnemyAttack(battle.combat as RangerCombat, {
      segments: 1, healthPercent: input.healthPercent, canActivateFromHealth: true,
      ascended: battle.ascended.has("幻影步"),
    });
    battle.combat = outcome.combat;
    const dodged = outcome.guaranteedDodgeForAttack || random() * 100 < Math.min(100,
      outcome.dodgeChancePoints + (input.baseDodgeChance ?? 0));
    if (dodged) battle.combat = recordRangerSuccessfulDodge(battle.combat as RangerCombat, {
      phantomStepActive: outcome.phantomActiveForAttack, ascended: battle.ascended.has("幻影步"),
    }).combat;
    return { damage: dodged ? 0 : input.damage, counterDamagePercent: 0, blocked: false, dodged };
  }
  if (random() * 100 < (input.baseDodgeChance ?? 0))
    return { damage: 0, counterDamagePercent: 0, blocked: false, dodged: true };
  const combat = battle.combat as MageCombat;
  const activation = tryActivateMageShield(combat, {
    currentHealth: input.maxHealth * input.healthPercent / 100,
    maxHealthBeforeMagePassive: input.maxHealth / (1 + magePassiveStats(battle.build).maxHealthBonusPercent / 100),
    ascended: battle.ascended.has("魔力護盾"),
  });
  battle.combat = activation.combat;
  const shielded = recordMageIncomingAttack(battle.combat as MageCombat, [input.damage]);
  battle.combat = shielded.combat;
  return { damage: shielded.remainingDamage, counterDamagePercent: 0, blocked: false, dodged: false };
}
