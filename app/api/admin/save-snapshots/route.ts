import { saveDisplay } from "../../../save-field-schema";
import { adminJson } from "../../../admin-response";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { accountRebirthEntitlements, accounts, gameSaves, saveSnapshots } from "../../../../db/schema";
import { currentAccount } from "../../auth-utils";
import { preserveLegacyRebirthCount } from "../../../legacy-rebirth-storage";
import { legacyRebirthReward } from "../../../legacy-rebirth-rewards";
import { clampRebirthCount } from "../../../rebirth-config";
import { commitAdminSave } from "../../../admin-save-mutation";
import { resetAdminIntegrity } from "../../../admin-state";
import { preserveServerSkillSave } from "../../../skill-save-policy";

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
  for (const key of ["gold", "yuanbao", "enhanceStones", "reforgeStones", "bossTickets", "worldAttempts"]) {
    normalized[key] = asNonNegativeInteger(normalized[key]);
  }
  delete normalized.skills;
  delete normalized.skillPoints;
  normalized.level = Math.min(100, Math.max(1, asNonNegativeInteger(normalized.level, 1)));
  normalized.rebirthCount = clampRebirthCount(normalized.rebirthCount);
  normalized.wave = Math.min(30, Math.max(1, asNonNegativeInteger(normalized.wave, 1)));
  normalized.highestFloor = Math.min(30, Math.max(1, asNonNegativeInteger(normalized.highestFloor, normalized.wave as number)));
  normalized.enemyHp = 100;
  normalized.playerHp = 100;
  normalized.battleOn = false;
  return normalized;
}

function preview(payload: string) {
  try {
    const save = saveDisplay(JSON.parse(payload)) as SavePreview;
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
  if (!gm) return { error: adminJson({ error: "not_authenticated" }, { status: 401 }) } as const;
  if (!gm.isGm) return { error: adminJson({ error: "forbidden" }, { status: 403 }) } as const;
  return { gm } as const;
}

export async function GET(request: Request) {
  const auth = await requireGm(request);
  if ("error" in auth) return auth.error;
  const accountId = new URL(request.url).searchParams.get("accountId")?.trim() ?? "";
  if (!accountId) return adminJson({ error: "account_required" }, { status: 400 });
  const db = await getDb();
  const [target] = await db.select({ id: accounts.id, username: accounts.username, isGm: accounts.isGm })
    .from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (!target || target.isGm) return adminJson({ error: "protected_account" }, { status: 403 });
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
  return adminJson({
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
  if (!accountId || !Number.isInteger(snapshotId)) return adminJson({ error: "invalid_restore_request" }, { status: 400 });
  const db = await getDb();
  const [target] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (!target || target.isGm || target.id === auth.gm.id) return adminJson({ error: "protected_account" }, { status: 403 });
  const [snapshot] = await db.select().from(saveSnapshots).where(eq(saveSnapshots.id, snapshotId)).limit(1);
  if (!snapshot || snapshot.accountId !== target.id) return adminJson({ error: "snapshot_not_found" }, { status: 404 });
  const [currentSave] = await db.select().from(gameSaves).where(eq(gameSaves.accountId, target.id)).limit(1);
  let restored: Record<string, unknown>;
  let currentRevision = 0;
  let currentPayload: Record<string,unknown>|null=null;
  try { restored = normalizeSnapshotPayload(snapshot.payload, target.id); } catch { return adminJson({ error: "invalid_snapshot" }, { status: 409 }); }
  const [entitlement] = await db.select({ legacyRebirthCount: accountRebirthEntitlements.legacyRebirthCount })
    .from(accountRebirthEntitlements).where(eq(accountRebirthEntitlements.accountId, target.id)).limit(1);
  try {
    const current = currentSave ? JSON.parse(currentSave.payload) as Record<string, unknown>
      : entitlement ? { legacyRebirthCount: entitlement.legacyRebirthCount } : null;
    currentPayload=current;
    currentRevision = Number(current?.adminRevision ?? 0);
    restored = preserveLegacyRebirthCount(restored, current);
    if (entitlement) {
      restored.legacyRebirthCount = entitlement.legacyRebirthCount;
      const reward = legacyRebirthReward(entitlement.legacyRebirthCount);
      const owned = Array.isArray(restored.ownedTitles) ? restored.ownedTitles.filter((id): id is string => typeof id === "string") : [];
      restored.ownedTitles = [...new Set(["none", ...owned, ...reward.unlockedTitleIds])];
      if (!restored.selectedTitle || restored.selectedTitle === "none") restored.selectedTitle = reward.titleId ?? "none";
    }
  } catch { return adminJson({ error: "invalid_current_save" }, { status: 409 }); }
  const migrated=preserveServerSkillSave(restored,restored);
  if(!migrated) return adminJson({error:"invalid_snapshot"},{status:409});
  restored=resetAdminIntegrity(migrated,currentPayload);
  restored.adminRevision = Math.max(Number(restored.adminRevision ?? 0), currentRevision) + 1;
  try {
    const mutation=await commitAdminSave(db,{accountId:target.id,playerId:currentSave?.playerId ?? snapshot.playerId,
      gmAccountId:auth.gm.id,current:currentSave ?? null,save:restored,kind:"pre_restore",action:"restore_snapshot",
      detail:`還原 ${snapshot.capturedAt} 的存檔，並已建立還原前備份`});
    if(!mutation.accepted) return adminJson({error:"save_conflict"},{status:409});
  } catch { return adminJson({error:"restore_storage_failed"},{status:500}); }
  try {
    const snapshotsToTrim = await db.select({ id: saveSnapshots.id }).from(saveSnapshots)
      .where(and(eq(saveSnapshots.accountId, target.id), eq(saveSnapshots.kind, "automatic")))
      .orderBy(desc(saveSnapshots.capturedAt)).offset(24);
    for (const old of snapshotsToTrim) await db.delete(saveSnapshots).where(eq(saveSnapshots.id, old.id));
  } catch { /* cleanup cannot invalidate an already completed restore */ }
  return adminJson({ ok: true, username: target.username, restoredAt: snapshot.capturedAt });
}
