import { sql } from "drizzle-orm";

// Evaluated by SQLite inside the save write, closing the gap between auth and CAS.
export function activeSaveSession(tokenHash: string, accountId: string, now = new Date().toISOString()) {
  return sql`EXISTS (
    SELECT 1 FROM sessions
    WHERE token_hash = ${tokenHash} AND account_id = ${accountId} AND expires_at > ${now}
  )`;
}

