import { adminJson } from "../../../admin-response";
import { and, desc, eq, ne } from "drizzle-orm";
import { getDb } from "../../../../db";
import { accounts, gmActionLogs, sessions } from "../../../../db/schema";
import { currentAccount } from "../../auth-utils";
import { buildAccountDeletion } from "../../../admin-account-delete";

type Action = "logout" | "suspend" | "unsuspend" | "delete";

export async function GET(request: Request) {
  const gm = await currentAccount(request);
  if (!gm) return adminJson({ error: "not_authenticated" }, { status: 401 });
  if (!gm.isGm) return adminJson({ error: "forbidden" }, { status: 403 });
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
    .where(and(ne(gmActionLogs.action,"save_integrity_rejected"),ne(gmActionLogs.action,"gm_mail_read")))
    .orderBy(desc(gmActionLogs.createdAt))
    .limit(50);
  return adminJson({ logs: logs.map(log=>{if(log.action!=="gm_mail")return log;try{const d=JSON.parse(log.detail);return {...log,detail:`寄送 GM 郵件給 ${d.username}：${d.title}\n${d.body}`};}catch{return log;}}) });
}

export async function POST(request: Request) {
  const gm = await currentAccount(request);
  if (!gm) return adminJson({ error: "not_authenticated" }, { status: 401 });
  if (!gm.isGm) return adminJson({ error: "forbidden" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as {
    accountId?: string;
    action?: Action;
    mode?: "temporary" | "permanent";
    until?: string;
    reason?: string;
    confirmation?: string;
  } | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) return adminJson({error:"invalid_request"},{status:400});
  const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
  const action = body.action;
  if (!accountId || !action || !["logout", "suspend", "unsuspend", "delete"].includes(action))
    return adminJson({ error: "invalid_action" }, { status: 400 });
  const db = await getDb();
  const [target] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (!target || target.isGm || target.id === gm.id)
    return adminJson({ error: "protected_account" }, { status: 403 });

  if (action === "delete") {
    if (body.confirmation !== target.username) return adminJson({error:"confirmation_mismatch"},{status:400});
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0,200) : "";
    if (!reason) return adminJson({error:"deletion_reason_required"},{status:400});
    const plan = buildAccountDeletion(target.id,target.username,gm.id,reason);
    const results = await db.$client.batch(plan.map(s => db.$client.prepare(s.sql).bind(...s.bindings)));
    if (results.at(-1)?.meta?.changes !== 1) return adminJson({error:"account_changed"},{status:409});
    return adminJson({ok:true,username:target.username,action,detail:"帳號已刪除；歷史備份與紀錄保留"});
  }

  if(action === "suspend" && body.mode !== "temporary" && body.mode !== "permanent")
    return adminJson({error:"invalid_suspension_mode"},{status:400});
  let detail = "";
  if (action === "suspend") {
    const reason = body.reason?.trim().slice(0, 200) ?? "";
    if (!reason) return adminJson({ error: "suspension_reason_required" }, { status: 400 });
    const isTemporary = body.mode === "temporary";
    const until = isTemporary ? new Date(body.until ?? "") : null;
    if (isTemporary && (!until || !Number.isFinite(until.getTime()) || until.getTime() <= Date.now() + 5 * 60_000 || until.getTime() > Date.now() + 365 * 24 * 60 * 60_000))
      return adminJson({ error: "invalid_suspension_until" }, { status: 400 });
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
  return adminJson({ ok: true, username: target.username, action, detail });
}
