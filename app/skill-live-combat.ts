// Live adapter for the existing tower and boss HP settlement.
// Combat rules own charge, status and passive state; the caller owns HP, rewards and visuals.
import { enabledAscensions, type SkillAscensionState } from "./skill-ascensions";
import { advanceCombatSession, takeReadySkill } from "./skill-combat-session";
import { calculateDebuffTickRawDamage, type DebuffTick } from "./skill-debuff-timer";
import { createWarriorCombat, resolveWarriorTurn, transitionWarriorNormalKill, type WarriorCombat } from "./skill-warrior-combat";
import { createRangerCombat, resolveRangerTurn, transitionRangerNormalKill, type RangerCombat } from "./skill-ranger-combat";
import { createMageCombat, resolveMageTurn, transitionMageCombat, type MageCombat } from "./skill-mage-combat";
import { recordWarriorEnemyAttack, recordWarriorSuccessfulBlock, recordWarriorCounter } from "./skill-warrior-defense";
import { recordRangerEnemyAttack, recordRangerSuccessfulDodge } from "./skill-ranger-defense";
import { recordMageIncomingAttack, tryActivateMageShield } from "./skill-mage-shield";
import { rangerPassiveStats } from "./skill-ranger-passives";
import { warriorPassiveDefenses } from "./skill-warrior-passives";
import { magePassiveStats } from "./skill-mage-passives";
import { restoreSkillBuild, SKILL_REWORK_CATALOG, type SkillBuild, type SkillClass } from "./skill-rework";
import type { PrimaryAttackEvent } from "./skill-combat-queue";

export type LiveCombatBattle = {
  owner: string | object; signature: string; target: string;
  characterClass: SkillClass; build: SkillBuild; ascended: ReadonlySet<string>;
  combat: WarriorCombat | RangerCombat | MageCombat;
  dotAttack: { bleed: number; burn: number };
};
export type LiveCombatAction = {
  name: string | null; hits: PrimaryAttackEvent["hits"];
  damagePercent: number; defenseIgnore: number; lifestealPercent: number;
  statuses: string[]; ticks: number[]; critical: boolean;
};
type AttackOptions = { now: number; healthPercent: number; attack: number;
  hitChance: number; criticalChance: number; criticalDamage: number; roll?: () => number };

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
    }
    return previous;
  }
  return { owner, target, signature, characterClass, build: canonical,
    ascended: new Set(enabledAscensions(ascensions, characterClass)),
    combat: createCombat(characterClass, canonical, level), dotAttack: { bleed: 0, burn: 0 } };
}

export function nextLiveSkill(battle: LiveCombatBattle): string | null {
  const blocked = battle.characterClass === "法師"
    && (battle.combat as MageCombat).overload.phase !== "idle" ? new Set(["奧術超載"]) : new Set<string>();
  return takeReadySkill(battle.combat.session, true, blocked)?.skill ?? null;
}

