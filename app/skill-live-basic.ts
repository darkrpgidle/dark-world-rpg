// The first live rework casts share the existing HP and victory settlement.
// Only equipped basic skills are supported until the other actions have a live adapter.
import type { SkillBuild, SkillClass } from "./skill-rework";
import { createSkillCombatState, consumeReadySkill, recordPrimaryAttack, type SkillCombatState } from "./skill-combat-queue";
import { WARRIOR_ACTIVE_RULES } from "./skill-warrior-rules";
import { RANGER_ACTIVE_RULES } from "./skill-ranger-rules";
import { MAGE_ACTIVE_RULES } from "./skill-mage-rules";

export type LiveBasicName = "裂地斬" | "穿雲箭" | "霜火新星";
export type LiveBasicCast = { name: LiveBasicName; rank: number; multiplier: number; defenseIgnore: number; burnChance: number };
export type LiveBasicBattle = {
  owner: string | object;
  signature: string;
  name: LiveBasicName | null;
  rank: number;
  queue: SkillCombatState;
};

const basics: Record<SkillClass, LiveBasicName> = {
  戰士: "裂地斬", 遊俠: "穿雲箭", 法師: "霜火新星",
};

export function syncLiveBasicBattle(
  previous: LiveBasicBattle | null, owner: string | object, build: SkillBuild, characterClass: SkillClass,
): LiveBasicBattle {
  const signature = JSON.stringify([characterClass, build.activeSlots, build.ranks]);
  if (previous && previous.owner === owner && previous.signature === signature) return previous;
  const basic = basics[characterClass];
  const name = build.activeSlots.includes(basic) && (build.ranks[basic] ?? 0) >= 1 ? basic : null;
  const slots: SkillBuild["activeSlots"] = [name, null, null];
  return { owner, signature, name, rank: name ? build.ranks[name] : 0,
    queue: createSkillCombatState({ ranks: build.ranks, activeSlots: slots }, characterClass, null) };
}

export function prepareLiveBasicAttack(battle: LiveBasicBattle): LiveBasicCast | null {
  if (!battle.name) return null;
  const selected = consumeReadySkill(battle.queue, true);
  if (!selected) return null;
  battle.queue = selected.state;
  const rank = battle.rank;
  const name = selected.skill as LiveBasicName;
  if (name === "裂地斬") return { name, rank, multiplier: WARRIOR_ACTIVE_RULES.裂地斬.damage[rank - 1] / 100, defenseIgnore: WARRIOR_ACTIVE_RULES.裂地斬.armorBreak[rank - 1], burnChance: 0 };
  if (name === "穿雲箭") return { name, rank, multiplier: RANGER_ACTIVE_RULES.穿雲箭.damage[rank - 1] / 100, defenseIgnore: RANGER_ACTIVE_RULES.穿雲箭.ignoreDefense[rank - 1], burnChance: 0 };
  return { name, rank, multiplier: MAGE_ACTIVE_RULES.霜火新星.damage[rank - 1] / 100, defenseIgnore: 0, burnChance: MAGE_ACTIVE_RULES.霜火新星.burnChance[rank - 1] };
}

export function finishLiveBasicAttack(battle: LiveBasicBattle, cast: LiveBasicCast | null, hit: boolean, critical = false): void {
  if (!battle.name) return;
  battle.queue = recordPrimaryAttack(battle.queue, {
    kind: cast ? "skill" : "normal", hits: [{ hit, critical: hit && critical }],
  });
}
