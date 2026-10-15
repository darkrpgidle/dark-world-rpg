import type { LiveCombatBattle } from "./skill-live-combat";
import type { MageCombat } from "./skill-mage-combat";
import { combatStatusLabel } from "./skill-status-label";

export type TimedCombatStatus = {
  name: string;
  target: "player" | "enemy";
  remaining: number;
  unit: "攻擊" | "秒" | "次";
  tone: "red" | "blue" | "gold" | "green";
  expiresAt?: number;
};

// Pure projection: no damage settlement, status refresh, or expiry side effects.
export function refreshCombatStatusCountdowns(
  current: TimedCombatStatus[], battle: LiveCombatBattle | null, now: number,
): TimedCombatStatus[] {
  const next = current.filter((status) =>
    !(status.target === "enemy" && combatStatusLabel(status.name) !== status.name)
    && !(status.target === "player" && status.name === "枯竭")
  ).map((status) => status.unit === "秒"
    ? { ...status, remaining: Math.max(0, Math.ceil(((status.expiresAt ?? now) - now) / 1000)) }
    : status).filter((status) => status.remaining > 0);
  for (const status of Object.values(battle?.combat.session.enemy ?? {})) {
    if (!status || status.expiresAt <= now) continue;
    next.push({ name: status.kind, target: "enemy", unit: "秒", tone: "red",
      remaining: Math.ceil((status.expiresAt - now) / 1000), expiresAt: status.expiresAt });
  }
  if (battle?.characterClass === "法師") {
    const overload = (battle.combat as MageCombat).overload;
    if (overload.phase === "exhausted" && overload.expiresAt !== undefined && overload.expiresAt > now)
      next.push({ name: "枯竭", target: "player", unit: "秒", tone: "red",
        remaining: Math.ceil((overload.expiresAt - now) / 1000), expiresAt: overload.expiresAt });
  }
  return next;
}