export function liveCombatSpeedBonus(battle: LiveCombatBattle): number {
  if (battle.characterClass === "遊俠")
    return (battle.combat as RangerCombat).windDomain.remainingActions > 0
        ? ([12, 16, 20, 24, 30][(battle.combat as RangerCombat).windDomain.rank - 1] ?? 0) : 0;
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

export function advanceLiveCombat(battle: LiveCombatBattle, now: number): number[] {
  const next = advanceCombatSession(battle.combat.session, now);
  battle.combat = { ...battle.combat, session: next.session } as LiveCombatBattle["combat"];
  return next.ticks.map((tick) => liveTickDamage(battle, tick));
}

function liveTickDamage(battle: LiveCombatBattle, tick: DebuffTick): number {
  return calculateDebuffTickRawDamage(tick, battle.dotAttack[tick.kind]);
}

function segmentCount(name: string | null): number {
  return name === "疾風連射" ? 5 : name === "蒼穹箭雨" ? 9
    : name === "奧術飛彈" ? 3 : name === "奧術超載" ? 0 : 1;
}

export function resolveLiveCombatAttack(battle: LiveCombatBattle, options: AttackOptions): LiveCombatAction {
  const name = nextLiveSkill(battle);
  const random = options.roll ?? Math.random;
  const critChance = Math.min(100, options.criticalChance);
  const hits = Array.from({ length: segmentCount(name) }, () => {
    const hit = random() * 100 < options.hitChance;
    return { hit, critical: hit && random() * 100 < critChance };
  });
  const critical = hits.some((part) => part.hit && part.critical);
  const percent = (value: number, index = 0) => hits[index]?.hit
    ? value * (hits[index]?.critical ? 1 + options.criticalDamage / 100 : 1) : 0;
  const statuses: string[] = [];
  let damagePercent = 0;
  let defenseIgnore = battle.combat.session.enemy.armorBreak?.strength ?? 0;
  let lifestealPercent = 0;
  let ticks: DebuffTick[] = [];
  if (battle.characterClass === "戰士") {
    const result = resolveWarriorTurn(battle.combat as WarriorCombat, {
      skill: (name ?? "normal") as Parameters<typeof resolveWarriorTurn>[1]["skill"],
      hits, now: options.now, healthPercent: options.healthPercent,
      ascended: battle.ascended as ReadonlySet<Parameters<typeof resolveWarriorTurn>[1]["skill"]>,
      roll: random,
    });
    if (!result) throw new Error("Warrior action and charge queue disagree");
    battle.combat = result.combat;
    damagePercent = percent(result.effectiveBaseDamagePercent * (1 + result.bonusDamagePercent / 100));
    for (const extra of result.extraDamagePercents) if (hits.some((part) => part.hit) && random() * 100 < options.hitChance)
      damagePercent += extra * (random() * 100 < critChance ? 1 + options.criticalDamage / 100 : 1);
    lifestealPercent = result.lifestealPercent;
    statuses.push(...result.statusApplications.map((item) => item.kind));
    ticks = result.dueTicks;
  } else if (battle.characterClass === "遊俠") {
    const result = resolveRangerTurn(battle.combat as RangerCombat, {
      skill: (name ?? "normal") as Parameters<typeof resolveRangerTurn>[1]["skill"],
      hits, now: options.now,
      ascended: battle.ascended as ReadonlySet<Parameters<typeof resolveRangerTurn>[1]["skill"]>,
      roll: random,
    });
    if (!result) throw new Error("Ranger action and charge queue disagree");
    battle.combat = result.combat;
    damagePercent = result.damageSegmentPercents.reduce((sum, value, index) =>
      sum + percent(value * (1 + result.damageBonusPercent / 100) +
        (result.criticalDirectDamageBonusPercentBySegment[index] ?? 0) +
        (index === 8 ? result.mainArrowDamageBonusPercent : 0), index), 0);
    if (name === null) damagePercent *= 1 - result.normalDamagePenaltyPercent / 100;
    for (const extra of [...result.additionalArrowEvents, ...result.hunterExplosionEvents,
      ...result.passiveDamageProcs]) if (random() * 100 < options.hitChance)
      damagePercent += extra.percent * (random() * 100 < critChance ? 1 + options.criticalDamage / 100 : 1);
    defenseIgnore += result.ignoreDefensePercent;
    statuses.push(...result.statusApplications.map((item) => item.kind));
    ticks = result.dueTicks;
  } else {
    const result = resolveMageTurn(battle.combat as MageCombat, {
      skill: (name ?? "normal") as Parameters<typeof resolveMageTurn>[1]["skill"],
      hits, now: options.now,
      ascended: battle.ascended as ReadonlySet<Parameters<typeof resolveMageTurn>[1]["skill"]>,
      roll: random,
    });
    if (!result) throw new Error("Mage action and charge queue disagree");
    battle.combat = result.combat;
    const segments = result.damageSegmentPercents.length ? result.damageSegmentPercents
      : name === "星界寂滅" ? [result.totalDamagePercent] : [];
    const bonus = result.conditionalDamageBonusPercent + result.voidAscensionDamageBonusPercent +
      result.skillEfficiencyBonusPercent - result.skillDamagePenaltyPercent +
      result.passiveDirectDamageBonusPercent + result.equipmentSkillDamageBonusPercent +
      result.shieldAscensionDamageBonusPercent;
    damagePercent = segments.reduce((sum, value, index) => sum + percent(value * (1 + bonus / 100) *
      (index === segments.length - 1 && name === "星界寂滅"
        ? 1 + result.finalExplosionDamageBonusPercent / 100 : 1), index), 0);
    for (const extra of [...result.ascensionDamageEvents, ...result.equipmentDamageEvents,
      ...result.passiveDamageProcs]) if (random() * 100 < options.hitChance)
      damagePercent += extra.percent * (("guaranteedCritical" in extra && extra.guaranteedCritical)
        || random() * 100 < critChance ? 1 + options.criticalDamage / 100 : 1);
    statuses.push(...result.statusApplications.map((item) => item.kind));
    ticks = result.dueTicks;
  }
  for (const kind of statuses) if (kind === "bleed" || kind === "burn")
    battle.dotAttack[kind] = options.attack;
  return { name, hits, damagePercent, defenseIgnore, lifestealPercent,
    statuses, ticks: ticks.map((tick) => liveTickDamage(battle, tick)), critical };
}

export function resolveLiveEnemyAttack(
  battle: LiveCombatBattle, input: { healthPercent: number; maxHealth: number; damage: number;
    baseDodgeChance?: number; roll?: () => number },
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
