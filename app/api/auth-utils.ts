import { and, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { accounts, sessions } from "../../db/schema";
import { MAINTENANCE_MODE } from "../maintenance";

export const SESSION_COOKIE = "dark_world_session";
export const LOGIN_ID_HEADER = "x-dark-world-login-id";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const encoder = new TextEncoder();

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function digest(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64(new Uint8Array(hash));
}

export async function hashPassword(password: string, salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)))) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: base64ToBytes(salt), iterations: 100_000, hash: "SHA-256" },
    key,
    256,
  );
  return `${salt}:${bytesToBase64(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = await hashPassword(password, salt);
  return actual === `${salt}:${expected}`;
}

export async function currentAccount(request: Request) {
  const context = await sessionContext(request);
  return context?.account &&
    !accountSuspension(context.account) &&
    (!MAINTENANCE_MODE || context.account.isGm)
    ? context.account
    : null;
}

export function accountSuspension(account: {
  suspendedAt: string | null;
  suspendedUntil: string | null;
  suspensionReason: string | null;
}) {
  if (!account.suspendedAt) return null;
  if (account.suspendedUntil && Date.parse(account.suspendedUntil) <= Date.now()) return null;
  return {
    reason: account.suspensionReason || "違反遊戲規範",
    until: account.suspendedUntil,
  };
}

export async function currentAccountSuspension(request: Request) {
  const context = await sessionContext(request);
  return context?.account ? accountSuspension(context.account) : null;
}

async function sessionContext(request: Request) {
  const token = readSessionToken(request);
  if (!token) return null;
  const db = await getDb();
  const tokenHash = await digest(token);
  const [session] = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)).limit(1);
  if (!session || Date.parse(session.expiresAt) <= Date.now()) return null;
  await db.update(sessions).set({ lastSeenAt: new Date().toISOString() }).where(eq(sessions.tokenHash, tokenHash));
  const [account] = await db.select().from(accounts).where(eq(accounts.id, session.accountId)).limit(1);
  return account ? { account, session, tokenHash } : null;
}

export async function currentLogin(request: Request) {
  const requestedLoginId = request.headers.get(LOGIN_ID_HEADER)?.trim() ?? "";
  const context = await sessionContext(request);
  if (!context) {
    return {
      account: null,
      error: requestedLoginId ? "session_replaced" : "not_authenticated",
      suspension: null,
      sessionId: null,
    } as const;
  }
  const suspension = accountSuspension(context.account);
  if (suspension) {
    return { account: null, error: "account_suspended", suspension, sessionId: null } as const;
  }
  if (MAINTENANCE_MODE && !context.account.isGm) {
    return { account: null, error: "maintenance", suspension: null, sessionId: null } as const;
  }
  if (!requestedLoginId || context.session.loginId !== requestedLoginId) {
    return { account: null, error: "session_replaced", suspension: null, sessionId: null } as const;
  }
  return {
    account: context.account,
    error: null,
    suspension: null,
    sessionId: context.tokenHash,
  } as const;
}

export async function isActiveSession(request: Request, accountId: string) {
  return Boolean(await activeSessionId(request, accountId));
}

export async function activeSessionId(request: Request, accountId: string) {
  const token = readSessionToken(request);
  if (!token) return null;
  const db = await getDb();
  const tokenHash = await digest(token);
  const [session] = await db
    .select({ accountId: sessions.accountId, expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);
  return (
    session &&
      session.accountId === accountId &&
      Date.parse(session.expiresAt) > Date.now()
      ? tokenHash
      : null
  );
}

export async function createSession(accountId: string, loginId: string) {
  const token = bytesToBase64(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const db = await getDb();
  // 一個帳號只保留最新登入環境；新的登入會讓舊視窗的 session 失效。
  await db.delete(sessions).where(eq(sessions.accountId, accountId));
  await db.insert(sessions).values({
    tokenHash: await digest(token),
    accountId,
    loginId,
    expiresAt,
  });
  return { token, expiresAt };
}

export function sessionCookie(token: string, maxAgeSeconds = SESSION_TTL_MS / 1000) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export async function deleteSession(request: Request) {
  const token = readSessionToken(request);
  if (!token) return false;
  const db = await getDb();
  const loginId = request.headers.get(LOGIN_ID_HEADER)?.trim() ?? "";
  if (!loginId) return false;
  const result = await db.delete(sessions).where(and(
    eq(sessions.tokenHash, await digest(token)),
    eq(sessions.loginId, loginId),
  ));
  return (result.rowsAffected ?? 0) === 1;
}

export function normalizeUsername(value: string) {
  return value.trim().toLocaleLowerCase("zh-TW");
}

function readSessionToken(request: Request) {
  const encoded = request.headers.get("cookie")?.match(
    new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`),
  )?.[1];
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}
