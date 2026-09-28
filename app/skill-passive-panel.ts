import type { SkillBuild, SkillClass } from "./skill-rework";
import { magePassiveStats } from "./skill-mage-passives";
import { rangerPassiveStats } from "./skill-ranger-passives";
import { warriorPassiveDefenses } from "./skill-warrior-passives";

export type SkillPassivePanelStats = {
  maxHealthBonusPercent: number;
  attackSpeedBonusPercent: number;
  criticalChancePoints: number;
  dodgeChancePoints: number;
  blockChancePoints: number;
  lowHealthDamageReductionPercent: number;
  initialShieldBonusPercent: number;
};

/** Passive bonuses that alter persistent or currently active character-sheet values. */
export function skillPassivePanelStats(
  build: SkillBuild,
  characterClass: SkillClass,
  healthPercent: number,
): SkillPassivePanelStats {
  const empty: SkillPassivePanelStats = {
    maxHealthBonusPercent: 0,
    attackSpeedBonusPercent: 0,
    criticalChancePoints: 0,
    dodgeChancePoints: 0,
    blockChancePoints: 0,
    lowHealthDamageReductionPercent: 0,
    initialShieldBonusPercent: 0,
  };
  if (characterClass === "戰士") {
    const defenses = warriorPassiveDefenses(build, healthPercent);
    return {
      ...empty,
      maxHealthBonusPercent: defenses.maxHealthBonusPercent,
      blockChancePoints: defenses.blockChancePoints,
      lowHealthDamageReductionPercent: defenses.incomingDamageReductionPercent,
    };
  }
  if (characterClass === "遊俠") {
    return { ...empty, ...rangerPassiveStats(build) };
  }
  return { ...empty, ...magePassiveStats(build) };
}
