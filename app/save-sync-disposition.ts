// A duplicate or superseded sequence has already lost to this same writer.
// Acknowledging it never writes data, and should not remount a live battle.
export function isDuplicateSaveSnapshot(incoming: Record<string, unknown>, server: Record<string, unknown>, sessionId: string) {
  const seq=incoming._saveSequence,latest=server._saveSequence;
  return typeof incoming._saveClientId==='string' && incoming._saveClientId.length>0 &&
    incoming._saveClientId===server._saveClientId && server._saveSessionId===sessionId &&
    typeof seq==='number' && Number.isSafeInteger(seq) && seq>0 &&
    typeof latest==='number' && Number.isSafeInteger(latest) && seq<=latest &&
    !(Number(server._lastRebirthRevision??0)>Number(incoming.adminRevision??0));
}
