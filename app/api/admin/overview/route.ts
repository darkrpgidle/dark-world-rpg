import { count, desc, eq, gt } from "drizzle-orm";
import { getDb } from "../../../../db";
import { deathEvents, accounts, gameSaves, sessions } from "../../../../db/schema";
import { currentAccount } from "../../auth-utils";
import { maps } from "../../../game-data";

export async function GET(request: Request) {
  const account = await currentAccount(request);
  if (!account) return Response.json({ error: "not_authenticated" }, { status: 401 });
  if (!account.isGm) return Response.json({ error: "forbidden" }, { status: 403 });
  const db = await getDb();
  const activeSince = new Date(Date.now() - 90_000).toISOString();
  const [accountRows, saveRows, onlineSessionRows, [accountCount], [saveCount], [sessionCount], [latestSave], [deathCount], deathHotspots] = await Promise.all([
    db.select({ id: accounts.id, username: accounts.username }).from(accounts),
    db.select({ accountId: gameSaves.accountId, playerId: gameSaves.playerId, payload: gameSaves.payload }).from(gameSaves),
    db.select({ accountId: sessions.accountId, lastSeenAt: sessions.lastSeenAt }).from(sessions).where(gt(sessions.lastSeenAt, activeSince)),
    db.select({ value: count() }).from(accounts),
    db.select({ value: count() }).from(gameSaves),
    db.select({ value: count() }).from(sessions).where(gt(sessions.lastSeenAt, activeSince)),
    db.select({ updatedAt: gameSaves.updatedAt }).from(gameSaves).orderBy(desc(gameSaves.updatedAt)).limit(1),
    db.select({ value: count() }).from(deathEvents),
    db.select({ mapId: deathEvents.mapId, floor: deathEvents.floor, deaths: count() })
      .from(deathEvents)
      .groupBy(deathEvents.mapId, deathEvents.floor)
      .orderBy(desc(count()))
      .limit(10),
  ]);
  const saveByAccount = new Map(saveRows.map((row) => {
    let payload: { playerName?: string; level?: number } = {};
    try { payload = JSON.parse(row.payload) as typeof payload; } catch { /* ignore malformed legacy saves */ }
    return [row.accountId ?? "", { playerId: row.playerId, playerName: payload.playerName ?? "", level: payload.level ?? 1 }] as const;
  }));
  const onlinePlayers = [...new Map(onlineSessionRows.map((session) => [session.accountId, session])).values()]
    .map((session) => {
      const accountRow = accountRows.find((accountRow) => accountRow.id === session.accountId);
      const save = saveByAccount.get(session.accountId);
      return {
        accountId: session.accountId,
        username: accountRow?.username ?? "未知帳號",
        playerId: save?.playerId ?? null,
        playerName: save?.playerName || "尚未建立角色",
        level: save?.level ?? 1,
      };
    })
    .sort((a, b) => a.username.localeCompare(b.username));
  return Response.json({
    serverTime: new Date().toISOString(),
    database: {
      accounts: accountCount?.value ?? 0,
      saves: saveCount?.value ?? 0,
      onlineViewers: sessionCount?.value ?? 0,
      onlinePlayers,
      latestSaveAt: latestSave?.updatedAt ?? null,
    },
    deathAnalytics: {
      totalDeaths: deathCount?.value ?? 0,
      playersEntered: saveCount?.value ?? 0,
      averageDeathsPerEnteredPlayer: saveCount?.value
        ? Number(((deathCount?.value ?? 0) / saveCount.value).toFixed(2))
        : 0,
      hotspots: deathHotspots.map((hotspot) => ({
        mapId: hotspot.mapId,
        mapName: maps.find((map) => map.id === hotspot.mapId)?.name ?? `地圖 ${hotspot.mapId}`,
        floor: hotspot.floor,
        deaths: hotspot.deaths,
      })),
    },
  });
}
