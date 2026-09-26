// Warrior active casts on the isolated reworked combat path.
// Caller rolls hit/critical per damage segment and applies actual damage.
import { type SkillBuild } from "./skill-rework";
import {
  advanceCombatSession,
  createSkillCombatSession,
  resolveSkillAction,
  takeReadySkill,
  trySkillProc,
  type SkillCombatSession,
  type StatusApplication,
} from "./skill-combat-session";
import { type PrimaryAttackEvent } from "./skill-combat-queue";
import {
  WARRIOR_ACTIVE_RULES,
  consumeWarriorPrimaryAttack,
  createWarriorBuffState,
  recordWarriorSkillHit,
  triggerWarriorBloodRoar,
  triggerWarriorStance,
  warriorSkillRankValue,
  type WarriorActiveName,
  type WarriorBuffState,
} from "./skill-warrior-rules";
import {
  createWarriorPassiveState,
  resolveWarriorPassiveAttack,
  type WarriorPassiveState,
} from "./skill-warrior-passives";

export type WarriorCombat = {
  session: SkillCombatSession; buffs: WarriorBuffState; passives: WarriorPassiveState; build: SkillBuild;
};

export function createWarriorCombat(build: SkillBuild, level: number): WarriorCombat {
  return {
    session: createSkillCombatSession(build, "戰士", level),
    buffs: createWarriorBuffState(),
    passives: createWarriorPassiveState(),
    build: { ranks: { ...build.ranks }, activeSlots: [...build.activeSlots] },
  };
}

export type WarriorTurnInput = {
  skill: WarriorActiveName | "normal";
  hits: PrimaryAttackEvent["hits"];
  healthPercent: number;
  now: number;
  ascended: ReadonlySet<WarriorActiveName>;
  roll?: () => number;
};

export type WarriorTurnResult = {
  combat: WarriorCombat;
  baseDamagePercent: number;
  bonusDamagePercent: number;
  extraDamagePercents: number[];
  passiveDamageProcs: { id: "堅盾反射" | "泰坦餘震"; percent: number }[];
  lifestealPercent: number;
  attackSpeedBonusPercent: number;
  defensePenaltyPercent: number;
  bleedChancePercent: number;
  statusApplications: StatusApplication[];
  dueTicks: ReturnType<typeof advanceCombatSession>["ticks"];
  clearsOneNegativeStatus: boolean;
  // Exact conversion of repeated armor break to damage is not specified yet.
  repeatedArmorBreakBonusCapPercent: number;
};

