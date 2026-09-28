// Stage 32: accept observed reworked-combat measurements without inventing
// outcomes before the production combat adapter exists.
import { SKILL_REWORK_CATALOG, type SkillClass } from "./skill-rework";

export const SKILL_BALANCE_CLASSES = ["戰士", "遊俠", "法師"] as const;
export const SKILL_BALANCE_LEVELS = [50, 100] as const;
export const SKILL_BALANCE_EQUIPMENT = ["空裝", "傳奇", "神話"] as const;
export const SKILL_BALANCE_ENCOUNTERS = ["普通推圖", "個人首領", "世界首領60秒"] as const;

export type SkillBalanceScenario = {
  characterClass: SkillClass;
  level: 50 | 100;
  equipment: typeof SKILL_BALANCE_EQUIPMENT[number];
  encounter: typeof SKILL_BALANCE_ENCOUNTERS[number];
};

export type SkillBalanceObservation = SkillBalanceScenario & {
  elapsedSeconds: number;
  damageDealt: number;
  maximumHealth: number;
  remainingHealth: number;
  // Count completed primary skill casts, not each hit or equipment/ascension follow-up.
  skillCasts: Record<string, number>;
};

export type SkillBalanceMetrics = {
  damagePerSecond: number;
  remainingHealthPercent: number;
  survived: boolean;
  skillCastsPerMinute: number;
  skillCasts: Record<string, number>;
};

export function skillBalanceScenarios(): SkillBalanceScenario[] {
  return SKILL_BALANCE_CLASSES.flatMap((characterClass) =>
    SKILL_BALANCE_LEVELS.flatMap((level) =>
      SKILL_BALANCE_EQUIPMENT.flatMap((equipment) =>
        SKILL_BALANCE_ENCOUNTERS.map((encounter) => ({ characterClass, level, equipment, encounter }))
      )
    )
  );
}

function scenarioKey(scenario: SkillBalanceScenario): string {
  return [scenario.characterClass, scenario.level, scenario.equipment, scenario.encounter].join("|");
}

export function summarizeSkillBalance(observations: readonly SkillBalanceObservation[]) {
  const scenarios = skillBalanceScenarios();
  const acceptedKeys = new Set(scenarios.map(scenarioKey));
  const measured = new Map<string, SkillBalanceMetrics>();
  for (const observation of observations) {
    const key = scenarioKey(observation);
    if (!acceptedKeys.has(key) || measured.has(key)) throw new RangeError(`Unknown or duplicate balance scenario: ${key}`);
    const { elapsedSeconds, damageDealt, maximumHealth, remainingHealth, skillCasts } = observation;
    const validSkills = new Set(SKILL_REWORK_CATALOG[observation.characterClass]
      .filter((skill) => skill.kind === "active" && skill.unlockLevel <= observation.level)
      .map((skill) => skill.name));
    if (![elapsedSeconds, damageDealt, maximumHealth, remainingHealth].every(Number.isFinite)
        || elapsedSeconds <= 0 || (observation.encounter === "世界首領60秒" && elapsedSeconds > 60)
        || damageDealt < 0 || maximumHealth <= 0 || remainingHealth < 0 || remainingHealth > maximumHealth
        || !skillCasts || typeof skillCasts !== "object" || Array.isArray(skillCasts)
        || Object.entries(skillCasts).some(([name, count]) =>
          !validSkills.has(name) || !Number.isSafeInteger(count) || count < 0)) {
      throw new RangeError(`Invalid balance measurement: ${key}`);
    }
    const totalCasts = Object.values(skillCasts).reduce((sum, count) => sum + count, 0);
    measured.set(key, {
      damagePerSecond: damageDealt / elapsedSeconds,
      remainingHealthPercent: remainingHealth / maximumHealth * 100,
      survived: remainingHealth > 0,
      skillCastsPerMinute: totalCasts * 60 / elapsedSeconds,
      skillCasts: { ...skillCasts },
    });
  }
  const rows = scenarios.map((scenario) => ({ scenario, metrics: measured.get(scenarioKey(scenario)) ?? null }));
  return {
    rows,
    measured: measured.size,
    total: rows.length,
    missing: rows.filter((row) => row.metrics === null).map((row) => row.scenario),
  };
}
