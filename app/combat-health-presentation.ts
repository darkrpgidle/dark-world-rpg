import type { CombatFloatEvent } from "./combat-float-events";
// World-boss score mirrors the same displayed hits as HP. Authoritative score
// still settles once in combat; cap at that score rather than counting twice.
export function presentWorldBossDamage(current: number,
  events: readonly CombatFloatEvent[], settled: number) {
  const damage = events.reduce((sum, event) => sum + (event.target === "enemy"
    && event.damage !== undefined && Number.isFinite(event.damage) && event.damage > 0
    ? event.damage : 0), 0);
  return Math.min(settled, Math.max(0, current) + damage);
}
// Presentation only: never settles combat, rolls hits, or awards a kill.
export function presentEnemyDamage(percent: number, maximum: number,
  events: readonly CombatFloatEvent[], settledPercent: number) {
  if(!(maximum>0) || !Number.isFinite(maximum))return percent;
  const damage=events.reduce((sum,event)=>sum+(event.target==="enemy" &&
    event.damage!==undefined && Number.isFinite(event.damage) && event.damage>0
      ? event.damage : 0),0);
  const remaining=Math.max(0,Math.min(100,Math.max(settledPercent,percent-damage/maximum*100)));
  // Settlement uses rounded real HP. Its final hit can leave a fractional
  // display remainder (or floating-point dust), which must not block death.
  return settledPercent===0 && remaining*maximum/100<0.5+1e-7 ? 0 : remaining;
}

export function enemyDefeatPresentationDelay(visible: boolean, percent: number,
  queuedAt: number, now: number, holdMs=120, shownAt?: number) {
  // Missing/unmounted VFX must never leave an already defeated target locked.
  // Normal hit callbacks still finish at the last number, after 120ms.
  return !visible ? 0 : percent<=0 ? Math.min(Math.max(0,6000-(now-queuedAt)),Math.max(0,holdMs-(shownAt===undefined?0:now-shownAt))) : Math.max(0,6000-(now-queuedAt));
}
