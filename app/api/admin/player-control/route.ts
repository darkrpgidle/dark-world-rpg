import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { accounts, gmActionLogs, sessions } from "../../../../db/schema";
import { currentAccount } from "../../auth-utils";

type Action = "logout" | "suspend" | "unsuspend";

export async function GET(request: Request) {
  const gm = await currentAccount(request);
  if (!gm) return Response.json({ error: "not_authenticated" }, { status: 401 });
  if (!gm.isGm) return Response.json({ error: "forbidden" }, { status: 403 });
  const db = await getDb();
  const logs = await db.select({
    id: gmActionLogs.id,
    action: gmActionLogs.action,
    detail: gmActionLogs.detail,
    createdAt: gmActionLogs.createdAt,
    targetAccountId: gmActionLogs.targetAccountId,
    gmUsername: accounts.username,
  }).from(gmActionLogs)
    .leftJoin(accounts, eq(gmActionLogs.gmAccountId, accounts.id))
    .orderBy(desc(gmActionLogs.createdAt))
    .limit(50);
  return Response.json({ logs });
}

export async function POST(request: Request) {
  const gm = await currentAccount(request);
  if (!gm) return Response.json({ error: "not_authenticated" }, { status: 401 });
  if (!gm.isGm) return Response.json({ error: "forbidden" }, { status: 403 });
  const body = (await request.json()) as {
    accountId?: string;
    action?: Action;
    mode?: "temporary" | "permanent";
    until?: string;
    reason?: string;
  };
  const accountId = body.accountId?.trim() ?? "";
  const action = body.action;
  if (!accountId || !action || !["logout", "suspend", "unsuspend"].includes(action))
    return Response.json({ error: "invalid_action" }, { status: 400 });
  const db = await getDb();
  const [target] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (!target || target.isGm || target.id === gm.id)
    return Response.json({ error: "protected_account" }, { status: 403 });

  let detail = "";
  if (action === "suspend") {
    const reason = body.reason?.trim().slice(0, 200) ?? "";
    if (!reason) return Response.json({ error: "suspension_reason_required" }, { status: 400 });
    const isTemporary = body.mode === "temporary";
    const until = isTemporary ? new Date(body.until ?? "") : null;
    if (isTemporary && (!until || !Number.isFinite(until.getTime()) || until.getTime() <= Date.now() + 5 * 60_000 || until.getTime() > Date.now() + 365 * 24 * 60 * 60_000))
      return Response.json({ error: "invalid_suspension_until" }, { status: 400 });
    const suspendedAt = new Date().toISOString();
    const suspendedUntil = until?.toISOString() ?? null;
    await db.batch([
      db.update(accounts).set({ suspendedAt, suspendedUntil, suspensionReason: reason }).where(eq(accounts.id, target.id)),
      db.delete(sessions).where(eq(sessions.accountId, target.id)),
    ]);
    detail = `${isTemporary ? `暫時停權至 ${suspendedUntil}` : "永久停權"}；原因：${reason}`;
  } else if (action === "unsuspend") {
    await db.update(accounts).set({ suspendedAt: null, suspendedUntil: null, suspensionReason: null }).where(eq(accounts.id, target.id));
    detail = "解除停權";
  } else {
    await db.delete(sessions).where(eq(sessions.accountId, target.id));
    detail = "強制登出所有登入環境";
  }
  await db.insert(gmActionLogs).values({ gmAccountId: gm.id, targetAccountId: target.id, action, detail });
  return Response.json({ ok: true, username: target.username, action, detail });
}
