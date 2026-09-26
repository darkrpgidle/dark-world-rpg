// Skill rework, stage 1: progression and loadout rules only.
// Combat triggers, damage, ascensions and save migration are introduced separately.
export type SkillClass = "戰士" | "遊俠" | "法師";
export type SkillKind = "active" | "passive";
export type ActiveCategory = "basic" | "defense" | "status" | "burst" | "mechanic" | "ultimate";

export type SkillDefinition = {
  name: string;
  kind: SkillKind;
  unlockLevel: number;
  category?: ActiveCategory;
};

const activeLevels = [2, 6, 10, 16, 22, 28, 38, 50] as const;
const activeCategories: ActiveCategory[] = [
  "basic", "basic", "defense", "status", "burst", "mechanic", "burst", "ultimate",
];
const passiveLevels = [4, 8, 12, 14, 18, 20, 24, 26, 30, 34, 42, 46] as const;

const names: Record<SkillClass, { active: readonly string[]; passive: readonly string[] }> = {
  戰士: {
    active: ["裂地斬", "血刃斬", "不屈戰意", "血戰烙印", "鮮血怒吼", "狂戰姿態", "碎甲猛擊", "泰坦斷界斬"],
    passive: ["鐵骨", "裂傷本能", "破鎧追擊", "堅盾反射", "血氣汲取", "重刃專精", "逆境鋼心", "血痕累積", "格擋精通", "戰慄重擊", "絕境怒火", "泰坦餘震"],
  },
  遊俠: {
    active: ["穿雲箭", "追風箭", "幻影步", "獵殺標記", "疾風連射", "風行領域", "破星狙擊", "蒼穹箭雨"],
    passive: ["迅捷手感", "鷹眼", "疾風餘勢", "影步反射", "破綻獵手", "精準連射", "風之積蓄", "狩獵節奏", "乘風閃擊", "要害穿透", "星痕蓄力", "蒼穹餘響"],
  },
  法師: {
    active: ["霜火新星", "奧術飛彈", "魔力護盾", "元素蝕印", "隕星術", "奧術超載", "虛空崩解", "星界寂滅"],
    passive: ["奧術感知", "焰脈", "星界護體", "燃燼導引", "護盾轉流", "精密咒式", "餘燼回響", "奧術循環", "元素共振", "屏障續航", "枯竭控制", "星界回爆"],
  },
};

export const SKILL_REWORK_CATALOG: Record<SkillClass, readonly SkillDefinition[]> = {
  戰士: [], 遊俠: [], 法師: [],
};

for (const characterClass of Object.keys(names) as SkillClass[]) {
  SKILL_REWORK_CATALOG[characterClass] = [
    ...names[characterClass].active.map((name, index) => ({
      name, kind: "active" as const, unlockLevel: activeLevels[index], category: activeCategories[index],
    })),
    ...names[characterClass].passive.map((name, index) => ({
      name, kind: "passive" as const, unlockLevel: passiveLevels[index],
    })),
  ];
}

export type SkillSlots = [string | null, string | null, string | null];
export type SkillBuild = {
  ranks: Record<string, number>;
  activeSlots: SkillSlots;
};

export function createSkillBuild(): SkillBuild {
  return { ranks: {}, activeSlots: [null, null, null] };
}

export function earnedSkillPoints(characterLevel: number): number {
  if (!Number.isFinite(characterLevel)) return 0;
  return Math.floor(Math.min(100, Math.max(0, characterLevel)) / 2);
}

function skillFor(characterClass: SkillClass, name: string): SkillDefinition | undefined {
  return SKILL_REWORK_CATALOG[characterClass].find((skill) => skill.name === name);
}

export function spentSkillPoints(build: SkillBuild): number {
  return Object.values(build.ranks).reduce((sum, rank) => sum + rank, 0);
}

export function isValidSkillBuild(build: SkillBuild, characterClass: SkillClass, characterLevel: number): boolean {
  if (!build || !build.ranks || !Array.isArray(build.activeSlots) || build.activeSlots.length !== 3) return false;
  if (!Number.isInteger(characterLevel) || characterLevel < 1 || characterLevel > 100) return false;
  for (const [name, rank] of Object.entries(build.ranks)) {
    const skill = skillFor(characterClass, name);
    if (!skill || !Number.isInteger(rank) || rank < 1 || rank > 5 || skill.unlockLevel > characterLevel) return false;
  }
  if (spentSkillPoints(build) > earnedSkillPoints(characterLevel)) return false;
  const equipped = build.activeSlots.filter((name): name is string => name !== null);
  if (new Set(equipped).size !== equipped.length) return false;
  return equipped.every((name) => {
    const skill = skillFor(characterClass, name);
    return skill?.kind === "active" && skill.category !== "ultimate" && (build.ranks[name] ?? 0) > 0;
  });
}

// New saves carry a separate optional skillReworkBuild field. Legacy skills are
// kept by the caller until the full combat migration is ready.
export function restoreSkillBuild(saved: unknown, characterClass: SkillClass, characterLevel: number): SkillBuild {
  if (!saved || typeof saved !== "object" || !isValidSkillBuild(saved as SkillBuild, characterClass, characterLevel)) {
    return createSkillBuild();
  }
  const build = saved as SkillBuild;
  return { ranks: { ...build.ranks }, activeSlots: [...build.activeSlots] as SkillSlots };
}

export function upgradeSkill(
  build: SkillBuild, characterClass: SkillClass, characterLevel: number, name: string,
): SkillBuild | null {
  if (!isValidSkillBuild(build, characterClass, characterLevel)) return null;
  const skill = skillFor(characterClass, name);
  if (!skill || skill.unlockLevel > characterLevel || (build.ranks[name] ?? 0) >= 5) return null;
  if (spentSkillPoints(build) >= earnedSkillPoints(characterLevel)) return null;
  // The UI must obtain a second confirmation before invoking this pure update.
  return { ranks: { ...build.ranks, [name]: (build.ranks[name] ?? 0) + 1 }, activeSlots: [...build.activeSlots] as SkillSlots };
}

export function equipActiveSkill(
  build: SkillBuild, characterClass: SkillClass, characterLevel: number, slot: number, name: string | null,
): SkillBuild | null {
  if (!isValidSkillBuild(build, characterClass, characterLevel) || !Number.isInteger(slot) || slot < 0 || slot > 2) return null;
  if (name !== null) {
    const skill = skillFor(characterClass, name);
    if (!skill || skill.kind !== "active" || skill.category === "ultimate" || (build.ranks[name] ?? 0) === 0) return null;
    if (build.activeSlots.some((equipped, index) => index !== slot && equipped === name)) return null;
  }
  const activeSlots = [...build.activeSlots] as SkillSlots;
  activeSlots[slot] = name;
  return { ranks: { ...build.ranks }, activeSlots };
}

export function enabledUltimate(build: SkillBuild, characterClass: SkillClass, characterLevel: number): string | null {
  if (!isValidSkillBuild(build, characterClass, characterLevel)) return null;
  const ultimate = SKILL_REWORK_CATALOG[characterClass].find((skill) => skill.category === "ultimate");
  return ultimate && (build.ranks[ultimate.name] ?? 0) > 0 ? ultimate.name : null;
}
