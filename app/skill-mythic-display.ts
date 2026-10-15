import type { LiveCombatAction } from "./skill-live-combat";

// Split amounts already settled against HP, including overkill. Displaying
// an equipment hit never rolls or applies damage a second time.
export function splitMythicDamage(action: Pick<LiveCombatAction, "damagePercent" | "equipmentHits"> | null, total: number) {
  const hits = (action?.equipmentHits ?? []).map(hit => ({
    ...hit, damage: action && action.damagePercent > 0
      ? Math.floor(Math.max(0, total) * hit.damagePercent / action.damagePercent) : 0,
  }));
  const extra = hits.reduce((sum, hit) => sum + hit.damage, 0);
  return { remaining: Math.max(0, total - extra), hits };
}
