export function adminLocalDateTime(date = new Date()) {
 return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
}
export function resetAdminIntegrity(save:Record<string,unknown>,previous:Record<string,unknown>|null,now=Date.now()) {
 const next:Record<string,unknown>={...save,lastSeenAt:now,_saveIntegrity:{at:now,credits:{},
  ...(typeof previous?._lastIdleClaimId === "string" ? {idleClaimId:previous._lastIdleClaimId} : {})}};
 // Restore must not resurrect an already spent offline claim or old save request.
 for(const field of ["_lastIdleClaimId","_lastIdleClaimSeconds"]) {
  if(previous && field in previous) next[field]=previous[field];
  else delete (next as Record<string,unknown>)[field];
 }
 for(const field of ["_saveRequestId","_saveClientId","_saveSequence","_saveSessionId"])
  delete (next as Record<string,unknown>)[field];
 return next;
}
