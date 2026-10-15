import type { RangerDefenseState } from "./skill-ranger-defense";

export type PhantomStepEvent = {
  activated: boolean;
  dodged: boolean;
  guaranteedConsumed: boolean;
};
export type PhantomStepVisual = {
  active: boolean;
  ascended: boolean;
  nextHitReady: boolean;
  nextSkillReady: boolean;
  eventKey: number;
  burst: "activate" | "dodge" | "shatter" | null;
};

// Persistent visuals follow combat state; only confirmed events create bursts.
export function phantomStepVisualState(defense: RangerDefenseState,
  previous: PhantomStepVisual | null, eventKey: number, event?: PhantomStepEvent): PhantomStepVisual | null {
  const burst = event?.guaranteedConsumed ? "shatter" : event?.dodged ? "dodge"
    : event?.activated ? "activate" : null;
  const visual: PhantomStepVisual = {
    active: defense.phantomAttacksRemaining > 0,
    ascended: defense.phantomAscended || defense.nextSkillCriticalDamagePending,
    nextHitReady: defense.nextHitCriticalChancePoints > 0,
    nextSkillReady: defense.nextSkillCriticalDamagePending,
    eventKey: burst ? eventKey : previous?.eventKey ?? 0,
    burst: burst ?? previous?.burst ?? null,
  };
  return visual.active || visual.nextHitReady || visual.nextSkillReady || visual.burst ? visual : null;
}
