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
  const body = (await request.json()) as {
    action?: "register" | "login" | "logout";
    username?: string;
    password?: string;
    loginId?: string;
  };
  if (body.action === "logout") {
    const deleted = await deleteSession(request);
    if (!deleted) return jsonNoStore({ ok: false, error: "session_replaced" }, 409);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json", "set-cookie": sessionCookie("", 0) },
    });
  }
  const username = body.username?.trim() ?? "";
  const password = body.password ?? "";
  const loginId = body.loginId?.trim() ?? "";
  if (!/^[^\s]{3,24}$/.test(username) || password.length < 6 || password.length > 128)
    return jsonNoStore({ error: "invalid_credentials" }, 400);
  if (!/^[a-zA-Z0-9_-]{20,80}$/.test(loginId))
    return jsonNoStore({ error: "invalid_login_instance" }, 400);

  const db = await getDb();
  const normalized = normalizeUsername(username);
  const [existing] = await db.select().from(accounts).where(eq(accounts.username, normalized)).limit(1);
  if (body.action === "register") {
    if (MAINTENANCE_MODE)
      return jsonNoStore({ error: "maintenance", message: MAINTENANCE_MESSAGE }, 503);
    if (existing) return jsonNoStore({ error: "account_already_exists" }, 409);
    const account = { id: crypto.randomUUID(), username: normalized, passwordHash: await hashPassword(password), isGm: false };
    await db.insert(accounts).values(account);
    const session = await createSession(account.id, loginId);
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
  const session = await createSession(existing.id, loginId);
  return new Response(JSON.stringify({ account: publicAccount(existing), loginId }), {
    headers: { "content-type": "application/json", "set-cookie": sessionCookie(session.token) },
  });
}
