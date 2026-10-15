import { adminJson } from "../../../admin-response";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../../../db";
import { accounts, gameSaves, sessions } from "../../../../db/schema";
import { currentAccount } from "../../auth-utils";

import { commitAdminSave } from "../../../admin-save-mutation";

const grantFields = new Set(["gold", "yuanbao", "enhanceStones", "reforgeStones", "level"]);

export async function POST(request: Request) {
  const gm = await currentAccount(request);
  if (!gm) return adminJson({ error: "not_authenticated" }, { status: 401 });
  if (!gm.isGm) return adminJson({ error: "forbidden" }, { status: 403 });
  const body = (await request.json()) as { accountId?: string; resource?: string; amount?: number };
  const accountId = body.accountId?.trim() ?? "";
  const resource = body.resource?.trim() ?? "";
  const amount = Math.floor(Number(body.amount));
  if (!accountId || !grantFields.has(resource) || !Number.isSafeInteger(body.amount) || amount < 1 || amount > 1_000_000_000)
    return adminJson({ error: "invalid_grant" }, { status: 400 });
  if (resource === "level" && amount !== 1)
    return adminJson({ error: "level_grant_must_be_one" }, { status: 400 });

  const db = await getDb();
  const activeSince = new Date(Date.now() - 90_000).toISOString();
  const [target] = await db.select({ id: accounts.id, username: accounts.username }).from(accounts).where(eq(accounts.id, accountId)).limit(1);
  const [online] = await db.select({ accountId: sessions.accountId }).from(sessions)
    .where(and(eq(sessions.accountId, accountId), gt(sessions.lastSeenAt, activeSince), gt(sessions.expiresAt, new Date().toISOString()))).limit(1);
  const [row] = await db.select().from(gameSaves).where(eq(gameSaves.accountId, accountId)).limit(1);
  if (!target || !online || !row) return adminJson({ error: "player_not_online" }, { status: 404 });
  let save: Record<string, unknown>;
  try { save = JSON.parse(row.payload) as Record<string, unknown>; } catch { return adminJson({ error: "invalid_player_save" }, { status: 409 }); }
  const current = Number(save[resource] ?? (resource === "level" ? 1 : 0));
  if(!Number.isSafeInteger(current) || current < 0 || current > Number.MAX_SAFE_INTEGER-amount)
    return adminJson({error:"invalid_player_balance"},{status:409});
  save[resource] = resource === "level" ? Math.min(100, current + 1) : current + amount;
  if (resource === "level") save.exp = 0;
  save.adminRevision = Number(save.adminRevision ?? 0) + 1;
  const mutation=await commitAdminSave(db,{accountId,playerId:row.playerId,gmAccountId:gm.id,current:row,save,
    kind:"pre_admin_grant",action:"grant",detail:`發放 ${resource} × ${amount}`});
  if(!mutation.accepted) return adminJson({error:"save_conflict"},{status:409});
  return adminJson({ ok: true, username: target.username, resource, amount });
}
