// Client and historical snapshot payloads cannot assign the account-bound
// compensation counter. Preserve the current server value, including an
// anomalous value that must remain available for manual investigation.
export function preserveLegacyRebirthCount(
  incoming: Record<string, unknown>, server: Record<string, unknown> | null,
): Record<string, unknown> {
  const next = { ...incoming };
  if (server && Object.prototype.hasOwnProperty.call(server, "legacyRebirthCount")) {
    next.legacyRebirthCount = server.legacyRebirthCount;
  } else {
    delete next.legacyRebirthCount;
  }
  return next;
}
