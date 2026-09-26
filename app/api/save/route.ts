import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { gameSaves, saveSnapshots } from "../../../db/schema";
import { currentLogin } from "../auth-utils";
import { applySkillSaveAction, preserveServerSkillSave, type SkillSaveAction } from "../../skill-save-policy";

const validId = (value: string) => /^[a-zA-Z0-9_-]{20,80}$/.test(value);
const normalize = (value: string) => value.trim().toLocaleLowerCase("zh-TW");
const PERSONAL_BOSS_RESET_VERSION = "2026-09-05";
const WORLD_BOSS_RESET_VERSION = "2026-09-14-60s";
const SERVER_CHECKPOINT_INTERVAL_MS = 5 * 60 * 1_000;
const noStoreHeaders = { "Cache-Control": "no-store, max-age=0" };
const jsonNoStore = (body: unknown, status = 200) => Response.json(body, { status, headers: noStoreHeaders });

function resetPersonalBossTicketsIfNeeded(save: Record<string, unknown>) {
  const personalBossReset = save.bossTicketResetVersion !== PERSONAL_BOSS_RESET_VERSION;
  const worldBossReset = save.worldBossResetVersion !== WORLD_BOSS_RESET_VERSION;
  if (!personalBossReset && !worldBossReset) return save;
  return {
    ...save,
    ...(personalBossReset ? {
      bossTickets: 10,
      bossTicketResetVersion: PERSONAL_BOSS_RESET_VERSION,
    } : {}),
    ...(worldBossReset ? {
      worldAttempts: 3,
      worldDamage: 0,
      worldBossResetVersion: WORLD_BOSS_RESET_VERSION,
    } : {}),
  };
}

function authoritativeResponse(save: { payload: string; updatedAt: string }) {
  try {
    const payload = JSON.parse(save.payload) as Record<string, unknown>;
    return jsonNoStore({
      ok: true,
      accepted: false,
      updatedAt: save.updatedAt,
      save: preserveServerSkillSave(resetPersonalBossTicketsIfNeeded(payload), payload) ?? resetPersonalBossTicketsIfNeeded(payload),
    });
  } catch {
    return jsonNoStore({ ok: true, accepted: false, updatedAt: save.updatedAt });
  }
}

function prepareAuthoritativePayload(
  incoming: Record<string, unknown>,
  serverPayload: string,
  sessionId: string,
  clientId: string,
  clientSequence: number,
) {
  const next = { ...incoming, _saveSessionId: sessionId };
  delete next._lastSkillActionId;
  delete next._lastSkillRebirthLegacyCount;
  let serverSave: Record<string, unknown> | null = null;
  try {
    serverSave = JSON.parse(serverPayload) as Record<string, unknown>;
    const serverSessionId = typeof serverSave._saveSessionId === "string" ? serverSave._saveSessionId : "";
    const serverClientId = typeof serverSave._saveClientId === "string" ? serverSave._saveClientId : "";
    const serverSequence = Math.max(0, Number(serverSave._saveSequence ?? 0));
    // Login ownership is validated against the sessions table before this
    // function runs. Save payload metadata must never decide whether a window
    // is current; it is only used to make retries from the active window
    // idempotent.
    if (clientId && serverSessionId === sessionId && serverClientId === clientId && clientSequence <= serverSequence)
      return null;
    const serverRevision = Number(serverSave.adminRevision ?? 0);
    const incomingRevision = Number(next.adminRevision ?? 0);
    if (serverRevision > incomingRevision) {
      for (const field of ["gold", "yuanbao", "enhanceStones", "reforgeStones", "level", "exp"]) {
        if (field in serverSave) next[field] = serverSave[field];
      }
      next.adminRevision = serverRevision;
    }
    if (serverSave._lastSkillActionId) next._lastSkillActionId = serverSave._lastSkillActionId;
    if (typeof serverSave._lastSkillRebirthLegacyCount === "number")
      next._lastSkillRebirthLegacyCount = serverSave._lastSkillRebirthLegacyCount;
  } catch { /* malformed legacy payloads are replaced by the valid incoming save */ }
  const protectedSave = preserveServerSkillSave(next, serverSave);
  return protectedSave ? JSON.stringify(protectedSave) : null;
}

