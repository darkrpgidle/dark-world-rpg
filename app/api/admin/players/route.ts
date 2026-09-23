import { desc } from "drizzle-orm";
import { getDb } from "../../../../db";
import { accounts, gameSaves } from "../../../../db/schema";
import { currentAccount } from "../../auth-utils";

type SavePreview = {
  playerName?: string;
  playerClass?: string;
  level?: number;
  combatPower?: number;
  mapIndex?: number;
  floor?: number;
};

export async function GET(request: Request) {
  const gm = await currentAccount(request);
  if (!gm) return Response.json({ error: "not_authenticated" }, { status: 401 });
  if (!gm.isGm) return Response.json({ error: "forbidden" }, { status: 403 });

  const db = await getDb();
  const [accountRows, saveRows] = await Promise.all([
    db.select({
      id: accounts.id,
      username: accounts.username,
      isGm: accounts.isGm,
      suspendedAt: accounts.suspendedAt,
      suspendedUntil: accounts.suspendedUntil,
      suspensionReason: accounts.suspensionReason,
      createdAt: accounts.createdAt,
    }).from(accounts).orderBy(desc(accounts.createdAt)),
    db.select().from(gameSaves),
  ]);
  const saves = new Map(saveRows.map((row) => [row.accountId, row]));
  const query = new URL(request.url).searchParams.get("q")?.trim().toLocaleLowerCase("zh-TW") ?? "";
  const players = accountRows
    .filter((account) => !account.isGm)
    .map((account) => {
      const save = saves.get(account.id);
      let preview: SavePreview = {};
      try { preview = save ? JSON.parse(save.payload) as SavePreview : {}; } catch { /* malformed legacy save */ }
      return {
        accountId: account.id,
        username: account.username,
        playerId: save?.playerId ?? null,
        playerName: preview.playerName ?? "尚未建立角色",
        playerClass: preview.playerClass ?? null,
        level: preview.level ?? null,
        combatPower: preview.combatPower ?? 0,
        mapIndex: preview.mapIndex ?? null,
        floor: preview.floor ?? null,
        updatedAt: save?.updatedAt ?? null,
        createdAt: account.createdAt,
        suspension: account.suspendedAt && (!account.suspendedUntil || Date.parse(account.suspendedUntil) > Date.now())
          ? { reason: account.suspensionReason || "違反遊戲規範", until: account.suspendedUntil, at: account.suspendedAt }
          : null,
      };
    })
    .filter((player) => !query || `${player.username} ${player.playerName}`.toLocaleLowerCase("zh-TW").includes(query));
  return Response.json({ players });
}
