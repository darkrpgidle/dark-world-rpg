import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { accounts, gameSaves, gmActionLogs, saveSnapshots, sessions } from "../../../../db/schema";
import { currentAccount } from "../../auth-utils";
import { preserveLegacyRebirthCount } from "../../../legacy-rebirth-storage";

type SavePreview = {
  playerName?: string;
  playerClass?: string;
  level?: number;
  combatPower?: number;
  mapId?: number;
  wave?: number;
  gold?: number;
  yuanbao?: number;
  rebirthCount?: number;
  items?: unknown[];
  inventory?: unknown[];
  equipment?: unknown[];
};

const CURRENT_SAVE_SCHEMA_VERSION = 6;

function asNonNegativeInteger(value: unknown, fallback = 0) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

function normalizeSnapshotPayload(payload: string, accountId: string) {
  const parsed = JSON.parse(payload) as Record<string, unknown>;
  const legacyItems = Array.isArray(parsed.items)
    ? parsed.items
    : Array.isArray(parsed.inventory)
      ? parsed.inventory
      : Array.isArray(parsed.equipment)
        ? parsed.equipment
        : [];
  const normalized = { ...parsed };
  normalized.accountId = accountId;
  normalized.saveSchemaVersion = CURRENT_SAVE_SCHEMA_VERSION;
  normalized.items = legacyItems.filter((item) => item && typeof item === "object");
  for (const key of ["gold", "yuanbao", "enhanceStones", "reforgeStones", "bossTickets", "worldAttempts", "skillPoints"]) {
    normalized[key] = asNonNegativeInteger(normalized[key]);
  }
  normalized.level = Math.min(100, Math.max(1, asNonNegativeInteger(normalized.level, 1)));
  normalized.rebirthCount = Math.min(20, asNonNegativeInteger(normalized.rebirthCount));
  normalized.wave = Math.min(30, Math.max(1, asNonNegativeInteger(normalized.wave, 1)));
  normalized.highestFloor = Math.min(30, Math.max(1, asNonNegativeInteger(normalized.highestFloor, normalized.wave as number)));
  normalized.enemyHp = 100;
  normalized.playerHp = 100;
  normalized.battleOn = false;
  return normalized;
}

function preview(payload: string) {
  try {
    const save = JSON.parse(payload) as SavePreview;
    const warehouseItems = Array.isArray(save.items)
      ? save.items
      : Array.isArray(save.inventory)
        ? save.inventory
        : Array.isArray(save.equipment)
          ? save.equipment
          : [];
    return {
      playerName: save.playerName ?? "尚未建立角色",
      playerClass: save.playerClass ?? "未選職業",
      level: save.level ?? 0,
      combatPower: save.combatPower ?? 0,
      mapId: save.mapId ?? 1,
      wave: save.wave ?? 1,
      gold: save.gold ?? 0,
      yuanbao: save.yuanbao ?? 0,
      rebirthCount: save.rebirthCount ?? 0,
      equipmentCount: warehouseItems.length,
    };
  } catch {
    return null;
  }
}

async function requireGm(request: Request) {
  const gm = await currentAccount(request);
  if (!gm) return { error: Response.json({ error: "not_authenticated" }, { status: 401 }) } as const;
  if (!gm.isGm) return { error: Response.json({ error: "forbidden" }, { status: 403 }) } as const;
  return { gm } as const;
}

export async function GET(request: Request) {
  const auth = await requireGm(request);
  if ("error" in auth) return auth.error;
  const accountId = new URL(request.url).searchParams.get("accountId")?.trim() ?? "";
  if (!accountId) return Response.json({ error: "account_required" }, { status: 400 });
  const db = await getDb();
  const [target] = await db.select({ id: accounts.id, username: accounts.username, isGm: accounts.isGm })
    .from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (!target || target.isGm) return Response.json({ error: "protected_account" }, { status: 403 });
  const snapshots = await db.select({
    id: saveSnapshots.id,
    kind: saveSnapshots.kind,
    capturedAt: saveSnapshots.capturedAt,
    payload: saveSnapshots.payload,
  }).from(saveSnapshots).where(eq(saveSnapshots.accountId, accountId)).orderBy(desc(saveSnapshots.capturedAt));
  const globalSnapshots = await db.select({
    id: saveSnapshots.id,
    kind: saveSnapshots.kind,
    capturedAt: saveSnapshots.capturedAt,
    payload: saveSnapshots.payload,
  }).from(saveSnapshots).where(and(eq(saveSnapshots.accountId, auth.gm.id), eq(saveSnapshots.kind, "global_pre_wipe"))).orderBy(desc(saveSnapshots.capturedAt));
  return Response.json({
    player: target,
    snapshots: snapshots.map((snapshot) => ({
      id: snapshot.id,
      kind: snapshot.kind,
      capturedAt: snapshot.capturedAt,
      preview: preview(snapshot.payload),
    })),
    globalSnapshots: globalSnapshots.map((snapshot) => {
      let globalSaveCount = 0;
      try {
        const payload = JSON.parse(snapshot.payload) as { saves?: unknown[] };
        globalSaveCount = Array.isArray(payload.saves) ? payload.saves.length : 0;
      } catch { /* keep zero when an old backup cannot be parsed */ }
      return { id: snapshot.id, kind: snapshot.kind, capturedAt: snapshot.capturedAt, globalSaveCount };
    }),
  });
}

