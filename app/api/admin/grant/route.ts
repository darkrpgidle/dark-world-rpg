import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../../../db";
import { accounts, gameSaves, gmActionLogs, saveSnapshots, sessions } from "../../../../db/schema";
import { currentAccount } from "../../auth-utils";

const grantFields = new Set(["gold", "yuanbao", "enhanceStones", "reforgeStones", "level"]);

export async function POST(request: Request) {
  const gm = await currentAccount(request);
  if (!gm) return Response.json({ error: "not_authenticated" }, { status: 401 });
  if (!gm.isGm) return Response.json({ error: "forbidden" }, { status: 403 });
  const body = (await request.json()) as { accountId?: string; resource?: string; amount?: number };
  const accountId = body.accountId?.trim() ?? "";
  const resource = body.resource?.trim() ?? "";
  const amount = Math.floor(Number(body.amount));
  if (!accountId || !grantFields.has(resource) || !Number.isFinite(amount) || amount < 1 || amount > 1_000_000_000)
    return Response.json({ error: "invalid_grant" }, { status: 400 });
  if (resource === "level" && amount !== 1)
    return Response.json({ error: "level_grant_must_be_one" }, { status: 400 });

  const db = await getDb();
  const activeSince = new Date(Date.now() - 90_000).toISOString();
  const [target] = await db.select({ id: accounts.id, username: accounts.username }).from(accounts).where(eq(accounts.id, accountId)).limit(1);
  const [online] = await db.select({ accountId: sessions.accountId }).from(sessions)
    .where(and(eq(sessions.accountId, accountId), gt(sessions.lastSeenAt, activeSince))).limit(1);
  const [row] = await db.select().from(gameSaves).where(eq(gameSaves.accountId, accountId)).limit(1);
  if (!target || !online || !row) return Response.json({ error: "player_not_online" }, { status: 404 });
  let save: Record<string, unknown>;
  try { save = JSON.parse(row.payload) as Record<string, unknown>; } catch { return Response.json({ error: "invalid_player_save" }, { status: 409 }); }
  const current = Number(save[resource] ?? (resource === "level" ? 1 : 0));
  save[resource] = resource === "level" ? Math.min(100, current + 1) : Math.min(1_000_000_000, current + amount);
  if (resource === "level") save.exp = 0;
  save.adminRevision = Number(save.adminRevision ?? 0) + 1;
  const updatedAt = new Date().toISOString();
  await db.batch([
    db.insert(saveSnapshots).values({
      playerId: row.playerId,
      accountId: target.id,
      payload: row.payload,
      kind: "pre_admin_grant",
      capturedAt: updatedAt,
    }),
    db.update(gameSaves)
      .set({ payload: JSON.stringify(save), updatedAt })
      .where(eq(gameSaves.playerId, row.playerId)),
    db.delete(sessions).where(eq(sessions.accountId, target.id)),
  ]);
  await db.insert(gmActionLogs).values({
    gmAccountId: gm.id,
    targetAccountId: target.id,
    action: "grant",
    detail: `發放 ${resource} × ${amount}`,
  });
  return Response.json({ ok: true, username: target.username, resource, amount });
}
