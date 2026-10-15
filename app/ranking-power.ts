import { saveDisplay } from "./save-field-schema";
import { calculateAssessedCombatPower, normalizeSceneItem, emptyAssessmentTalents, type AssessmentItem } from "./character-power";
import { restoreSkillBuild, type SkillClass } from "./skill-rework";
import { restoreSkillAscensions } from "./skill-ascensions";
import { clampRebirthCount, REBIRTH_REWARD_PER_TURN } from "./rebirth-config";
import { legacyRebirthReward, equippedLegacyRebirthReward } from "./legacy-rebirth-rewards";
import { equippedCosmeticBonuses } from "./cosmetic-bonuses";

// Read-only: rank every saved character with the panel formula, including offline
// characters. Never trust stored combatPower or rewrite combat/save allowances.
export function assessedRankingPower(value: unknown): number {
  const save = saveDisplay(value);
  const cls: SkillClass = save.playerClass === "遊俠" || save.playerClass === "法師" ? save.playerClass : "戰士";
  const level = Math.max(1, Math.min(100, Number(save.level ?? 1)));
  const ids = (save.loadouts as Record<string, number[]>)[save.activeLoadout === 2 ? "2" : "1"];
  const gear = (save.items as Record<string, unknown>[])
    .filter(item => ids.includes(Number(item.id)))
    .map(item => normalizeSceneItem({ ...item,
      id: Number(item.id), name: String(item.name), slot: String(item.slot ?? ""),
      quality: String(item.quality ?? "普通"), enhance: Number(item.enhance) || 0,
      power: Number(item.power) || 0, affixes: item.affixes as string[],
    } as AssessmentItem));
  const talents = { ...emptyAssessmentTalents };
  if (save.rebirthTalents && typeof save.rebirthTalents === "object") {
    const raw = save.rebirthTalents as Record<string, unknown>;
    for (const key of Object.keys(talents) as (keyof typeof talents)[]) {
      const amount = Number(raw[key] ?? 0);
      talents[key] = Number.isFinite(amount) ? Math.max(0, Math.min(5, Math.floor(amount))) : 0;
    }
  }
  const legacyCount = Math.max(0, Math.min(20, Number(save.legacyRebirthCount ?? 0)));
  const legacyReward = legacyRebirthReward(legacyCount);
  const oldTitles = ["beta-reincarnator", "seasoned-reincarnator", "elite-reincarnator", "abyss-reincarnator"];
  const owned = Array.isArray(save.ownedTitles) ? save.ownedTitles : ["none"];
  const available = ["none", ...owned.filter(id => !oldTitles.includes(String(id))), ...legacyReward.unlockedTitleIds];
  const selected = typeof save.selectedTitle === "string" ? save.selectedTitle : legacyReward.titleId ?? "none";
  const title = available.includes(selected) ? selected : legacyReward.titleId ?? "none";
  const legacy = equippedLegacyRebirthReward(legacyCount, title);
  const cosmetics = equippedCosmeticBonuses(title, String(save.selectedAppearance ?? "none"));
  const core = clampRebirthCount(save.rebirthCount) * REBIRTH_REWARD_PER_TURN.coreStats;
  return calculateAssessedCombatPower(cls, level, gear, [],
    restoreSkillBuild(save.skillReworkBuild, cls, level), restoreSkillAscensions(save.skillAscensions, cls),
    { hp: core + talents.survivalHp * 10, attack: core, defense: core + talents.survivalDefense * 10 },
    { attack: legacy.attack + cosmetics.attack, defense: legacy.defense + cosmetics.defense },
    talents, legacy.attackSpeed, cosmetics);
}
