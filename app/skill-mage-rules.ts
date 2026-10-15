// Mage rework, stage 18: ranked data and isolated overload/exhaustion rules.
// Shared by live tower and boss combat; activation charge belongs to the queue.
import { balanceConfig } from "./balance-config";

const mage = balanceConfig.skillRework.mage;

export const MAGE_ACTIVE_RULES = {
  霜火新星: { category: "basic", ...mage.active.霜火新星, ascension: "極炎霜爆" },
  閃電鏈: { category: "basic", ...mage.active.閃電鏈, ascension: "雷環共鳴" },
  魔力護盾: { category: "defense", ...mage.active.魔力護盾, ascension: "星界屏障" },
  元素蝕印: { category: "status", ...mage.active.元素蝕印, ascension: "混沌刻印" },
  隕星術: { category: "burst", ...mage.active.隕星術, ascension: "天火墜星" },
  奧術超載: { category: "mechanic", ...mage.active.奧術超載, ascension: "魔能暴走" },
  虛空崩解: { category: "burst", ...mage.active.虛空崩解, ascension: "萬象湮滅" },
  星界寂滅: { category: "ultimate", ...mage.active.星界寂滅, ascension: "諸星終焉" },
} as const;

export const MAGE_PASSIVE_RULES = mage.passive;
export type MageActiveName = keyof typeof MAGE_ACTIVE_RULES;
export type MagePassiveName = keyof typeof MAGE_PASSIVE_RULES;

export function mageSkillRankValue(values: readonly number[], rank: number): number {
  if (!Number.isInteger(rank) || rank < 1 || rank > 5 || values.length !== 5) {
    throw new RangeError("Mage skill rank must be 1–5");
  }
  return values[rank - 1];
}

export type MageOverloadState =
  | { phase: "idle" }
  | { phase: "overloaded"; rank: number; ascended: boolean; remainingSuccessfulCasts: number; stabilityStacks: number }
  | { phase: "exhausted"; basePenaltyPercent: number; expiresAt?: number };

export type MageOverloadEvent = {
  // One complete cast with original segments only; follow-up damage is separate.
  kind: "normal" | "skill" | "secondary" | "proc" | "dot" | "counter" | "ascension";
  hits: readonly { hit: boolean }[];
};

export function createMageOverload(): MageOverloadState {
  return { phase: "idle" };
}

// Called only after the queue permits a cast. Does not consume a following cast,
// award stability, clear exhaustion, or decide whether recasting is allowed.
export function activateMageOverload(rank: number, ascended: boolean): MageOverloadState {
  mageSkillRankValue(MAGE_ACTIVE_RULES.奧術超載.skillEfficiencyBonus, rank);
  return {
    phase: "overloaded", rank, ascended,
    remainingSuccessfulCasts: MAGE_ACTIVE_RULES.奧術超載.followingSuccessfulActiveCasts,
    stabilityStacks: 0,
  };
}

// Stability acquisition is not specified. An external, explicitly resolved
// stability event may add stacks; ordinary hits never implicitly add them.
export function addMageOverloadStability(state: MageOverloadState, stacks: number): MageOverloadState {
  if (!Number.isSafeInteger(stacks) || stacks < 0) throw new RangeError("Stability gain must be a nonnegative integer");
  if (state.phase !== "overloaded" || !state.ascended || stacks === 0) return state;
  return {
    ...state,
    stabilityStacks: Math.min(MAGE_ACTIVE_RULES.奧術超載.stabilityStacksRequired, state.stabilityStacks + stacks),
  };
}

export function mageExhaustionPenaltyPercent(state: MageOverloadState, controlRank = 0): number {
  const reduction = controlRank === 0 ? 0
    : mageSkillRankValue(MAGE_PASSIVE_RULES.枯竭控制.exhaustionReductionPercent, controlRank);
  return state.phase === "exhausted" ? Math.max(0, state.basePenaltyPercent * (1 - reduction / 100)) : 0;
}

export function consumeMageOverload(
  state: MageOverloadState, event: MageOverloadEvent, controlRank = 0, now = 0,
): { state: MageOverloadState; skillEfficiencyBonusPercent: number; skillDamagePenaltyPercent: number } {
  // Effects describe this cast; returned state describes the next cast.
  state = advanceMageOverload(state, now);
  const penalty = mageExhaustionPenaltyPercent(state, controlRank);
  if (event.kind !== "skill") return { state, skillEfficiencyBonusPercent: 0, skillDamagePenaltyPercent: 0 };
  if (state.phase !== "overloaded") return { state, skillEfficiencyBonusPercent: 0, skillDamagePenaltyPercent: penalty };

  // Overload scales direct skill damage and abnormal effect strength, never charge or proc chance.
  const skillEfficiencyBonusPercent = mageSkillRankValue(MAGE_ACTIVE_RULES.奧術超載.skillEfficiencyBonus, state.rank);
  if (!event.hits.some((segment) => segment.hit)) {
    return { state, skillEfficiencyBonusPercent, skillDamagePenaltyPercent: 0 };
  }
  const remainingSuccessfulCasts = state.remainingSuccessfulCasts - 1;
  const rule = MAGE_ACTIVE_RULES.奧術超載;
  const next: MageOverloadState = remainingSuccessfulCasts > 0
    ? { ...state, remainingSuccessfulCasts }
    : {
      phase: "exhausted", expiresAt: now + balanceConfig.skillRework.abnormalities.exhaustionSeconds * 1000,
      basePenaltyPercent: state.ascended && state.stabilityStacks >= rule.stabilityStacksRequired
        ? rule.stableExhaustionPenalty : rule.exhaustionPenalty,
    };
  return { state: next, skillEfficiencyBonusPercent, skillDamagePenaltyPercent: 0 };
}

export function advanceMageOverload(state: MageOverloadState, now: number): MageOverloadState {
  return state.phase === "exhausted" && state.expiresAt !== undefined && now >= state.expiresAt ? createMageOverload() : state;
}
// Explicit reset remains available at combat boundaries.
export function clearMageExhaustion(state: MageOverloadState): MageOverloadState {
  return state.phase === "exhausted" ? createMageOverload() : state;
}

