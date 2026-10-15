import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { accountRebirthEntitlements, gameSaves } from "../../../db/schema";
import { currentLogin } from "../auth-utils";
import { activeSaveSession } from "../../save-session-guard";
import { createSkillBuild } from "../../skill-rework";
import { createSkillAscensions } from "../../skill-ascensions";
import { legacyRebirthReward } from "../../legacy-rebirth-rewards";
import { createStarterEquipment } from "../../starter-equipment";

const validId = (value: string) => /^[a-zA-Z0-9_-]{20,80}$/.test(value);
const validClass = new Set(["戰士", "遊俠", "法師"]);
const normalize = (value: string) => value.trim().toLocaleLowerCase("zh-TW");

export async function GET(request: Request) {
  const login = await currentLogin(request);
  const account = login.account;
  if (!account) return Response.json({ error: login.error }, { status: login.error === "maintenance" ? 503 : login.error === "account_suspended" ? 403 : 401 });
  const db = await getDb();
  const rows = await db
    .select()
    .from(gameSaves)
    .where(eq(gameSaves.accountId, account.id));
  // A repeated character-creation request could historically leave duplicate
  // saves for one account. Always recover the most progressed save instead of
  // relying on the database's unspecified row order.
  const row = rows
    .map((candidate) => {
      try {
        const save = JSON.parse(candidate.payload) as {
          level?: number;
          rebirthCount?: number;
          combatPower?: number;
        };
        return {
          candidate,
          level: Number(save.level) || 0,
          rebirth: Number(save.rebirthCount) || 0,
          power: Number(save.combatPower) || 0,
        };
      } catch {
        return { candidate, level: 0, rebirth: 0, power: 0 };
      }
    })
    .sort(
      (a, b) =>
        b.rebirth - a.rebirth ||
        b.level - a.level ||
        b.power - a.power ||
        String(b.candidate.updatedAt).localeCompare(String(a.candidate.updatedAt)),
    )[0]?.candidate;
  if (!row) return Response.json({ character: null });
  try {
    const save = JSON.parse(row.payload) as { playerName?: string; playerClass?: string };
    return Response.json({
      character: {
        id: row.playerId,
        name: typeof save.playerName==="string"?save.playerName:account.username,
        cls: typeof save.playerClass==="string"&&validClass.has(save.playerClass)?save.playerClass:undefined,
      },
    });
  } catch {
    return Response.json({ character: null });
  }
}

export async function POST(request: Request) {
  const login = await currentLogin(request);
  const account = login.account;
  if (!account) return Response.json({ error: login.error }, { status: login.error === "maintenance" ? 503 : login.error === "account_suspended" ? 403 : 401 });
  const body = (await request.json().catch(()=>null)) as {
    playerId?: string;
    accountName?: string;
    playerName?: string;
    playerClass?: string;
  };
  if(!body || typeof body!=="object"||Array.isArray(body))return Response.json({error:"invalid character data"},{status:400});
  const playerId = typeof body.playerId==="string"?body.playerId.trim():"";
  const accountName = account.username;
  const playerName = typeof body.playerName==="string"?body.playerName.trim():"";
  const playerClass = typeof body.playerClass==="string"?body.playerClass.trim():"";
  if (!validId(playerId) || !accountName || !playerName || playerName.length > 12 || !validClass.has(playerClass))
    return Response.json({ error: "invalid character data" }, { status: 400 });

  const db = await getDb();
  const rows = await db.select().from(gameSaves);
  for (const row of rows) {
    if (row.playerId === playerId && row.accountId === account.id)
      return Response.json({ ok: true, existing: true });
    if (row.playerId === playerId && row.accountId !== account.id)
      return Response.json({ error: "player_belongs_to_other_account" }, { status: 403 });
    let save: { accountName?: string; playerName?: string };
    try {
      save = JSON.parse(row.payload) as { accountName?: string; playerName?: string };
    } catch {
      continue;
    }
    if (row.accountId === account.id)
      return Response.json({ error: "account_already_has_character" }, { status: 409 });
    if (save.playerName && normalize(save.playerName) === normalize(playerName))
      return Response.json({ error: "nickname_already_taken" }, { status: 409 });
  }

  const payload = JSON.stringify({
    saveSchemaVersion: 6,
    xpSchemaVersion: 2,
    accountName,
    playerName,
    playerClass,
    accountId: account.id,
    level: 1,
    exp: 0,
    gold: 0,
    yuanbao: 0,
    enhanceStones: 0,
    reforgeStones: 0,
    drillingStones: 0,
    rebirthCount: 0,
    mapId: 1,
    unlockedMapId: 1,
    wave: 1,
    highestFloor: 1,
    mapBestFloors: { "1": 1 },
    ...createStarterEquipment(),
    bossTickets: 10,
    worldAttempts: 3,
    completedRuns: 0,
    storedSeconds: 0,
    idleSeconds: 0,
    mails: [],
    dailyKills: 0,
    dailyDate: "",
    dailyRewardClaimed: false,
    worldDamage: 0,
    autoSalvage: false,
    autoSalvageQuality: "良好",
    protectSetGear: true,
    protectPowerUpgrade: true,
    rebirthPoints: 0,
    rebirthTalents: {},
    finalBossDefeated: false,
    battleOn: true,
    lastSeenAt: Date.now(),
    unseenItemIds: [],
    logs: [],
    skillReworkVersion: 2,
    skillReworkBuild: createSkillBuild(),
    skillAscensions: createSkillAscensions(),
  });
  const [entitlement] = await db.select({ legacyRebirthCount: accountRebirthEntitlements.legacyRebirthCount })
    .from(accountRebirthEntitlements).where(eq(accountRebirthEntitlements.accountId, account.id)).limit(1);
  const legacyRebirthCount = entitlement?.legacyRebirthCount ?? 0;
  const reward = legacyRebirthReward(legacyRebirthCount);
  const seeded = {
    ...JSON.parse(payload) as Record<string, unknown>,
    legacyRebirthCount,
    ownedTitles: ["none", ...reward.unlockedTitleIds],
    selectedTitle: reward.titleId ?? "none",
  };
  const inserted = await db.run(sql`
    INSERT OR IGNORE INTO game_saves (account_id, player_id, payload, updated_at)
    SELECT ${account.id}, ${playerId}, ${JSON.stringify(seeded)}, ${new Date().toISOString()}
    WHERE ${activeSaveSession(login.sessionId!, account.id)}
  `);
  if ((inserted.meta?.changes ?? 0) !== 1)
    return Response.json({ error: "session_replaced" }, { status: 401 });
  return Response.json({ ok: true });
}
