import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { accounts, gameSaves, gmActionLogs, saveSnapshots, sessions } from "../../../../db/schema";
import { currentAccount } from "../../auth-utils";

const slots = ["武器", "頭盔", "胸甲", "手套", "鞋子", "項鍊", "戒指", "腰帶", "護腕", "披風"] as const;
const allowedClasses = new Set(["戰士", "遊俠", "法師"]);
const affixNames = ["生命", "生命%", "攻擊", "攻擊%", "防禦", "防禦%", "攻速", "命中", "閃避", "暴擊", "暴擊傷害", "吸血", "傷害減免", "技能傷害", "首領傷害", "首領減傷", "經驗", "金幣", "資源掉落率", "元寶掉率"];
const rebirthTalentDefs = [
  ["combatCritRate", 5], ["combatCritDamage", 5], ["combatDamageReduction", 5],
  ["combatAttackSpeed", 5], ["combatBoss", 5], ["survivalHp", 5],
  ["survivalDefense", 5], ["growthSkill", 5],
] as const;

function playerId() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function mythicEquipment() {
  const mapId = 6;
  const prefix = "獄火";
  const set = "惡魔征服";
  const affixes: Record<string, string[]> = {
    武器: ["攻擊 +420", "攻擊% +15%", "暴擊傷害 +20%", "技能傷害 +15%", "首領傷害 +15%"],
    頭盔: ["命中 +15%", "防禦 +220", "生命 +1200", "閃避 +10%", "傷害減免 +8%"],
    胸甲: ["生命 +2600", "防禦 +420", "生命% +15%", "防禦% +15%", "傷害減免 +10%"],
    手套: ["攻擊 +260", "攻速 +15%", "暴擊 +12%", "命中 +12%", "攻擊% +12%"],
    鞋子: ["防禦 +240", "閃避 +12%", "生命 +1400", "移動速度 +10%", "傷害減免 +8%"],
    項鍊: ["生命 +2200", "經驗 +20%", "金幣 +20%", "元寶掉率 +15%", "資源掉落率 +15%"],
    戒指: ["攻擊 +300", "暴擊 +15%", "暴擊傷害 +20%", "吸血 +8%", "首領傷害 +12%"],
    腰帶: ["生命 +2400", "防禦% +15%", "生命% +15%", "首領減傷 +10%", "傷害減免 +8%"],
    護腕: ["攻擊 +280", "命中 +15%", "攻速 +12%", "技能傷害 +15%", "暴擊 +10%"],
    披風: ["生命 +1800", "防禦 +300", "閃避 +12%", "傷害減免 +10%", "首領減傷 +10%"],
  };
  return slots.map((slot, index) => ({
    id: Date.now() + index,
    name: `${set}${slot}`,
    slot,
    quality: "神話",
    power: 2200,
    enhance: 10,
    mapId,
    equipmentType: "神話裝備",
    affixSchemaVersion: 7,
    set,
    affixes: affixes[slot],
    locked: true,
  }));
}

