const guardedResources = ["gold", "yuanbao", "enhanceStones", "reforgeStones", "level", "exp"] as const;

// Admin revisions are issued only by service actions and GM edits. A whole-save
// upload may carry the last revision it observed, but cannot mint a new one.
export function preserveServerResourceRevision(
  incoming: Record<string, unknown>, server: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!server) return { ...incoming, adminRevision: 0 };
  const serverRevision = Number(server.adminRevision ?? 0);
  const incomingRevision = incoming.adminRevision ?? 0;
  if (!Number.isSafeInteger(serverRevision) || serverRevision < 0 ||
      typeof incomingRevision !== "number" || !Number.isSafeInteger(incomingRevision) ||
      incomingRevision < 0 || incomingRevision > serverRevision) return null;
  const next: Record<string, unknown> = { ...incoming, adminRevision: serverRevision };
  if (incomingRevision < serverRevision) {
    for (const field of guardedResources) if (field in server) next[field] = server[field];
  }
  return next;
}
