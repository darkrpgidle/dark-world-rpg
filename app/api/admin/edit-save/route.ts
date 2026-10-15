import { saveDisplay } from "../../../save-field-schema";
import { adminJson } from "../../../admin-response";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { accounts, gameSaves } from "../../../../db/schema";
import { currentAccount } from "../../auth-utils";
import { preserveLegacyRebirthCount } from "../../../legacy-rebirth-storage";
import { REBIRTH_REWARD_PER_TURN, clampRebirthCount } from "../../../rebirth-config";
import { restoreSkillBuild, type SkillClass } from "../../../skill-rework";
import { SKILL_REWORK_SAVE_VERSION, preserveServerSkillSave } from "../../../skill-save-policy";
import { normalizeAdminAscensions } from "../../../admin-skill-ascensions";
import { commitAdminSave } from "../../../admin-save-mutation";
import { resetAdminIntegrity } from "../../../admin-state";
import { normalizedAdminEquipment, type AdminEquipment } from "../../../admin-equipment";
import { guardedExperienceRequired } from "../../../save-integrity";

const allowedClasses = new Set(["戰士", "遊俠", "法師"]);
const rebirthTalentDefs = [
  ["combatCritRate", 5], ["combatCritDamage", 5], ["combatDamageReduction", 5],
  ["combatAttackSpeed", 5], ["combatBoss", 5], ["survivalHp", 5],
  ["survivalDefense", 5], ["growthSkill", 5],
] as const;

function playerId() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function baseSave(accountId: string) {
  return {
    saveSchemaVersion: 6, accountName: "", playerName: "未命名旅人", playerClass: "戰士",
    combatPower: 0, xpSchemaVersion: 2, level: 1, exp: 0, gold: 0, yuanbao: 0,
    enhanceStones: 0, reforgeStones: 0, wave: 1, mapId: 1, unlockedMapId: 1,
    mapBestFloors: { "1": 1 }, enemyHp: 100, playerHp: 100, items: [], loadouts: { "1": [], "2": [] },
    activeLoadout: 1, bossTickets: 10, bossTicketResetVersion: "2026-09-05", worldAttempts: 3,
    highestFloor: 1, completedRuns: 0, storedSeconds: 0, idleSeconds: 0, mails: [],
    dailyKills: 0, dailyDate: "", dailyRewardClaimed: false, worldDamage: 0, autoSalvage: false,
    autoSalvageQuality: "良好", protectSetGear: true, protectPowerUpgrade: true, rebirthCount: 0,
    rebirthPoints: 0, rebirthTalents: {}, finalBossDefeated: false, lastSeenAt: Date.now(), unseenItemIds: [], logs: [],
    accountId,
  };
}

function number(value: unknown, fallback: number, min = 0, max = 1_000_000_000) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function syncRebirthTalents(save: Record<string, unknown>) {
  const totalPoints = (save.rebirthCount as number) * REBIRTH_REWARD_PER_TURN.talentPoints;
  const rawTalents = save.rebirthTalents && typeof save.rebirthTalents === "object"
    ? save.rebirthTalents as Record<string, unknown>
    : {};
  const talents: Record<string, number> = {};
  let remaining = totalPoints;
  for (const [id, max] of rebirthTalentDefs) {
    const requested = number(rawTalents[id], 0, 0, max);
    const granted = Math.min(requested, remaining);
    talents[id] = granted;
    remaining -= granted;
  }
  save.rebirthTalents = talents;
  save.rebirthPoints = remaining;
}

export async function GET(request: Request) {
  const gm = await currentAccount(request);
  if (!gm) return adminJson({ error: "not_authenticated" }, { status: 401 });
  if (!gm.isGm) return adminJson({ error: "forbidden" }, { status: 403 });
  const accountId = new URL(request.url).searchParams.get("accountId")?.trim() ?? "";
  const db = await getDb();
  const [account] = await db.select({ id: accounts.id, username: accounts.username, isGm: accounts.isGm }).from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (!account || (account.isGm && account.id !== gm.id)) return adminJson({ error: "protected_account" }, { status: 403 });
  const [row] = await db.select().from(gameSaves).where(eq(gameSaves.accountId, accountId)).limit(1);
  let save = row ? saveDisplay(JSON.parse(row.payload)) : null;
  if (save) {
    save = preserveServerSkillSave(save,save);
    if(!save)return adminJson({error:"invalid_player_save"},{status:409});
    delete save.skills;
    delete save.skillPoints;
  }
  return adminJson({ account, playerId: row?.playerId ?? null, save, exists: Boolean(row), updatedAt: row?.updatedAt ?? null });
}

