import { affectedRows } from "../../d1-write-result";
import {damageEventStatement,deliverWorldBossMail,worldBossClaimStatements} from "../../world-boss-rewards";
import {isDuplicateSaveSnapshot} from "../../save-sync-disposition";
import {finalizePendingRebirth} from "../../rebirth-save";
import {applyEquipmentAction,preserveEquipmentSave,repairInheritedLoadout,type EquipmentAction} from "../../equipment-save-policy";
import { invalidSaveField, saveDisplay } from "../../save-field-schema";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { gameSaves, saveSnapshots, sessions, gmActionLogs } from "../../../db/schema";
import { activeSaveSession } from "../../save-session-guard";
import { applyDailyHuntClaim, preserveServerDailyHuntClaim, taipeiDailyDate } from "../../daily-hunt-claim";
import { advanceOnlineYuanbao, preserveServerOnlineYuanbao } from "../../online-yuanbao";
import { buyYuanbaoCosmetic, buyYuanbaoReforgeBundle, cosmeticSku, preserveServerShopPurchases } from "../../shop-purchase";
import { preserveServerResourceRevision } from "../../server-resource-revision";
import { currentLogin } from "../auth-utils";
import { applySkillSaveActionOnce, preserveServerSkillSave, type SkillSaveAction } from "../../skill-save-policy";
import { prepareIdleClaim, preserveServerIdleClaim, settleIdleSave } from "../../idle-claim";

import { SaveIntegrityError, validateSaveTransition } from "../../save-integrity";
import { integrityAuditDetail } from "../../save-integrity-audit";

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

function snapshotResponse(save: {payload:string;updatedAt:string},incoming:Record<string,unknown>,sessionId:string){
  try{
    if(isDuplicateSaveSnapshot(incoming,JSON.parse(save.payload),sessionId))
      return jsonNoStore({ok:true,accepted:false,reason:"already_applied",updatedAt:save.updatedAt});
  }catch{ /* canonical response retains malformed-save handling */ }
  return authoritativeResponse(save);
}