function nextUpdatedAt(previous: string) {
  const now = Date.now();
  const previousTime = Date.parse(previous);
  return new Date(Number.isFinite(previousTime) ? Math.max(now, previousTime + 1) : now).toISOString();
}

async function createServerCheckpointIfDue(
  db: Awaited<ReturnType<typeof getDb>>,
  save: { playerId: string; accountId: string; payload: string },
) {
  const [latest] = await db.select({ capturedAt: saveSnapshots.capturedAt })
    .from(saveSnapshots)
    .where(and(eq(saveSnapshots.accountId, save.accountId), eq(saveSnapshots.kind, "automatic")))
    .orderBy(desc(saveSnapshots.capturedAt))
    .limit(1);
  const lastCapturedAt = latest ? Date.parse(latest.capturedAt) : Number.NaN;
  if (Number.isFinite(lastCapturedAt) && Date.now() - lastCapturedAt < SERVER_CHECKPOINT_INTERVAL_MS) return;
  await db.insert(saveSnapshots).values({
    playerId: save.playerId,
    accountId: save.accountId,
    payload: save.payload,
    kind: "automatic",
    capturedAt: new Date().toISOString(),
  });
}

async function authenticatedLogin(request: Request) {
  const login = await currentLogin(request);
  if (login.account) return { login, response: null } as const;
  const status = login.error === "maintenance" ? 503 : login.error === "account_suspended" ? 403 : 401;
  return {
    login: null,
    response: jsonNoStore({ error: login.error, ...(login.suspension ?? {}) }, status),
  } as const;
}

export async function GET(request: Request) {
  const auth = await authenticatedLogin(request);
  if (!auth.login) return auth.response;
  const account = auth.login.account;
  const playerId = new URL(request.url).searchParams.get("playerId") ?? "";
  if (!validId(playerId))
    return jsonNoStore({ error: "invalid player id" }, 400);
  const db = await getDb();
  const [save] = await db
    .select()
    .from(gameSaves)
    .where(eq(gameSaves.playerId, playerId))
    .limit(1);
  if (!save) return jsonNoStore({ save: null });
  if (save.accountId !== account.id)
    return jsonNoStore({ error: "save_belongs_to_other_account" }, 403);
  // The server owns the checkpoint cadence. This also covers a player who has
  // not changed state recently or whose browser save timer was throttled.
  try { await createServerCheckpointIfDue(db, save); } catch { /* never block loading a valid save */ }
  const savedPayload = JSON.parse(save.payload) as Record<string, unknown>;
  return jsonNoStore({
    save: preserveServerSkillSave(resetPersonalBossTicketsIfNeeded(savedPayload), savedPayload)
      ?? resetPersonalBossTicketsIfNeeded(savedPayload),
    updatedAt: save.updatedAt,
  });
}

