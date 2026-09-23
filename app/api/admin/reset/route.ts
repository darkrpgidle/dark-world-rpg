import { eq, ne } from "drizzle-orm";
import { getDb } from "../../../../db";
import { accounts, deathEvents, gameSaves, saveSnapshots, sessions } from "../../../../db/schema";
import { currentAccount } from "../../auth-utils";

/**
 * Resets live player data while preserving the GM account and its current session.
 * This endpoint is intentionally GM-only and has no request parameters.
 */
export async function POST(request: Request) {
  const gm = await currentAccount(request);
  if (!gm) return Response.json({ error: "not_authenticated" }, { status: 401 });
  if (!gm.isGm) return Response.json({ error: "forbidden" }, { status: 403 });

  const db = await getDb();
  const savesBeforeWipe = await db.select().from(gameSaves);
  const now = new Date().toISOString();
  if (savesBeforeWipe.length) {
    await db.insert(saveSnapshots).values({
      playerId: "__global_pre_wipe__",
      accountId: gm.id,
      payload: JSON.stringify({ capturedAt: now, saves: savesBeforeWipe }),
      kind: "global_pre_wipe",
      capturedAt: now,
    });
  }
  const [deathResult, saveResult, sessionResult, accountResult] = await Promise.all([
    db.delete(deathEvents),
    db.delete(gameSaves),
    db.delete(sessions).where(ne(sessions.accountId, gm.id)),
    db.delete(accounts).where(eq(accounts.isGm, false)),
  ]);

  return Response.json({
    ok: true,
    preservedGmAccountId: gm.id,
    deleted: {
      deaths: deathResult.rowsAffected ?? 0,
      snapshots: savesBeforeWipe.length,
      saves: saveResult.rowsAffected ?? 0,
      sessions: sessionResult.rowsAffected ?? 0,
      accounts: accountResult.rowsAffected ?? 0,
    },
  });
}
