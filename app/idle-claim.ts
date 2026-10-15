const MAX_IDLE_SECONDS = 43_200;

function boundedSeconds(value: unknown) {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.min(MAX_IDLE_SECONDS, Math.max(0, seconds)) : 0;
}

export function elapsedIdleSeconds(previous: Record<string, unknown>, now: number) {
  const lastSeenAt = Number(previous.lastSeenAt ?? now);
  return Number.isFinite(lastSeenAt) ? boundedSeconds((now - lastSeenAt) / 1_000) : 0;
}

export function settleIdleSave(previous: Record<string, unknown>, now: number, sessionId: string) {
  const elapsedSeconds = elapsedIdleSeconds(previous, now);
  return {
    elapsedSeconds,
    save: {
      ...previous,
      storedSeconds: boundedSeconds(boundedSeconds(previous.storedSeconds) + elapsedSeconds),
      lastSeenAt: now,
      battleOn: true,
      _saveSessionId: sessionId,
    },
  };
}

export function prepareIdleClaim(
  previous: Record<string, unknown>, claimId: string, now: number, sessionId: string,
) {
  if (claimId && previous._lastIdleClaimId === claimId) {
    return {
      accepted: false,
      claimedSeconds: boundedSeconds(previous._lastIdleClaimSeconds),
      save: previous,
    };
  }
  // Settle through the authoritative claim timestamp, including time since
  // the last autosave. The retry branch above must never settle it again.
  const claimedSeconds = boundedSeconds(boundedSeconds(previous.storedSeconds) + elapsedIdleSeconds(previous, now));
  return {
    accepted: true,
    claimedSeconds,
    save: {
      ...previous,
      storedSeconds: 0,
      lastSeenAt: now,
      battleOn: true,
      _saveSessionId: sessionId,
      ...(claimId ? { _lastIdleClaimId: claimId, _lastIdleClaimSeconds: claimedSeconds } : {}),
    },
  };
}

// An older autosave may have left the browser before the claim completed.
// Keep the server's claim marker and consumed seconds until that browser has
// observed the new marker; otherwise it could recreate already claimed time.
export function preserveServerIdleClaim(
  incoming: Record<string, unknown>, server: Record<string, unknown> | null,
) {
  const next = { ...incoming };
  delete next._lastIdleClaimId;
  delete next._lastIdleClaimSeconds;
  if (server && typeof server._lastIdleClaimId === "string") {
    if (incoming._lastIdleClaimId !== server._lastIdleClaimId)
      next.storedSeconds = boundedSeconds(server.storedSeconds);
    next._lastIdleClaimId = server._lastIdleClaimId;
    next._lastIdleClaimSeconds = boundedSeconds(server._lastIdleClaimSeconds);
  }
  return next;
}
