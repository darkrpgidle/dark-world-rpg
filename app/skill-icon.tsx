"use client";

import { SKILL_REWORK_CATALOG, type SkillClass } from "./skill-rework";

const atlasPath: Record<SkillClass, string> = {
  戰士: "/skills/icons/warrior-atlas.webp",
  遊俠: "/skills/icons/ranger-atlas.webp",
  法師: "/skills/icons/mage-atlas.webp",
};

export function SkillIcon({ name, characterClass, kind = "active", variant = "node" }: {
  name?: string;
  characterClass: SkillClass;
  kind?: "active" | "passive";
  variant?: "node" | "detail" | "loadout";
}) {
  const iconIndex = name
    ? SKILL_REWORK_CATALOG[characterClass].findIndex((skill) => skill.name === name)
    : -1;
  const safeIndex = Math.max(0, iconIndex);
  const col = safeIndex % 4;
  const row = Math.floor(safeIndex / 4);
  // The generated warrior/ranger atlas has 260px-high rows and a bottom
  // margin; the mage atlas fills its 1402px canvas with five 280px rows.
  const rowStepPercent = characterClass === "法師" ? 25 : 22.77;
  const backgroundHeight = characterClass === "法師" ? "500%" : "539.23%";
  const role = name === "泰坦斷界斬" || name === "蒼穹箭雨" || name === "星界寂滅" ? "ultimate" : kind;
  const style = iconIndex < 0 ? undefined : {
    backgroundImage: `url(${atlasPath[characterClass]})`,
    backgroundSize: `400% ${backgroundHeight}`,
    backgroundPosition: `${col * (100 / 3)}% ${row * rowStepPercent}%`,
  };

  return (
    <span className={`skill-icon-thumb ${characterClass} ${role} ${variant}`} aria-hidden="true">
      <span className="skill-icon-glyph skill-icon-sprite" style={style} />
      <span className="skill-icon-glint" />
    </span>
  );
}