function baseSave(accountId: string) {
  return {
    saveSchemaVersion: 6, accountName: "", playerName: "未命名旅人", playerClass: "戰士",
    combatPower: 0, xpSchemaVersion: 2, level: 1, exp: 0, gold: 0, yuanbao: 0,
    enhanceStones: 0, reforgeStones: 0, wave: 1, mapId: 1, unlockedMapId: 1,
    mapBestFloors: { "1": 1 }, enemyHp: 100, playerHp: 100, items: [], loadouts: { "1": [], "2": [] },
    activeLoadout: 1, skills: [], bossTickets: 10, bossTicketResetVersion: "2026-09-05", worldAttempts: 3,
    highestFloor: 1, completedRuns: 0, storedSeconds: 0, idleSeconds: 0, skillPoints: 0, mails: [],
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
  const totalPoints = (save.rebirthCount as number) * 2;
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
  if (!gm) return Response.json({ error: "not_authenticated" }, { status: 401 });
  if (!gm.isGm) return Response.json({ error: "forbidden" }, { status: 403 });
  const accountId = new URL(request.url).searchParams.get("accountId")?.trim() ?? "";
  const db = await getDb();
  const [account] = await db.select({ id: accounts.id, username: accounts.username, isGm: accounts.isGm }).from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (!account || account.isGm) return Response.json({ error: "protected_account" }, { status: 403 });
  const [row] = await db.select().from(gameSaves).where(eq(gameSaves.accountId, accountId)).limit(1);
  let save = row ? JSON.parse(row.payload) as Record<string, unknown> : null;
  return Response.json({ account, playerId: row?.playerId ?? null, save, exists: Boolean(row) });
}

export async function POST(request: Request) {
  const gm = await currentAccount(request);
  if (!gm) return Response.json({ error: "not_authenticated" }, { status: 401 });
  if (!gm.isGm) return Response.json({ error: "forbidden" }, { status: 403 });
  const body = await request.json() as { accountId?: string; save?: Record<string, unknown> };
  const accountId = body.accountId?.trim() ?? "";
  if (!accountId || !body.save || typeof body.save !== "object") return Response.json({ error: "invalid_request" }, { status: 400 });
  const db = await getDb();
  const [target] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (!target || target.isGm || target.id === gm.id) return Response.json({ error: "protected_account" }, { status: 403 });
  const [current] = await db.select().from(gameSaves).where(eq(gameSaves.accountId, accountId)).limit(1);
  const oldSave = current ? JSON.parse(current.payload) as Record<string, unknown> : null;
  const incoming = { ...(oldSave ?? baseSave(accountId)), ...body.save, accountId } as Record<string, unknown>;
  const level = number(incoming.level, 1, 1, 100);
  incoming.level = level;
  incoming.rebirthCount = number(incoming.rebirthCount, 0, 0, 20);
  syncRebirthTalents(incoming);
  incoming.exp = level >= 100 ? 0 : number(incoming.exp, 0, 0, 1_000_000_000);
  for (const key of ["gold", "yuanbao", "enhanceStones", "reforgeStones", "bossTickets", "worldAttempts", "skillPoints"]) incoming[key] = number(incoming[key], 0);
  incoming.playerName = String(incoming.playerName ?? oldSave?.playerName ?? target.username).slice(0, 40);
  incoming.playerClass = allowedClasses.has(String(incoming.playerClass)) ? incoming.playerClass : "戰士";
  incoming.mapId = number(incoming.mapId, 1, 1, 9); incoming.unlockedMapId = number(incoming.unlockedMapId, 1, 1, 9);
  incoming.wave = number(incoming.wave, 1, 1, 30); incoming.highestFloor = number(incoming.highestFloor, incoming.wave as number, 1, 30);
  incoming.mapBestFloors = typeof incoming.mapBestFloors === "object" && incoming.mapBestFloors ? incoming.mapBestFloors : { "1": incoming.highestFloor };
  const equipmentPower = Array.isArray(incoming.items)
    ? incoming.items.reduce((sum, item) => sum + number((item as Record<string, unknown>).power, 0) + number((item as Record<string, unknown>).enhance, 0) * 80, 0)
    : 0;
  const skillPower = Array.isArray(incoming.skills)
    ? incoming.skills.reduce((sum, skill) => sum + number((skill as Record<string, unknown>).level, 0) * 120, 0)
    : 0;
  incoming.combatPower = Math.max(0, number(incoming.combatPower, 0) || (incoming.level as number) * 50 + (incoming.rebirthCount as number) * 1000 + equipmentPower + skillPower);
  incoming.adminRevision = Math.max(number(incoming.adminRevision, 0), oldSave ? number(oldSave.adminRevision, 0) : 0) + 1;
  incoming.enemyHp = 100; incoming.playerHp = 100; incoming.battleOn = false;
  const now = new Date().toISOString();
  const id = current?.playerId ?? playerId();
  if (current) {
    await db.insert(saveSnapshots).values({ playerId: id, accountId, payload: current.payload, kind: "pre_admin_edit", capturedAt: now });
    await db.update(gameSaves).set({ payload: JSON.stringify(incoming), updatedAt: now }).where(eq(gameSaves.playerId, id));
  } else {
    await db.insert(gameSaves).values({ playerId: id, accountId, payload: JSON.stringify(incoming), updatedAt: now });
  }
  await db.delete(sessions).where(eq(sessions.accountId, accountId));
  await db.insert(gmActionLogs).values({ gmAccountId: gm.id, targetAccountId: accountId, action: "edit_save", detail: `指定玩家存檔修改：${incoming.rebirthCount}轉 Lv.${incoming.level}` });
  return Response.json({ ok: true, accountId, playerId: id, updatedAt: now, save: incoming });
}
