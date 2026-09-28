// Stage 22: one ascended chaos-seal trigger per active enemy sigil.
// The pending three-cast buff belongs to the mage, independently of the
// target-local, wall-clock sigil that originally granted it.
import { isAppliedAffliction, type EnemyDebuffKind } from "./skill-debuff-timer";
import { MAGE_ACTIVE_RULES } from "./skill-mage-rules";

export type MageSigilState = {
  markedAscended: boolean;
  firstAnomalyUsed: boolean;
  enhancedCastsRemaining: number;
};

export function createMageSigilState(): MageSigilState {
  return { markedAscended: false, firstAnomalyUsed: false, enhancedCastsRemaining: 0 };
}

// Expiry or an ordinary target swap drops only target-specific information;
// a previously earned following-casts buff is not revoked.
export function transitionMageSigilTarget(state: MageSigilState, hasCurrentSigil: boolean): MageSigilState {
  return hasCurrentSigil ? state : { ...state, markedAscended: false, firstAnomalyUsed: false };
}

export function consumeMageSigilActiveCast(
  state: MageSigilState, active: boolean,
): { state: MageSigilState; statusChancePoints: number } {
  if (!active || state.enhancedCastsRemaining <= 0) return { state, statusChancePoints: 0 };
  return {
    state: { ...state, enhancedCastsRemaining: state.enhancedCastsRemaining - 1 },
    statusChancePoints: MAGE_ACTIVE_RULES.元素蝕印.nextStatusChancePoints,
  };
}

export function recordMageSigilStatuses(
  state: MageSigilState,
  input: {
    hadCurrentSigil: boolean;
    appliedKinds: readonly EnemyDebuffKind[];
    newlyAppliedSigilAscended: boolean;
  },
): MageSigilState {
  // A refreshed existing mark is the same instance. A newly cast mark starts
  // with a fresh trigger, but its own application is not an abnormality.
  const markerApplied = input.appliedKinds.includes("elementSigil");
  if (markerApplied && !input.hadCurrentSigil) {
    return { ...state, markedAscended: input.newlyAppliedSigilAscended, firstAnomalyUsed: false };
  }
  const abnormalApplied = input.appliedKinds.some(isAppliedAffliction);
  if (!input.hadCurrentSigil || !state.markedAscended || state.firstAnomalyUsed || !abnormalApplied) return state;
  return {
    ...state, firstAnomalyUsed: true,
    enhancedCastsRemaining: MAGE_ACTIVE_RULES.元素蝕印.followingActiveCasts,
  };
}