export function resolveWarriorTurn(combat: WarriorCombat, input: WarriorTurnInput): WarriorTurnResult | null {
  if (input.skill === "不屈戰意" || input.skill === "鮮血怒吼") return null; // immediate triggers, not player actions
  const settled = advanceCombatSession(combat.session, input.now);
  let session = settled.session;
  const previousArmorBreak = Boolean(session.enemy.armorBreak);
  const previousBleed = Boolean(session.enemy.bleed);
  const marked = Boolean(session.enemy.bloodBrand);
  const successfulHit = input.hits.some((hit) => hit.hit);

  const active = input.skill !== "normal";
  const rank = active ? (combat.build.ranks[input.skill] ?? 0) : 0;
  if (active) {
    if (rank <= 0) return null;
    const selected = takeReadySkill(session, true);
    if (!selected || selected.skill !== input.skill) return null;
    session = selected.session;
  } else if (takeReadySkill(session, true)) {
    return null;
  }

  const roarRank = combat.build.ranks["鮮血怒吼"] ?? 0;
  const newlyTriggeredRoar = roarRank > 0
    ? triggerWarriorBloodRoar(combat.buffs, roarRank, input.healthPercent, input.ascended.has("鮮血怒吼"))
    : null;
  let buffs = newlyTriggeredRoar ?? combat.buffs;
  const rule = active ? WARRIOR_ACTIVE_RULES[input.skill] : null;
  const baseDamagePercent = rule && "damage" in rule ? warriorSkillRankValue(rule.damage, rank) : active ? 0 : 100;
  const statusApplications: StatusApplication[] = [];
  let bleedChancePercent = 0;
  if (successfulHit && rule && "armorBreak" in rule) {
    statusApplications.push({ kind: "armorBreak", strength: warriorSkillRankValue(rule.armorBreak, rank) });
  }
  if (successfulHit && input.skill === "血刃斬") {
    const brandRank = combat.build.ranks["血戰烙印"] ?? 0;
    bleedChancePercent = warriorSkillRankValue(WARRIOR_ACTIVE_RULES.血刃斬.bleedChance, rank)
      + (input.ascended.has("血刃斬") && previousBleed ? 15 : 0)
      + (marked && brandRank > 0 ? warriorSkillRankValue(WARRIOR_ACTIVE_RULES.血戰烙印.bleedChanceBonus, brandRank) : 0);
    if ((input.roll ?? Math.random)() * 100 < bleedChancePercent) {
      statusApplications.push({ kind: "bleed", ascendedBleed: input.ascended.has("血刃斬") });
    }
  }
  if (successfulHit && input.skill === "血戰烙印") statusApplications.push({ kind: "bloodBrand", level: rank });

  const passive = resolveWarriorPassiveAttack(combat.passives, combat.build, {
    kind: active ? "skill" : "normal",
    category: rule?.category,
    hit: successfulHit,
    targetBleeding: previousBleed,
    targetArmorBroken: previousArmorBreak,
    healthPercent: input.healthPercent,
    isUltimate: input.skill === "泰坦斷界斬",
    ascendedBleed: input.ascended.has("血刃斬"),
    roll: input.roll ?? Math.random,
  });
  statusApplications.push(...passive.statuses);

  // Buffs already present at the start of this action are consumed once. A
  // newly cast stance starts after this action, lasting eight later actions.
  const modifiers = consumeWarriorPrimaryAttack(buffs, statusApplications.some((status) => status.kind === "bleed" || status.kind === "armorBreak"));
  buffs = modifiers.state;
  const action = resolveSkillAction(session, {
    kind: active ? "skill" : "normal", hits: input.hits, successfulStatuses: statusApplications,
  }, input.now);
  session = action.session;
  const passiveDamageProcs: WarriorTurnResult["passiveDamageProcs"] = [];
  for (const candidate of passive.damageCandidates) {
    const result = trySkillProc(session, { id: candidate.id, kind: "damage", source: "primary", family: "passive" });
    session = result.session;
    if (result.allowed) passiveDamageProcs.push(candidate);
  }
  if (successfulHit && active) {
    buffs = recordWarriorSkillHit(buffs, input.skill, previousArmorBreak, input.ascended.has(input.skill));
  }
  if (input.skill === "狂戰姿態") buffs = triggerWarriorStance(buffs, rank, input.ascended.has("狂戰姿態"));

  return {
    combat: { ...combat, session, buffs, passives: passive.state },
    baseDamagePercent,
    bonusDamagePercent: modifiers.damageBonusPercent + passive.damageBonusPercent,
    extraDamagePercents: [...modifiers.extraDamagePercents, ...passiveDamageProcs.map((proc) => proc.percent)],
    passiveDamageProcs,
    lifestealPercent: modifiers.lifestealPercent + passive.lifestealPercent,
    attackSpeedBonusPercent: modifiers.attackSpeedBonusPercent,
    defensePenaltyPercent: modifiers.defensePenaltyPercent,
    bleedChancePercent,
    statusApplications,
    dueTicks: [...settled.ticks, ...action.ticks],
    clearsOneNegativeStatus: Boolean(newlyTriggeredRoar && input.ascended.has("鮮血怒吼")),
    repeatedArmorBreakBonusCapPercent: input.skill === "碎甲猛擊" && previousArmorBreak && input.ascended.has("碎甲猛擊") ? 60 : 0,
  };
}