export async function POST(request: Request) {
  const auth = await authenticatedLogin(request);
  if (!auth.login) return auth.response;
  const account = auth.login.account;
  const body = (await request.json()) as {
    playerId?: string;
    save?: unknown;
    payload?: unknown;
    expectedUpdatedAt?: string | null;
    action?: "settle_idle" | "claim_idle" | "skill";
    skillAction?: SkillSaveAction;
    skillActionId?: string;
  };
  const playerId = body.playerId ?? "";
  if (!validId(playerId))
    return jsonNoStore({ error: "invalid player id" }, 400);
  const incoming = (body.save ?? body.payload ?? {}) as Record<string, unknown>;
  const normalizedIncoming = resetPersonalBossTicketsIfNeeded(incoming);
  const payload = JSON.stringify(normalizedIncoming);
  const incomingCharacter = normalizedIncoming as {
    accountName?: string;
    playerName?: string;
  };
  if (incomingCharacter.accountName && incomingCharacter.playerName) {
    const db = await getDb();
    const rows = await db.select().from(gameSaves);
    for (const row of rows) {
      if (row.playerId === playerId) continue;
      try {
        const save = JSON.parse(row.payload) as { accountName?: string; playerName?: string };
        if (row.accountId === account.id)
          return jsonNoStore({ error: "account_already_has_character" }, 409);
        if (save.playerName && normalize(save.playerName) === normalize(incomingCharacter.playerName))
          return jsonNoStore({ error: "nickname_already_taken" }, 409);
      } catch {
        // Ignore malformed legacy saves while preserving the rest of the ranking data.
      }
    }
  }
  if (payload.length > 240_000)
    return jsonNoStore({ error: "save is too large" }, 413);
  const db = await getDb();
  const existing = await db
    .select({ accountId: gameSaves.accountId, payload: gameSaves.payload, updatedAt: gameSaves.updatedAt })
    .from(gameSaves)
    .where(eq(gameSaves.playerId, playerId))
    .limit(1);
  if (existing[0] && existing[0].accountId !== account.id)
    return jsonNoStore({ error: "save_belongs_to_other_account" }, 403);
  // The session row, not a cookie timestamp or save payload, owns write
  // authority. A new explicit login replaces this ID and the old window can
  // no longer update the canonical save.
  const sessionId = auth.login.sessionId;

  // Background tabs are throttled by browsers, so do not rely on their timer
  // cadence for idle rewards.  The server is the clock: on resume it settles
  // the elapsed time since the last persisted heartbeat exactly once.
  if (body.action === "settle_idle") {
    if (!existing[0]) return jsonNoStore({ error: "save_not_found" }, 404);
    let current = existing[0];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let serverSave: Record<string, unknown>;
      try {
        serverSave = resetPersonalBossTicketsIfNeeded(JSON.parse(current.payload) as Record<string, unknown>);
      } catch {
        return jsonNoStore({ error: "invalid_saved_payload" }, 500);
      }
      const now = Date.now();
      const lastSeenAt = Number(serverSave.lastSeenAt ?? now);
      const elapsedSeconds = Math.min(
        43_200,
        Math.max(0, Math.floor((now - lastSeenAt) / 1_000)),
      );
      if (serverSave.battleOn === false) {
        const pausedSave = { ...serverSave, lastSeenAt: now, _saveSessionId: sessionId };
        const pausedPayload = JSON.stringify(pausedSave);
        const pausedUpdatedAt = nextUpdatedAt(current.updatedAt);
        const pausedResult = await db.update(gameSaves)
          .set({ accountId: account.id, payload: pausedPayload, updatedAt: pausedUpdatedAt })
          .where(and(eq(gameSaves.playerId, playerId), eq(gameSaves.updatedAt, current.updatedAt)));
        if ((pausedResult.rowsAffected ?? 0) === 1) {
          return jsonNoStore({ ok: true, accepted: true, updatedAt: pausedUpdatedAt, save: pausedSave, idleSecondsAdded: 0 });
        }
        const [latest] = await db
          .select({ accountId: gameSaves.accountId, payload: gameSaves.payload, updatedAt: gameSaves.updatedAt })
          .from(gameSaves)
          .where(eq(gameSaves.playerId, playerId))
          .limit(1);
        if (!latest || latest.accountId !== account.id) return jsonNoStore({ error: "save_retry_required" }, 503);
        current = latest;
        continue;
      }
      if (!elapsedSeconds)
        return jsonNoStore({
          ok: true,
          accepted: false,
          updatedAt: current.updatedAt,
          save: serverSave,
          idleSecondsAdded: 0,
        });
      const settledSave = {
        ...serverSave,
        storedSeconds: Math.min(43_200, Math.max(0, Number(serverSave.storedSeconds ?? 0)) + elapsedSeconds),
        lastSeenAt: now,
        _saveSessionId: sessionId,
      };
      const settledPayload = JSON.stringify(settledSave);
      const updatedAt = nextUpdatedAt(current.updatedAt);
      const result = await db.update(gameSaves)
        .set({ accountId: account.id, payload: settledPayload, updatedAt })
        .where(and(eq(gameSaves.playerId, playerId), eq(gameSaves.updatedAt, current.updatedAt)));
      if ((result.rowsAffected ?? 0) === 1) {
        try {
          await createServerCheckpointIfDue(db, {
            playerId,
            accountId: account.id,
            payload: settledPayload,
          });
        } catch { /* snapshot maintenance never turns a committed save into a failure */ }
        return jsonNoStore({
          ok: true,
          accepted: true,
          updatedAt,
          save: settledSave,
          idleSecondsAdded: elapsedSeconds,
        });
      }
      const [latest] = await db
        .select({ accountId: gameSaves.accountId, payload: gameSaves.payload, updatedAt: gameSaves.updatedAt })
        .from(gameSaves)
        .where(eq(gameSaves.playerId, playerId))
        .limit(1);
      if (!latest || latest.accountId !== account.id)
        return jsonNoStore({ error: "save_retry_required" }, 503);
      current = latest;
    }
    return authoritativeResponse(current);
  }
  if (body.action === "claim_idle") {
    if (!existing[0]) return jsonNoStore({ error: "save_not_found" }, 404);
    let current = existing[0];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let serverSave: Record<string, unknown>;
      try {
        serverSave = resetPersonalBossTicketsIfNeeded(JSON.parse(current.payload) as Record<string, unknown>);
      } catch {
        return jsonNoStore({ error: "invalid_saved_payload" }, 500);
      }
      const now = Date.now();
      const claimedSeconds = Math.min(43_200, Math.max(0, Number(serverSave.storedSeconds ?? 0)));
      const claimedSave = { ...serverSave, storedSeconds: 0, lastSeenAt: now, battleOn: false, _saveSessionId: sessionId };
      const claimedPayload = JSON.stringify(claimedSave);
      const updatedAt = nextUpdatedAt(current.updatedAt);
      const result = await db.update(gameSaves)
        .set({ accountId: account.id, payload: claimedPayload, updatedAt })
        .where(and(eq(gameSaves.playerId, playerId), eq(gameSaves.updatedAt, current.updatedAt)));
      if ((result.rowsAffected ?? 0) === 1) return jsonNoStore({ ok: true, accepted: true, updatedAt, claimedSeconds });
      const [latest] = await db
        .select({ accountId: gameSaves.accountId, payload: gameSaves.payload, updatedAt: gameSaves.updatedAt })
        .from(gameSaves)
        .where(eq(gameSaves.playerId, playerId))
        .limit(1);
      if (!latest || latest.accountId !== account.id) return jsonNoStore({ error: "save_retry_required" }, 503);
      current = latest;
    }
    return jsonNoStore({ error: "claim_retry_required" }, 503);
  }
  if (body.action === "skill") {
    if (!existing[0]) return jsonNoStore({ error: "save_not_found" }, 404);
    const actionId = body.skillActionId;
    if (!actionId || !/^[a-f0-9-]{36}$/.test(actionId) || !body.skillAction)
      return jsonNoStore({ error: "invalid_skill_action" }, 400);
    let current = existing[0];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let previous: Record<string, unknown>;
      try { previous = JSON.parse(current.payload) as Record<string, unknown>; }
      catch { return jsonNoStore({ error: "invalid_saved_payload" }, 409); }
      if (previous._lastSkillActionId === actionId)
        return jsonNoStore({ ok: true, accepted: false, updatedAt: current.updatedAt,
          skillReworkBuild: previous.skillReworkBuild, skillAscensions: previous.skillAscensions });
      const next = applySkillSaveAction(previous, body.skillAction);
      if (!next) return jsonNoStore({ error: "skill_action_rejected" }, 409);
      next._lastSkillActionId = actionId;
      next._saveSessionId = sessionId;
      const nextPayload = JSON.stringify(next);
      if (nextPayload.length > 240_000) return jsonNoStore({ error: "save is too large" }, 413);
      const updatedAt = nextUpdatedAt(current.updatedAt);
      const result = await db.update(gameSaves)
        .set({ accountId: account.id, payload: nextPayload, updatedAt })
        .where(and(eq(gameSaves.playerId, playerId), eq(gameSaves.updatedAt, current.updatedAt)));
      if ((result.rowsAffected ?? 0) === 1) {
        return jsonNoStore({ ok: true, accepted: true, updatedAt,
          skillReworkBuild: next.skillReworkBuild, skillAscensions: next.skillAscensions });
      }
      const [latest] = await db.select({ accountId: gameSaves.accountId, payload: gameSaves.payload, updatedAt: gameSaves.updatedAt })
        .from(gameSaves).where(eq(gameSaves.playerId, playerId)).limit(1);
      if (!latest || latest.accountId !== account.id) return jsonNoStore({ error: "save_retry_required" }, 503);
      current = latest;
    }
    return authoritativeResponse(current);
  }
  const requestId = typeof normalizedIncoming._saveRequestId === "string" ? normalizedIncoming._saveRequestId : "";
  const clientId = typeof normalizedIncoming._saveClientId === "string" ? normalizedIncoming._saveClientId : "";
  const clientSequence = Math.max(0, Number(normalizedIncoming._saveSequence ?? 0));
  if (existing[0] && requestId && existing[0].payload === payload) {
    try {
      const serverSave = JSON.parse(existing[0].payload) as Record<string, unknown>;
      if (serverSave._saveRequestId === requestId)
        return jsonNoStore({ ok: true, updatedAt: existing[0].updatedAt });
    } catch { /* continue with the normal save path */ }
  }
  const initialSave = preserveServerSkillSave(normalizedIncoming, null);
  if (!initialSave) return jsonNoStore({ error: "invalid_skill_save_class_or_level" }, 400);
  delete initialSave._lastSkillActionId;
  delete initialSave._lastSkillRebirthLegacyCount;
  let finalPayload = JSON.stringify({ ...initialSave, _saveSessionId: sessionId });
  let updatedAt = new Date().toISOString();
  if (existing[0]) {
    let current = existing[0];
    let saved = false;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const prepared = prepareAuthoritativePayload(normalizedIncoming, current.payload, sessionId, clientId, clientSequence);
      if (!prepared) {
        // The server wins this race. The client will discard its local state
        // and reload the canonical payload instead of logging the player out.
        return authoritativeResponse(current);
      }
      finalPayload = prepared;
      if (finalPayload.length > 240_000) return jsonNoStore({ error: "save is too large" }, 413);
      updatedAt = nextUpdatedAt(current.updatedAt);
      const result = await db.update(gameSaves)
        .set({ accountId: account.id, payload: finalPayload, updatedAt })
        .where(and(eq(gameSaves.playerId, playerId), eq(gameSaves.updatedAt, current.updatedAt)));
      if ((result.rowsAffected ?? 0) === 1) {
        saved = true;
        break;
      }
      const [latest] = await db
        .select({ accountId: gameSaves.accountId, payload: gameSaves.payload, updatedAt: gameSaves.updatedAt })
        .from(gameSaves)
        .where(eq(gameSaves.playerId, playerId))
        .limit(1);
      if (!latest || latest.accountId !== account.id)
        return jsonNoStore({ error: "save_retry_required" }, 503);
      current = latest;
    }
    if (!saved) return authoritativeResponse(current);
    try {
      await createServerCheckpointIfDue(db, {
        playerId,
        accountId: account.id,
        payload: finalPayload,
      });
    } catch { /* snapshot maintenance never turns a committed save into a failure */ }
  } else {
    if (finalPayload.length > 240_000) return jsonNoStore({ error: "save is too large" }, 413);
    await db.batch([
      db.insert(gameSaves).values({ accountId: account.id, playerId, payload: finalPayload, updatedAt }),
      db.insert(saveSnapshots).values({
        playerId,
        accountId: account.id,
        payload: finalPayload,
        kind: "automatic",
        capturedAt: updatedAt,
      }),
    ]);
  }
  // Keep cleanup best-effort: a successful save must not be reported as a
  // failure merely because old automatic snapshots could not be trimmed.
  try {
    const automaticSnapshots = await db
      .select({ id: saveSnapshots.id })
      .from(saveSnapshots)
      .where(and(eq(saveSnapshots.accountId, account.id), eq(saveSnapshots.kind, "automatic")))
      .orderBy(desc(saveSnapshots.capturedAt))
      .offset(24);
    if (automaticSnapshots.length) await db.batch(automaticSnapshots.map((snapshot) => db.delete(saveSnapshots).where(eq(saveSnapshots.id, snapshot.id))));
  } catch { /* recovery data is retained; cleanup can be retried later */ }
  return jsonNoStore({ ok: true, accepted: true, updatedAt });
}
