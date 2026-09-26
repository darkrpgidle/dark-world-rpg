// Skill rework, stage 3: target-local, wall-clock debuff timing.
// Damage multipliers for bleed and burn remain subject to balance testing.
export type EnemyDebuffKind = "bleed" | "burn" | "armorBreak" | "bloodBrand" | "hunterMark" | "elementSigil";

export type EnemyDebuff = {
  kind: EnemyDebuffKind;
  expiresAt: number;
  stacks: number;
  strength: number;
  nextTickAt?: number;
};

export type EnemyDebuffs = Partial<Record<EnemyDebuffKind, EnemyDebuff>>;
export type DebuffTick = { kind: "bleed" | "burn"; at: number; stacks: number };
export type DebuffUpdate = { state: EnemyDebuffs; ticks: DebuffTick[] };

const durationByLevel = {
  bloodBrand: [6, 7, 8, 9, 10],
  hunterMark: [7, 8, 9, 10, 12],
  elementSigil: [7, 8, 9, 10, 12],
} as const;

function durationMs(kind: EnemyDebuffKind, level: number): number {
  const durations = durationByLevel[kind as keyof typeof durationByLevel] as readonly number[] | undefined;
  return (durations ? durations[level - 1] : kind === "armorBreak" ? 4 : 3) * 1000;
}

function checkTime(now: number) {
  if (!Number.isFinite(now) || now < 0) throw new RangeError("Debuff time must be a finite millisecond timestamp");
}

export function advanceEnemyDebuffs(state: EnemyDebuffs, now: number): DebuffUpdate {
  checkTime(now);
  const remaining: EnemyDebuffs = {};
  const ticks: DebuffTick[] = [];
  for (const debuff of Object.values(state)) {
    if (!debuff) continue;
    let nextTickAt = debuff.nextTickAt;
    if ((debuff.kind === "bleed" || debuff.kind === "burn") && nextTickAt !== undefined) {
      // Include a tick exactly at expiry (a three-second debuff ticks at 1, 2 and 3 seconds).
      while (nextTickAt <= Math.min(now, debuff.expiresAt)) {
        ticks.push({ kind: debuff.kind, at: nextTickAt, stacks: debuff.stacks });
        nextTickAt += 1000;
      }
    }
    if (now < debuff.expiresAt) {
      remaining[debuff.kind] = { ...debuff, ...(nextTickAt === undefined ? {} : { nextTickAt }) };
    }
  }
  ticks.sort((a, b) => a.at - b.at || a.kind.localeCompare(b.kind));
  return { state: remaining, ticks };
}

export function applyEnemyDebuff(
  state: EnemyDebuffs,
  application: { kind: EnemyDebuffKind; level?: number; ascendedBleed?: boolean; strength?: number },
  now: number,
): DebuffUpdate {
  checkTime(now);
  const level = application.level ?? 1;
  if (!Number.isInteger(level) || level < 1 || level > 5) throw new RangeError("Debuff skill level must be 1–5");
  if (application.strength !== undefined && (!Number.isFinite(application.strength) || application.strength < 0)) {
    throw new RangeError("Debuff strength must be nonnegative and finite");
  }
  // Settle outstanding damage before refreshing the duration; never discard a delayed tick.
  const update = advanceEnemyDebuffs(state, now);
  const old = update.state[application.kind];
  const isBleed = application.kind === "bleed";
  const ticking = isBleed || application.kind === "burn";
  const maxStacks = isBleed && application.ascendedBleed ? 3 : isBleed ? 2 : 1;
  update.state[application.kind] = {
    kind: application.kind,
    expiresAt: now + durationMs(application.kind, level),
    stacks: isBleed ? Math.min(maxStacks, (old?.stacks ?? 0) + 1) : 1,
    // Armor break keeps the stronger value; other single-instance statuses refresh.
    strength: application.kind === "armorBreak"
      ? Math.max(old?.strength ?? 0, application.strength ?? 0)
      : application.strength ?? old?.strength ?? 0,
    ...(ticking ? { nextTickAt: old?.nextTickAt ?? now + 1000 } : {}),
  };
  return update;
}

export function clearEnemyDebuffs(): EnemyDebuffs {
  return {};
}
