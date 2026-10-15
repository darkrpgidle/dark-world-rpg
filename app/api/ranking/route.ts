import { assessedRankingPower } from "../../ranking-power";
import {settleWorldBoss,worldBossRanking} from "../../world-boss-rewards";
import { saveDisplay } from "../../save-field-schema";
import { getDb } from "../../../db";
import { accounts, gameSaves } from "../../../db/schema";
import { eq } from "drizzle-orm";


export async function GET() {
  const db = await getDb();
  await settleWorldBoss(db.$client);
  const cycleRanks=await worldBossRanking(db.$client);
  const worldScores=new Map(cycleRanks.map(r=>[r.account_id,r.damage]));
  const worldPositions=new Map(cycleRanks.map((r,i)=>[r.account_id,i]));
  const gmIds = new Set(
    (await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.isGm, true))).map(
      (account) => account.id,
    ),
  );
  const rows = (await db.select().from(gameSaves)).filter(
    (row) => !row.accountId || !gmIds.has(row.accountId),
  );
  const rankEntries = rows.map((row) => {
    const save = saveDisplay((()=>{try{return JSON.parse(row.payload);}catch{return {};}})()) as {
      playerName?: string; playerClass?: string; level?: number; combatPower?: number; rebirthCount?: number;
      mapId?: number; wave?: number; highestFloor?: number; unlockedMapId?: number;
      dailyDate?: string; worldDamage?: number; worldBossResetVersion?: string;
      selectedAppearance?: string;
      mapBestFloors?: Record<string, number>;
      items?: Array<Record<string, unknown>>;
      loadouts?: Record<string, number[]>;
      activeLoadout?: number;
    };
    const items = Array.isArray(save.items) ? save.items : [];
    const itemById = new Map(items.map((item) => [Number(item.id), item]));
    const getLoadoutItems = (ids: number[]) => ids
      .map((id) => itemById.get(Number(id)))
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .map((item) => ({
        id: Number(item.id),
        name: String(item.name ?? "未命名裝備"),
        slot: String(item.slot ?? "裝備"),
        quality: String(item.quality ?? "普通"),
        enhance: Number(item.enhance ?? 0),
        set: String(item.set ?? ""),
        power: Number(item.power ?? 0),
        mapId: Number(item.mapId ?? 0),
        affixes: Array.isArray(item.affixes) ? item.affixes.map(String).slice(0, 8) : [],
        prefixId: typeof item.prefixId === "string" ? item.prefixId : undefined,
        suffixId: typeof item.suffixId === "string" ? item.suffixId : undefined,
        mythicId: typeof item.mythicId === "string" ? item.mythicId : undefined,
        legendaryId: typeof item.legendaryId === "string" ? item.legendaryId : undefined,
        artKey: typeof item.artKey === "string" ? item.artKey : undefined,
      }));
    const loadoutOne = Array.isArray(save.loadouts?.["1"]) ? save.loadouts["1"] : [];
    const loadoutTwo = Array.isArray(save.loadouts?.["2"]) ? save.loadouts["2"] : [];
    const bestFloors = Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => {
        const mapId = index + 1;
        return [String(mapId), Math.max(0, Math.min(30, Number(save.mapBestFloors?.[String(mapId)] ?? 0)))];
      }),
    );
    return {
      name: save.playerName ?? "無名旅人",
      cls: save.playerClass ?? "戰士",
      level: save.level ?? 1,
      power: assessedRankingPower(save),
      rebirth: save.rebirthCount ?? 0,
      worldDamage:worldScores.get(row.accountId??'')??0,
      worldPosition:worldPositions.get(row.accountId??'')??100,
      currentMapId: Math.max(1, Math.min(9, Number(save.mapId ?? 1))),
      currentFloor: Math.max(1, Math.min(30, Number(save.wave ?? 1))),
      highestFloor: Math.max(1, Math.min(30, Number(save.highestFloor ?? save.wave ?? 1))),
      unlockedMapId: Math.max(1, Math.min(9, Number(save.unlockedMapId ?? 1))),
      mapBestFloors: bestFloors,
      equippedItems: getLoadoutItems(save.activeLoadout === 2 ? loadoutTwo : loadoutOne),
      portrait: `/characters/${save.playerClass === "戰士" ? "warrior" : save.playerClass === "遊俠" ? "ranger" : "mage"}${(save.rebirthCount ?? 0) > 0 ? "-rebirth-avatar" : "-head"}.webp`,
      appearance: ["ember-aura", "arcane-aura", "abyss-aura"].includes(save.selectedAppearance ?? "")
        ? save.selectedAppearance
        : "none",
    };
  });
  const ranks = [...rankEntries]
    .sort((a, b) => b.rebirth - a.rebirth || b.level - a.level || b.power - a.power)
    .slice(0, 100);
  const worldRanks = [...rankEntries]
    .filter((entry) => entry.worldDamage > 0)
    .sort((a, b) => a.worldPosition-b.worldPosition)
    .slice(0, 100)
    .map(({ name, cls, level, power, rebirth, portrait, worldDamage }) => ({
      name,
      cls,
      level,
      power,
      rebirth,
      portrait,
      damage: worldDamage,
    }));
  return Response.json({ ranks, worldRanks }, { headers: { "Cache-Control": "no-store" } });
}