export async function POST(request: Request) {
  const gm = await currentAccount(request);
  if (!gm) return adminJson({ error: "not_authenticated" }, { status: 401 });
  if (!gm.isGm) return adminJson({ error: "forbidden" }, { status: 403 });
  let body: {accountId?:string;save?:Record<string,unknown>;expectedUpdatedAt?:string|null};
  try { body=await request.json(); } catch { return adminJson({error:"invalid_request"},{status:400}); }
  const accountId = body.accountId?.trim() ?? "";
  if (!accountId || !body.save || typeof body.save !== "object" || Array.isArray(body.save)) return adminJson({ error: "invalid_request" }, { status: 400 });
  const db = await getDb();
  const [target] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (!target || (target.isGm && target.id !== gm.id)) return adminJson({ error: "protected_account" }, { status: 403 });
  const [current] = await db.select().from(gameSaves).where(eq(gameSaves.accountId, accountId)).limit(1);
  if (body.expectedUpdatedAt !== (current?.updatedAt ?? null)) return adminJson({error:"save_conflict"},{status:409});
  let oldSave: Record<string,unknown>|null;
  try { oldSave=current ? JSON.parse(current.payload) : null; } catch { return adminJson({error:"invalid_player_save"},{status:409}); }
  const incoming = preserveLegacyRebirthCount({ ...(oldSave ?? baseSave(accountId)), ...body.save, accountId }, oldSave);
  const level = number(incoming.level, 1, 1, 100);
  incoming.level = level;
  incoming.rebirthCount = clampRebirthCount(incoming.rebirthCount);
  syncRebirthTalents(incoming);
  incoming.exp = level >= 100 ? 0 : number(incoming.exp, 0, 0, guardedExperienceRequired(level)-1);
  for (const key of ["gold", "yuanbao", "enhanceStones", "reforgeStones", "bossTickets", "worldAttempts"]) incoming[key] = number(incoming[key], 0);
  incoming.xpSchemaVersion=2;
  incoming.storedSeconds=number(incoming.storedSeconds,0,0,43200);
  incoming.drillingStones=number(incoming.drillingStones,0);
  incoming.playerName = String(incoming.playerName ?? oldSave?.playerName ?? target.username).slice(0, 40);
  incoming.playerClass = allowedClasses.has(String(incoming.playerClass)) ? incoming.playerClass : "戰士";
  const skillClass = incoming.playerClass as SkillClass;
  incoming.skillReworkVersion = SKILL_REWORK_SAVE_VERSION;
  incoming.skillReworkBuild = restoreSkillBuild(incoming.skillReworkBuild, skillClass, level);
  incoming.skillAscensions = normalizeAdminAscensions(incoming.skillAscensions, skillClass, incoming.rebirthCount);
  delete incoming._lastSkillRebirthLegacyCount;
  delete incoming.skills;
  delete incoming.skillPoints;
  incoming.mapId = number(incoming.mapId, 1, 1, 9); incoming.unlockedMapId = number(incoming.unlockedMapId, 1, 1, 9);
  incoming.unlockedMapId=Math.max(Number(incoming.unlockedMapId),Number(incoming.mapId));
  incoming.wave = number(incoming.wave, 1, 1, 30); incoming.highestFloor = number(incoming.highestFloor, incoming.wave as number, 1, 30);
  incoming.mapBestFloors = typeof incoming.mapBestFloors === "object" && incoming.mapBestFloors ? incoming.mapBestFloors : { "1": incoming.highestFloor };
  const floors=incoming.mapBestFloors as Record<string,unknown>;
  incoming.mapBestFloors=Object.fromEntries(Array.from({length:9},(_,index)=>[String(index+1),number(floors[String(index+1)],0,0,30)]));
  const oldItems=Array.isArray(oldSave?.items) ? oldSave.items as AdminEquipment[] : [];
  incoming.items=Array.isArray(incoming.items) ? (incoming.items as AdminEquipment[]).filter(item=>item && typeof item === "object").map(item=>normalizedAdminEquipment(item,oldItems.find(old=>old.id===item.id))) : [];
  const equipmentPower = Array.isArray(incoming.items)
    ? incoming.items.reduce((sum, item) => sum + number((item as Record<string, unknown>).power, 0) + number((item as Record<string, unknown>).enhance, 0) * 80, 0)
    : 0;
  incoming.combatPower = Math.max(0, number(incoming.combatPower, 0) || (incoming.level as number) * 50 + (incoming.rebirthCount as number) * 1000 + equipmentPower);
  incoming.adminRevision = Math.max(number(incoming.adminRevision, 0), oldSave ? number(oldSave.adminRevision, 0) : 0) + 1;
  incoming.enemyHp = 100; incoming.playerHp = 100; incoming.battleOn = false;
  const id = current?.playerId ?? playerId();
  const mutation=await commitAdminSave(db,{accountId,playerId:id,gmAccountId:gm.id,current:current ?? null,
    save:resetAdminIntegrity(incoming,oldSave),kind:"pre_admin_edit",action:"edit_save",
    detail:`指定玩家存檔修改：${incoming.rebirthCount}轉 Lv.${incoming.level}`});
  if(!mutation.accepted) return adminJson({error:"save_conflict"},{status:409});
  return adminJson({ ok: true, accountId, playerId: id, updatedAt: mutation.updatedAt, save: mutation.save });
}
