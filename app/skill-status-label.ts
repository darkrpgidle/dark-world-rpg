import type { EnemyDebuffKind } from "./skill-debuff-timer";

const enemyDebuffLabels: Record<EnemyDebuffKind, string> = {
  bleed: "流血",
  burn: "灼燒",
  freeze: "冰凍",
  paralysis: "麻痺",
  armorBreak: "破防",
  bloodBrand: "血戰烙印",
  hunterMark: "獵殺標記",
  elementSigil: "元素蝕印",
};

export function combatStatusLabel(name: string): string {
  return Object.prototype.hasOwnProperty.call(enemyDebuffLabels, name)
    ? enemyDebuffLabels[name as EnemyDebuffKind]
    : name;
}
