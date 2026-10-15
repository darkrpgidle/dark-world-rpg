const guardedResources = ["gold", "yuanbao", "enhanceStones", "reforgeStones", "drillingStones", "level", "exp"] as const;

// Admin revisions are issued only by service actions and GM edits. A whole-save
// upload may carry the last revision it observed, but cannot mint a new one.
export function preserveServerResourceRevision(
  incoming: Record<string, unknown>, server: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!server){const next:Record<string,unknown>={...incoming,adminRevision:0};delete next._lastRebirthRevision;return next;}
  const serverRevision = Number(server.adminRevision ?? 0);
  const incomingRevision = incoming.adminRevision ?? 0;
  if (!Number.isSafeInteger(serverRevision) || serverRevision < 0 ||
      typeof incomingRevision !== "number" || !Number.isSafeInteger(incomingRevision) ||
      incomingRevision < 0 || incomingRevision > serverRevision) return null;
  // Rebirth replaces the progression itself. Old snapshots must reload rather
  // than combine old gear/maps with the reset character's resources.
  if(Number.isSafeInteger(server._lastRebirthRevision)&&incomingRevision<Number(server._lastRebirthRevision))return null;
  const next: Record<string, unknown> = { ...incoming, adminRevision: serverRevision };
  if(server._lastRebirthRevision!==undefined)next._lastRebirthRevision=server._lastRebirthRevision;
  else delete next._lastRebirthRevision;
  if (incomingRevision < serverRevision) {
    for (const field of guardedResources) if (field in server) next[field] = server[field];
  }
  return next;
}