export async function POST(request: Request) {
  const auth = await requireGm(request);
  if ("error" in auth) return auth.error;
  const body = (await request.json()) as { accountId?: string; snapshotId?: number };
  const accountId = body.accountId?.trim() ?? "";
  const snapshotId = Number(body.snapshotId);
  if (!accountId || !Number.isInteger(snapshotId)) return Response.json({ error: "invalid_restore_request" }, { status: 400 });
  const db = await getDb();
  const [target] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (!target || target.isGm || target.id === auth.gm.id) return Response.json({ error: "protected_account" }, { status: 403 });
  const [snapshot] = await db.select().from(saveSnapshots).where(eq(saveSnapshots.id, snapshotId)).limit(1);
  if (!snapshot || snapshot.accountId !== target.id) return Response.json({ error: "snapshot_not_found" }, { status: 404 });
  const [currentSave] = await db.select().from(gameSaves).where(eq(gameSaves.accountId, target.id)).limit(1);
  if (!currentSave) return Response.json({ error: "save_not_found" }, { status: 404 });
  let restored: Record<string, unknown>;
  let currentRevision = 0;
  try { restored = normalizeSnapshotPayload(snapshot.payload, target.id); } catch { return Response.json({ error: "invalid_snapshot" }, { status: 409 }); }
  try {
    const current = JSON.parse(currentSave.payload) as Record<string, unknown>;
    currentRevision = Number(current.adminRevision ?? 0);
    restored = preserveLegacyRebirthCount(restored, current);
  } catch { return Response.json({ error: "invalid_current_save" }, { status: 409 }); }
  const now = new Date().toISOString();
  restored.adminRevision = Math.max(Number(restored.adminRevision ?? 0), currentRevision) + 1;
  const restoredPayload = JSON.stringify(restored);
  try {
    // Keep these writes separate. A D1 batch failure otherwise makes the
    // restore look like a generic failure and can hide which statement broke.
    await db.insert(saveSnapshots).values({ playerId: currentSave.playerId, accountId: target.id, payload: currentSave.payload, kind: "pre_restore", capturedAt: now });
    await db.update(gameSaves).set({ payload: restoredPayload, updatedAt: now }).where(eq(gameSaves.playerId, currentSave.playerId));
  } catch {
    return Response.json({ error: "restore_storage_failed" }, { status: 500 });
  }
  try { await db.delete(sessions).where(eq(sessions.accountId, target.id)); } catch { /* restore remains valid if session cleanup is temporarily unavailable */ }
  try {
    const snapshotsToTrim = await db.select({ id: saveSnapshots.id }).from(saveSnapshots)
      .where(and(eq(saveSnapshots.accountId, target.id), eq(saveSnapshots.kind, "automatic")))
      .orderBy(desc(saveSnapshots.capturedAt)).offset(24);
    for (const old of snapshotsToTrim) await db.delete(saveSnapshots).where(eq(saveSnapshots.id, old.id));
  } catch { /* cleanup cannot invalidate an already completed restore */ }
  try {
    await db.insert(gmActionLogs).values({
      gmAccountId: auth.gm.id,
      targetAccountId: target.id,
      action: "restore_snapshot",
      detail: `還原 ${snapshot.capturedAt} 的存檔，並已建立還原前備份`,
    });
  } catch { /* audit logging must not undo a completed restore */ }
  return Response.json({ ok: true, username: target.username, restoredAt: snapshot.capturedAt });
}
