import { authenticationRules, rateLimitStatement } from "../../auth-rate-limit";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { accounts } from "../../../db/schema";
import {
  accountSuspension,
  createSession,
  currentLogin,
  deleteSession,
  hashPassword,
  normalizeUsername,
  sessionCookie,
  verifyPassword,
} from "../auth-utils";
import { MAINTENANCE_MESSAGE, MAINTENANCE_MODE } from "../../maintenance";

function publicAccount(account: { id: string; username: string; isGm: boolean }) {
  return { id: account.id, username: account.username, isGm: account.isGm };
}

const jsonNoStore = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { "Cache-Control": "no-store, max-age=0" },
});

export async function GET(request: Request) {
  const login = await currentLogin(request);
  if (!login.account) {
    if (login.error === "maintenance")
      return jsonNoStore({ account: null, error: login.error, message: MAINTENANCE_MESSAGE }, 503);
    if (login.error === "account_suspended")
      return jsonNoStore({ account: null, error: login.error, ...login.suspension }, 403);
    return jsonNoStore({ account: null, error: login.error }, 401);
  }
  return jsonNoStore({ account: publicAccount(login.account) });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(()=>null)) as {
    action?: "register" | "login" | "logout";
    username?: string;
    password?: string;
    loginId?: string;
  } | null;
  if(!body || typeof body!=="object" || Array.isArray(body))return jsonNoStore({error:"invalid_request"},400);
  if (body.action === "logout") {
    const deleted = await deleteSession(request);
    if (!deleted) return jsonNoStore({ ok: false, error: "session_replaced" }, 409);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json", "set-cookie": sessionCookie("", 0) },
    });
  }
  if(body.action!=="login"&&body.action!=="register")return jsonNoStore({error:"invalid_action"},400);
  const username = typeof body.username==="string"?body.username.trim():"";
  const password = typeof body.password==="string"?body.password:"";
  const loginId = typeof body.loginId==="string"?body.loginId.trim():"";
  if (!/^[^\s]{3,24}$/.test(username) || password.length < 6 || password.length > 128)
    return jsonNoStore({ error: "invalid_credentials" }, 400);
  if (!/^[a-zA-Z0-9_-]{20,80}$/.test(loginId))
    return jsonNoStore({ error: "invalid_login_instance" }, 400);

  const db = await getDb();
  const normalized = normalizeUsername(username);
  const now=Date.now(),rules=await authenticationRules(request,body.action,normalized);
  try {
    const plans=rules.map(r=>rateLimitStatement(r,now));
    const results=await db.$client.batch([
      db.$client.prepare("DELETE FROM auth_rate_limits WHERE window_end<?").bind(Math.floor(now/1000)-86400),
      ...plans.map(p=>db.$client.prepare(p.sql).bind(...p.bindings)),
    ]);
    let retry=0;
    for(let i=0;i<rules.length;i++){
      const row=results[i+1].results?.[0] as {count:number;window_end:number}|undefined;
      if(!row)throw new Error("missing_limit_result");
      if(row.count>rules[i].limit)retry=Math.max(retry,row.window_end-Math.floor(now/1000));
    }
    if(retry)return Response.json({error:"rate_limited",retryAfter:retry},{status:429,headers:{"Cache-Control":"no-store","Retry-After":String(retry)}});
  } catch {return jsonNoStore({error:"auth_temporarily_unavailable"},503);}

  const [existing] = await db.select().from(accounts).where(eq(accounts.username, normalized)).limit(1);
  if (body.action === "register") {
    if (MAINTENANCE_MODE)
      return jsonNoStore({ error: "maintenance", message: MAINTENANCE_MESSAGE }, 503);
    if (existing) return jsonNoStore({ error: "account_already_exists" }, 409);
    const account = { id: crypto.randomUUID(), username: normalized, passwordHash: await hashPassword(password), isGm: false };
    try{await db.insert(accounts).values(account);}catch{
      const [duplicate]=await db.select({id:accounts.id}).from(accounts).where(eq(accounts.username,normalized)).limit(1);
      if(duplicate)return jsonNoStore({error:"account_already_exists"},409);
      return jsonNoStore({error:"auth_temporarily_unavailable"},503);
    }
    const session = await createSession(account.id, loginId).catch(()=>null);
    if(!session)return jsonNoStore({error:"auth_temporarily_unavailable"},503);
    return new Response(JSON.stringify({ account: publicAccount(account), loginId }), {
      headers: { "content-type": "application/json", "set-cookie": sessionCookie(session.token) },
    });
  }
  if (body.action !== "login" || !existing || !(await verifyPassword(password, existing.passwordHash)))
    return jsonNoStore({ error: "invalid_credentials" }, 401);
  if (MAINTENANCE_MODE && !existing.isGm)
    return jsonNoStore({ error: "maintenance", message: MAINTENANCE_MESSAGE }, 503);
  const suspension = accountSuspension(existing);
  if (suspension) return jsonNoStore({ error: "account_suspended", ...suspension }, 403);
  const session = await createSession(existing.id, loginId).catch(()=>null);
  if(!session)return jsonNoStore({error:"auth_temporarily_unavailable"},503);
  return new Response(JSON.stringify({ account: publicAccount(existing), loginId }), {
    headers: { "content-type": "application/json", "set-cookie": sessionCookie(session.token) },
  });
}