function authoritativeResponse(save: { payload: string; updatedAt: string }) {
  try {
    const payload = JSON.parse(save.payload) as Record<string, unknown>;
    return jsonNoStore({
      ok: true,
      accepted: false,
      updatedAt: save.updatedAt,
      save: saveDisplay(preserveServerSkillSave(
        preserveServerShopPurchases(preserveServerOnlineYuanbao(preserveServerDailyHuntClaim(resetPersonalBossTicketsIfNeeded(payload), payload), payload), payload), payload,
      ) ?? preserveServerDailyHuntClaim(resetPersonalBossTicketsIfNeeded(payload), payload)),
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
  savedAt: number,
) {
  const next: Record<string, unknown> = { ...incoming, _saveSessionId: sessionId };
  delete next._lastSkillActionId;
  delete next._paidSkillResetActionIds;
  delete next._skillActionIds;
  delete next._lastSkillRebirthLegacyCount;
  let serverSave: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(serverPayload) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new TypeError("invalid stored payload");
    serverSave = parsed as Record<string, unknown>;
    const serverSessionId = typeof serverSave._saveSessionId === "string" ? serverSave._saveSessionId : "";
    const serverClientId = typeof serverSave._saveClientId === "string" ? serverSave._saveClientId : "";
    const serverSequence = Math.max(0, Number(serverSave._saveSequence ?? 0));
    // Login ownership is validated against the sessions table before this
    // function runs. Save payload metadata must never decide whether a window
    // is current; it is only used to make retries from the active window
    // idempotent.
    if (clientId && serverSessionId === sessionId && serverClientId === clientId && clientSequence <= serverSequence)
      return null;
    if (serverSave._lastSkillActionId) next._lastSkillActionId = serverSave._lastSkillActionId;
    if (Array.isArray(serverSave._paidSkillResetActionIds))
      next._paidSkillResetActionIds = serverSave._paidSkillResetActionIds;
    if (Array.isArray(serverSave._skillActionIds)) next._skillActionIds = serverSave._skillActionIds;
    if (typeof serverSave._lastSkillRebirthLegacyCount === "number")
      next._lastSkillRebirthLegacyCount = serverSave._lastSkillRebirthLegacyCount;
  } catch { /* malformed legacy payloads are replaced by the valid incoming save */ }
  // Only repair an inherited configuration already present in the canonical
  // old save. Newly submitted illegal ids/slots still fail validation.
  const inherited=serverSave?repairInheritedLoadout(next,serverSave):next;
  const guarded = preserveServerResourceRevision(serverSave?preserveEquipmentSave(inherited,serverSave):inherited, serverSave);
  if (!guarded) return null;
  const protectedSave = preserveServerSkillSave(preserveServerShopPurchases(preserveServerOnlineYuanbao(preserveServerDailyHuntClaim(guarded, serverSave), serverSave), serverSave), serverSave);
  if (!protectedSave || !serverSave) return null;
  return JSON.stringify(validateSaveTransition(preserveServerIdleClaim(protectedSave, serverSave), serverSave, Date.now(), savedAt));
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
  await deliverWorldBossMail(db.$client,account.id);
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
  if (save.accountId) {
    try { await createServerCheckpointIfDue(db, { ...save, accountId: save.accountId }); }
    catch { /* never block loading a valid save */ }
  }
  const savedPayload = JSON.parse(save.payload) as Record<string, unknown>;
  // Recover the previous two-step rebirth only when a server-issued receipt
  // and ascension advancement prove the reset was already authorized.
  const recovered=finalizePendingRebirth(savedPayload);
  if(recovered!==savedPayload){
    const updatedAt=nextUpdatedAt(save.updatedAt);
    await db.insert(saveSnapshots).values({playerId,accountId:account.id,payload:save.payload,kind:"rebirth_recovery",capturedAt:new Date().toISOString()});
    const changed=await db.update(gameSaves).set({payload:JSON.stringify(recovered),updatedAt})
      .where(and(eq(gameSaves.playerId,playerId),eq(gameSaves.updatedAt,save.updatedAt),activeSaveSession(auth.login.sessionId,account.id)));
    if(affectedRows(changed)===1)return jsonNoStore({save:saveDisplay(recovered),updatedAt});
    const [latest]=await db.select({accountId:gameSaves.accountId,payload:gameSaves.payload,updatedAt:gameSaves.updatedAt}).from(gameSaves).where(eq(gameSaves.playerId,playerId)).limit(1);
    if(!latest||latest.accountId!==account.id)return jsonNoStore({error:"save_retry_required"},503);
    return jsonNoStore({save:saveDisplay(JSON.parse(latest.payload)),updatedAt:latest.updatedAt});
  }
  // Preserve the pre-cutover save before removing legacy skill fields. A
  // concurrent save wins via updatedAt CAS and is reloaded rather than overwritten.
  if (Number(savedPayload.skillReworkVersion) < 2 || !Number.isInteger(savedPayload.skillReworkVersion) ||
      Object.hasOwn(savedPayload, "skills") || Object.hasOwn(savedPayload, "skillPoints")) {
    const migrated = preserveServerSkillSave(savedPayload, savedPayload);
    if (!migrated) return jsonNoStore({ error: "invalid_skill_save_class_or_level" }, 409);
    try {
      await db.insert(saveSnapshots).values({
        playerId, accountId: account.id, payload: save.payload,
        kind: "skill_reset_v2", capturedAt: new Date().toISOString(),
      });
      const updatedAt = nextUpdatedAt(save.updatedAt);
      const changed = await db.update(gameSaves)
        .set({ payload: JSON.stringify(migrated), updatedAt })
        .where(and(eq(gameSaves.playerId, playerId), eq(gameSaves.updatedAt, save.updatedAt)));
      if (affectedRows(changed) === 1) {
        return jsonNoStore({ save: saveDisplay(migrated), updatedAt });
      }
      const [latest] = await db.select({ accountId: gameSaves.accountId, payload: gameSaves.payload,
        updatedAt: gameSaves.updatedAt }).from(gameSaves)
        .where(eq(gameSaves.playerId, playerId)).limit(1);
      if (!latest || latest.accountId !== account.id) return jsonNoStore({ error: "save_retry_required" }, 503);
      const latestPayload = JSON.parse(latest.payload) as Record<string, unknown>;
      return jsonNoStore({ save: saveDisplay(preserveServerSkillSave(latestPayload, latestPayload)), updatedAt: latest.updatedAt });
    } catch {
      // Never return a refunded build unless it was durably committed.
      return jsonNoStore({ error: "skill_reset_retry_required" }, 503);
    }
  }
  return jsonNoStore({
    save: saveDisplay(preserveServerSkillSave(
      preserveServerShopPurchases(preserveServerOnlineYuanbao(preserveServerDailyHuntClaim(resetPersonalBossTicketsIfNeeded(savedPayload), savedPayload), savedPayload), savedPayload), savedPayload,
    ) ?? preserveServerDailyHuntClaim(resetPersonalBossTicketsIfNeeded(savedPayload), savedPayload)),
    updatedAt: save.updatedAt,
  });
}

export async function POST(request: Request) {
  const auth = await authenticatedLogin(request);
  if (!auth.login) return auth.response;
  const account = auth.login.account;
  let parsedBody: unknown;
  try { parsedBody = await request.json(); } catch { return jsonNoStore({ error: "invalid_json" }, 400); }
  if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) return jsonNoStore({ error: "invalid_request" }, 400);
  const body = parsedBody as {
    playerId?: string;
    save?: unknown;
    payload?: unknown;
    expectedUpdatedAt?: string | null;
    equipmentAction?: EquipmentAction;
    action?: "settle_idle" | "claim_idle" | "claim_daily" | "heartbeat_online" | "shop_reforge" | "shop_cosmetic" | "skill" | "equipment";
    dailyDate?: string;
    dailyKills?: number;
    skillAction?: SkillSaveAction;
    skillActionId?: string;
    purchaseId?: string;
    claimId?: string;
    shopItem?: string;
  };
  if(typeof body.playerId!=="string")return jsonNoStore({error:"invalid player id"},400);
  for(const key of ["action","claimId","purchaseId","shopItem","skillActionId"] as const)
    if(body[key]!==undefined&&typeof body[key]!=="string")return jsonNoStore({error:"invalid_request"},400);
  const playerId = body.playerId;
  if (!validId(playerId))
    return jsonNoStore({ error: "invalid player id" }, 400);
  const rawIncoming = body.save ?? body.payload ?? {};
  if (!rawIncoming || typeof rawIncoming !== "object" || Array.isArray(rawIncoming)) return jsonNoStore({ error: "invalid_save" }, 400);
  const incoming = rawIncoming as Record<string, unknown>;
  const invalidField=invalidSaveField(incoming);
  if(invalidField){
    // A rejected malformed upload is still visible to the GM, without exposing
    // another account's canonical data or letting audit failure permit a save.
    try {
      const db=await getDb();
      const [stored]=await db.select({payload:gameSaves.payload,accountId:gameSaves.accountId}).from(gameSaves).where(eq(gameSaves.playerId,playerId)).limit(1);
      if(stored?.accountId===account.id){
        const [recent]=await db.select({createdAt:gmActionLogs.createdAt}).from(gmActionLogs).where(and(eq(gmActionLogs.targetAccountId,account.id),eq(gmActionLogs.action,"save_integrity_rejected"))).orderBy(desc(gmActionLogs.createdAt)).limit(1);
        if(!recent||Date.now()-Date.parse(recent.createdAt)>=60000)await db.insert(gmActionLogs).values({gmAccountId:"system",targetAccountId:account.id,action:"save_integrity_rejected",detail:integrityAuditDetail(playerId,"invalid_save_field",JSON.parse(stored.payload),incoming,invalidField),createdAt:new Date().toISOString()});
      }
    }catch{/* Reject even if audit cannot be stored. */}
    return jsonNoStore({error:"save_integrity_rejected",reason:"invalid_save_field",field:invalidField},409);
  }
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
  await deliverWorldBossMail(db.$client,account.id);
  const existing = await db
    .select({ accountId: gameSaves.accountId, payload: gameSaves.payload, updatedAt: gameSaves.updatedAt })
    .from(gameSaves)
    .where(eq(gameSaves.playerId, playerId))
    .limit(1);
  if (existing[0] && existing[0].accountId !== account.id)
    return jsonNoStore({ error: "save_belongs_to_other_account" }, 403);
  if (existing[0]) {
    try {
      const saved = JSON.parse(existing[0].payload) as Record<string, unknown>;
      if(!body.action&&saved._worldBossMailDeliveryId&&incoming._worldBossMailDeliveryId!==saved._worldBossMailDeliveryId)return authoritativeResponse(existing[0]);
      if (!Number.isInteger(saved.skillReworkVersion) || Number(saved.skillReworkVersion) < 2)
        return jsonNoStore({ error: "skill_reset_login_required" }, 409);
    } catch { return jsonNoStore({ error: "invalid_saved_payload" }, 409); }
  }
  // The session row, not a cookie timestamp or save payload, owns write
  // authority. A new explicit login replaces this ID and the old window can
  // no longer update the canonical save.
  const sessionId = auth.login.sessionId;
  const writerCondition = () => activeSaveSession(sessionId, account.id);
  const writerRevoked = async () => {
    const [active] = await db.select({ tokenHash: sessions.tokenHash }).from(sessions)
      .where(and(eq(sessions.tokenHash, sessionId), eq(sessions.accountId, account.id),
        gt(sessions.expiresAt, new Date().toISOString()))).limit(1);
    return !active;
  };
  const replacedResponse = () => jsonNoStore({ error: "session_replaced" }, 401);

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
      const { elapsedSeconds, save: settledSave } = settleIdleSave(serverSave, Date.now(), sessionId);
      // Manual idle pausing was removed. A legacy paused save, or a tab closed
      // while confirming rewards, must still accumulate its elapsed time.
      if (!elapsedSeconds && serverSave.battleOn !== false)
        return jsonNoStore({
          ok: true,
          accepted: false,
          updatedAt: current.updatedAt,
          save: serverSave,
          idleSecondsAdded: 0,
        });
      const settledPayload = JSON.stringify(settledSave);
      const updatedAt = nextUpdatedAt(current.updatedAt);
      const result = await db.update(gameSaves)
        .set({ accountId: account.id, payload: settledPayload, updatedAt })
        .where(and(eq(gameSaves.playerId, playerId), eq(gameSaves.updatedAt, current.updatedAt), writerCondition()));
      if (affectedRows(result) === 1) {
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
      if (await writerRevoked()) return replacedResponse();
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
    const claimId = body.claimId ?? "";
    if (claimId && !/^[a-f0-9-]{36}$/.test(claimId))
      return jsonNoStore({ error: "invalid_claim_id" }, 400);
    let current = existing[0];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let serverSave: Record<string, unknown>;
      try {
        serverSave = resetPersonalBossTicketsIfNeeded(JSON.parse(current.payload) as Record<string, unknown>);
      } catch {
        return jsonNoStore({ error: "invalid_saved_payload" }, 500);
      }
      const claim = prepareIdleClaim(serverSave, claimId, Date.now(), sessionId);
      if (!claim.accepted)
        return jsonNoStore({ ok: true, accepted: false, updatedAt: current.updatedAt,
          claimedSeconds: claim.claimedSeconds });
      const claimedPayload = JSON.stringify(claim.save);
      const updatedAt = nextUpdatedAt(current.updatedAt);
      const result = await db.update(gameSaves)
        .set({ accountId: account.id, payload: claimedPayload, updatedAt })
        .where(and(eq(gameSaves.playerId, playerId), eq(gameSaves.updatedAt, current.updatedAt), writerCondition()));
      if (affectedRows(result) === 1)
        return jsonNoStore({ ok: true, accepted: true, updatedAt, claimedSeconds: claim.claimedSeconds });
      if (await writerRevoked()) return replacedResponse();
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
  if(body.action === "equipment"){
    if(!existing[0])return jsonNoStore({error:"save_not_found"},404);
    const action=body.equipmentAction;
    if(!action||typeof action!=="object"||Array.isArray(action))return jsonNoStore({error:"invalid_equipment_action"},400);
    let current=existing[0];
    for(let attempt=0;attempt<4;attempt++){
      const saved=JSON.parse(current.payload) as Record<string,unknown>;
      const applied=applyEquipmentAction(saved,action);
      if(!applied)return jsonNoStore({error:"equipment_action_rejected"},409);
      if(!applied.accepted)return jsonNoStore({ok:true,accepted:false,item:applied.item,receipt:applied.receipt,adminRevision:applied.save.adminRevision??0,updatedAt:current.updatedAt});
      const payload=JSON.stringify({...applied.save,_saveSessionId:sessionId});
      if(payload.length>240000)return jsonNoStore({error:"save is too large"},413);
      const updatedAt=nextUpdatedAt(current.updatedAt);
      const changed=await db.update(gameSaves).set({payload,updatedAt}).where(and(eq(gameSaves.playerId,playerId),eq(gameSaves.updatedAt,current.updatedAt),writerCondition()));
      if(affectedRows(changed)>0)return jsonNoStore({ok:true,accepted:true,item:applied.item,receipt:applied.receipt,adminRevision:applied.save.adminRevision,updatedAt});
      if(await writerRevoked())return replacedResponse();
      const [latest]=await db.select({accountId:gameSaves.accountId,payload:gameSaves.payload,updatedAt:gameSaves.updatedAt}).from(gameSaves).where(and(eq(gameSaves.playerId,playerId),eq(gameSaves.accountId,account.id))).limit(1);
      if(!latest)return jsonNoStore({error:"save_not_found"},404);current=latest;
    }
    return jsonNoStore({error:"equipment_retry_required"},503);
  }

  if (body.action === "shop_reforge" || body.action === "shop_cosmetic") {
    if (!existing[0]) return jsonNoStore({ error: "save_not_found" }, 404);
    const purchaseId = body.purchaseId;
    if (!purchaseId || !/^[a-f0-9-]{36}$/.test(purchaseId))
      return jsonNoStore({ error: "invalid_purchase_id" }, 400);
    if (body.action === "shop_cosmetic" && !cosmeticSku(body.shopItem))
      return jsonNoStore({ error: "invalid_shop_item" }, 400);
    let current = existing[0];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let previous: Record<string, unknown>;
      try { previous = JSON.parse(current.payload) as Record<string, unknown>; }
      catch { return jsonNoStore({ error: "invalid_saved_payload" }, 409); }
      const purchase = body.action === "shop_cosmetic" && cosmeticSku(body.shopItem)
        ? buyYuanbaoCosmetic(previous, body.shopItem, purchaseId)
        : buyYuanbaoReforgeBundle(previous, purchaseId);
      if (!purchase) return jsonNoStore({ error: "purchase_rejected" }, 409);
      if (!purchase.accepted)
        return jsonNoStore({ ok: true, accepted: false, updatedAt: current.updatedAt,
          yuanbao: previous.yuanbao, reforgeStones: previous.reforgeStones,
          ownedTitles: previous.ownedTitles, ownedAppearances: previous.ownedAppearances,
          selectedTitle: previous.selectedTitle, selectedAppearance: previous.selectedAppearance,
          adminRevision: previous.adminRevision });
      const next: Record<string, unknown> = { ...purchase.save, _saveSessionId: sessionId };
      const nextPayload = JSON.stringify(next);
      if (nextPayload.length > 240_000) return jsonNoStore({ error: "save is too large" }, 413);
      const updatedAt = nextUpdatedAt(current.updatedAt);
      const result = await db.update(gameSaves)
        .set({ accountId: account.id, payload: nextPayload, updatedAt })
        .where(and(eq(gameSaves.playerId, playerId), eq(gameSaves.updatedAt, current.updatedAt), writerCondition()));
      if (affectedRows(result) === 1)
        return jsonNoStore({ ok: true, accepted: true, updatedAt,
          yuanbao: next.yuanbao, reforgeStones: next.reforgeStones,
          ownedTitles: next.ownedTitles, ownedAppearances: next.ownedAppearances,
          selectedTitle: next.selectedTitle, selectedAppearance: next.selectedAppearance,
          adminRevision: next.adminRevision });
      if (await writerRevoked()) return replacedResponse();
      const [latest] = await db.select({ accountId: gameSaves.accountId, payload: gameSaves.payload,
        updatedAt: gameSaves.updatedAt }).from(gameSaves).where(eq(gameSaves.playerId, playerId)).limit(1);
      if (!latest || latest.accountId !== account.id) return jsonNoStore({ error: "save_retry_required" }, 503);
      current = latest;
    }
    return authoritativeResponse(current);
  }
  if (body.action === "heartbeat_online") {
    if (!existing[0]) return jsonNoStore({ error: "save_not_found" }, 404);
    let current = existing[0];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let previous: Record<string, unknown>;
      try { previous = JSON.parse(current.payload) as Record<string, unknown>; }
      catch { return jsonNoStore({ error: "invalid_saved_payload" }, 409); }
      const advanced = advanceOnlineYuanbao(previous, Date.now(), sessionId);
      if (!advanced) return jsonNoStore({ error: "online_heartbeat_rejected" }, 409);
      const next: Record<string, unknown> = { ...advanced.save, _saveSessionId: sessionId };
      const nextPayload = JSON.stringify(next);
      if (nextPayload.length > 240_000) return jsonNoStore({ error: "save is too large" }, 413);
      const updatedAt = nextUpdatedAt(current.updatedAt);
      const result = await db.update(gameSaves)
        .set({ accountId: account.id, payload: nextPayload, updatedAt })
        .where(and(eq(gameSaves.playerId, playerId), eq(gameSaves.updatedAt, current.updatedAt), writerCondition()));
      if (affectedRows(result) === 1)
        return jsonNoStore({ ok: true, accepted: true, updatedAt, reward: advanced.reward,
          yuanbao: next.yuanbao, adminRevision: next.adminRevision, idleSeconds: next.idleSeconds });
      if (await writerRevoked()) return replacedResponse();
      const [latest] = await db.select({ accountId: gameSaves.accountId, payload: gameSaves.payload,
        updatedAt: gameSaves.updatedAt }).from(gameSaves).where(eq(gameSaves.playerId, playerId)).limit(1);
      if (!latest || latest.accountId !== account.id) return jsonNoStore({ error: "save_retry_required" }, 503);
      current = latest;
    }
    return authoritativeResponse(current);
  }
  if (body.action === "claim_daily") {
    if (!existing[0]) return jsonNoStore({ error: "save_not_found" }, 404);
    const today = taipeiDailyDate();
    let current = existing[0];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let previous: Record<string, unknown>;
      try { previous = JSON.parse(current.payload) as Record<string, unknown>; }
      catch { return jsonNoStore({ error: "invalid_saved_payload" }, 409); }
      const outcome = applyDailyHuntClaim(previous, { dailyDate: body.dailyDate, dailyKills: body.dailyKills }, today);
      if (!outcome) return jsonNoStore({ error: "daily_claim_rejected" }, 409);
      if (!outcome.accepted)
        return jsonNoStore({ ok: true, accepted: false, updatedAt: current.updatedAt,
          gold: previous.gold, enhanceStones: previous.enhanceStones,
          reforgeStones: previous.reforgeStones, yuanbao: previous.yuanbao,
          adminRevision: previous.adminRevision, dailyRewardClaimed: true });
      const next: Record<string, unknown> = { ...outcome.save, _saveSessionId: sessionId };
      const nextPayload = JSON.stringify(next);
      if (nextPayload.length > 240_000) return jsonNoStore({ error: "save is too large" }, 413);
      const updatedAt = nextUpdatedAt(current.updatedAt);
      const result = await db.update(gameSaves)
        .set({ accountId: account.id, payload: nextPayload, updatedAt })
        .where(and(eq(gameSaves.playerId, playerId), eq(gameSaves.updatedAt, current.updatedAt), writerCondition()));
      if (affectedRows(result) === 1)
        return jsonNoStore({ ok: true, accepted: true, updatedAt,
          gold: next.gold, enhanceStones: next.enhanceStones,
          reforgeStones: next.reforgeStones, yuanbao: next.yuanbao,
          adminRevision: next.adminRevision, dailyRewardClaimed: true });
      if (await writerRevoked()) return replacedResponse();
      const [latest] = await db.select({ accountId: gameSaves.accountId, payload: gameSaves.payload,
        updatedAt: gameSaves.updatedAt }).from(gameSaves).where(eq(gameSaves.playerId, playerId)).limit(1);
      if (!latest || latest.accountId !== account.id) return jsonNoStore({ error: "save_retry_required" }, 503);
      current = latest;
    }
    return authoritativeResponse(current);
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
      const applied = applySkillSaveActionOnce(previous, body.skillAction, actionId);
      if (!applied) return jsonNoStore({ error: "skill_action_rejected" }, 409);
      if (!applied.accepted)
        return jsonNoStore({ ok: true, accepted: false, updatedAt: current.updatedAt,
          skillReworkBuild: previous.skillReworkBuild, skillAscensions: previous.skillAscensions,
          yuanbao: previous.yuanbao, adminRevision: previous.adminRevision });
      const next = applied.save;
      next._saveSessionId = sessionId;
      const nextPayload = JSON.stringify(next);
      if (nextPayload.length > 240_000) return jsonNoStore({ error: "save is too large" }, 413);
      const updatedAt = nextUpdatedAt(current.updatedAt);
      const result = await db.update(gameSaves)
        .set({ accountId: account.id, payload: nextPayload, updatedAt })
        .where(and(eq(gameSaves.playerId, playerId), eq(gameSaves.updatedAt, current.updatedAt), writerCondition()));
      if (affectedRows(result) === 1) {
        return jsonNoStore({ ok: true, accepted: true, updatedAt,
          skillReworkBuild: next.skillReworkBuild, skillAscensions: next.skillAscensions,
          yuanbao: next.yuanbao, adminRevision: next.adminRevision });
      }
      if (await writerRevoked()) return replacedResponse();
      const [latest] = await db.select({ accountId: gameSaves.accountId, payload: gameSaves.payload, updatedAt: gameSaves.updatedAt })
        .from(gameSaves).where(eq(gameSaves.playerId, playerId)).limit(1);
      if (!latest || latest.accountId !== account.id) return jsonNoStore({ error: "save_retry_required" }, 503);
      current = latest;
    }
    return authoritativeResponse(current);
  }
  if (!existing[0]) return jsonNoStore({ error: "character_creation_required" }, 409);
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
  const initialSave = preserveServerSkillSave(preserveServerShopPurchases(preserveServerOnlineYuanbao(preserveServerDailyHuntClaim(preserveServerResourceRevision(normalizedIncoming, null)!, null), null), null), null);
  if (!initialSave) return jsonNoStore({ error: "invalid_skill_save_class_or_level" }, 400);
  delete initialSave._lastSkillActionId;
  initialSave._paidSkillResetActionIds = [];
  initialSave._skillActionIds = [];
  delete initialSave._lastSkillRebirthLegacyCount;
  delete initialSave._lastIdleClaimId;
  delete initialSave._lastIdleClaimSeconds;
  let finalPayload = JSON.stringify({ ...initialSave, _saveSessionId: sessionId });
  let updatedAt = new Date().toISOString();
  if (existing[0]) {
    let current = existing[0];
    let saved = false;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let prepared: string | null;
      try {
        prepared = prepareAuthoritativePayload(normalizedIncoming, current.payload, sessionId, clientId, clientSequence, Date.parse(current.updatedAt));
      } catch (error) {
        if (!(error instanceof SaveIntegrityError)) throw error;
        console.warn("save_integrity_rejected", { accountId: account.id, playerId, reason: error.reason });
        try {
          const [recent] = await db.select({ createdAt: gmActionLogs.createdAt }).from(gmActionLogs)
            .where(and(eq(gmActionLogs.targetAccountId, account.id), eq(gmActionLogs.action, "save_integrity_rejected")))
            .orderBy(desc(gmActionLogs.createdAt)).limit(1);
          if (!recent || Date.now() - Date.parse(recent.createdAt) >= 60_000)
            await db.insert(gmActionLogs).values({ gmAccountId: "system", targetAccountId: account.id,
              action: "save_integrity_rejected", detail: integrityAuditDetail(playerId, error.reason, JSON.parse(current.payload), normalizedIncoming), createdAt: new Date().toISOString() });
        } catch { /* audit failures never allow the rejected write */ }
        return jsonNoStore({ error: "save_integrity_rejected", reason:error.reason, updatedAt: current.updatedAt }, 409);
      }
      if (!prepared) {
        // Duplicated sequences only acknowledge the existing write. Actual
        // canonical changes still return the server save for reconciliation.
        return snapshotResponse(current,normalizedIncoming,sessionId);
      }
      finalPayload = prepared;
      if (finalPayload.length > 240_000) return jsonNoStore({ error: "save is too large" }, 413);
      updatedAt = nextUpdatedAt(current.updatedAt);
      const claims=worldBossClaimStatements(account.id,playerId,updatedAt,JSON.parse(current.payload),JSON.parse(finalPayload),Date.now());
      const claimGuard=claims.length?sql`NOT EXISTS (SELECT 1 FROM world_boss_reward_claims WHERE mail_id IN (${sql.join(claims.map(c=>sql`${c.bindings[0]}`),sql`, `)}))`:sql`1`;
      const write = db.update(gameSaves)
        .set({ accountId: account.id, payload: finalPayload, updatedAt })
        .where(and(eq(gameSaves.playerId, playerId), eq(gameSaves.updatedAt, current.updatedAt), writerCondition(),claimGuard)).toSQL();
      const event=damageEventStatement(account.id,playerId,updatedAt,JSON.parse(current.payload),JSON.parse(finalPayload),Date.now());
      const statements=[db.$client.prepare(write.sql).bind(...write.params)];
      if(event)statements.push(db.$client.prepare(event.sql).bind(...event.bindings));
      for(const claim of claims)statements.push(db.$client.prepare(claim.sql).bind(...claim.bindings));
      const [result]=await db.$client.batch(statements);
      if (affectedRows(result) === 1) {
        saved = true;
        break;
      }
      if (await writerRevoked()) return replacedResponse();
      const [latest] = await db
        .select({ accountId: gameSaves.accountId, payload: gameSaves.payload, updatedAt: gameSaves.updatedAt })
        .from(gameSaves)
        .where(eq(gameSaves.playerId, playerId))
        .limit(1);
      if (!latest || latest.accountId !== account.id)
        return jsonNoStore({ error: "save_retry_required" }, 503);
      current = latest;
    }
    if (!saved) return snapshotResponse(current,normalizedIncoming,sessionId);
    try {
      await createServerCheckpointIfDue(db, {
        playerId,
        accountId: account.id,
        payload: finalPayload,
      });
    } catch { /* snapshot maintenance never turns a committed save into a failure */ }
  } else {
    if (finalPayload.length > 240_000) return jsonNoStore({ error: "save is too large" }, 413);
    // The first save also checks the live session inside the write statement.
    const inserted = await db.run(sql`
      INSERT OR IGNORE INTO game_saves (account_id, player_id, payload, updated_at)
      SELECT ${account.id}, ${playerId}, ${finalPayload}, ${updatedAt}
      WHERE ${writerCondition()}
    `);
    if ((inserted.meta?.changes ?? 0) !== 1) {
      if (await writerRevoked()) return replacedResponse();
      const [latest] = await db.select({ accountId: gameSaves.accountId, payload: gameSaves.payload,
        updatedAt: gameSaves.updatedAt }).from(gameSaves).where(eq(gameSaves.playerId, playerId)).limit(1);
      if (latest?.accountId === account.id) return snapshotResponse(latest,normalizedIncoming,sessionId);
      return jsonNoStore({ error: "save_retry_required" }, 503);
    }
    try {
      await db.insert(saveSnapshots).values({
        playerId, accountId: account.id, payload: finalPayload,
        kind: "automatic", capturedAt: updatedAt,
      });
    } catch { /* a committed save still succeeds if snapshot maintenance fails */ }
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
    if (automaticSnapshots.length) {
      const [first, ...remaining] = automaticSnapshots;
      await db.batch([
        db.delete(saveSnapshots).where(eq(saveSnapshots.id, first.id)),
        ...remaining.map((snapshot) => db.delete(saveSnapshots).where(eq(saveSnapshots.id, snapshot.id))),
      ]);
    }
  } catch { /* recovery data is retained; cleanup can be retried later */ }
  const savedClock = JSON.parse(finalPayload) as Record<string, unknown>;
  return jsonNoStore({ ok: true, accepted: true, updatedAt,
    idleClock: { storedSeconds: savedClock.storedSeconds, lastSeenAt: savedClock.lastSeenAt } });
}
