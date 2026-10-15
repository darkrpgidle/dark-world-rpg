const MAX_SECONDS = 43_200;
const bounded = (value: number) => Number.isFinite(value) ? Math.min(MAX_SECONDS, Math.max(0, value)) : 0;

// Presentation only. The server independently settles claimable time.
export type IdleStorageClock = { seconds: number; at: number; epoch: number; serverVersion: number };

export function resetIdleStorageClock(previous: IdleStorageClock | null, seconds: number, now: number, updatedAt?: string | null): IdleStorageClock {
  return { seconds: bounded(seconds), at: now, epoch: (previous?.epoch ?? 0) + 1,
    serverVersion: Date.parse(updatedAt ?? "") || 0 };
}

export function advanceIdleStorageClock(clock: IdleStorageClock, now: number): IdleStorageClock {
  const at = Math.max(clock.at, now);
  return { ...clock, seconds: bounded(clock.seconds + (at - clock.at) / 1000), at };
}

export function reconcileIdleStorageClock(clock: IdleStorageClock, seconds: number, now: number, epoch: number, updatedAt?: string | null): IdleStorageClock {
  const version = Date.parse(updatedAt ?? "") || 0;
  // A response from before a claim/rebirth/load cannot resurrect consumed time.
  if (epoch !== clock.epoch || version < clock.serverVersion || !Number.isFinite(seconds)) return clock;
  const current = advanceIdleStorageClock(clock, now);
  // These counters cover the same interval: reconcile them, never add them.
  return { ...current, seconds: Math.max(current.seconds, bounded(seconds)), serverVersion: version };
}
