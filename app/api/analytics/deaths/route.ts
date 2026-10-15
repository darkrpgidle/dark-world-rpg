import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { gameSaves } from "../../../../db/schema";
import { currentLogin } from "../../auth-utils";
import { activeSaveSession } from "../../../save-session-guard";

const validId = (value: string) => /^[a-zA-Z0-9_-]{20,80}$/.test(value);
const validClass = new Set(["戰士", "遊俠", "法師"]);
const boundedInteger = (value: unknown, minimum: number, maximum: number) => {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue >= minimum && numberValue <= maximum
    ? numberValue
    : null;
};

export async function POST(request: Request) {
  const login = await currentLogin(request);
  const account = login.account;
  if (!account) return Response.json({ error: login.error ?? "not_authenticated" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    playerId?: string;
    mapId?: unknown;
    floor?: unknown;
    playerClass?: string;
    playerLevel?: unknown;
    combatPower?: unknown;
  } | null;
  const playerId = body?.playerId ?? "";
  const mapId = boundedInteger(body?.mapId, 1, 9);
  const floor = boundedInteger(body?.floor, 1, 30);
  const playerLevel = boundedInteger(body?.playerLevel, 1, 999);
  const combatPower = boundedInteger(body?.combatPower, 0, 9_999_999_999);
  const playerClass = body?.playerClass ?? "";
  if (!validId(playerId) || mapId === null || floor === null || playerLevel === null || combatPower === null || !validClass.has(playerClass))
    return Response.json({ error: "invalid_death_event" }, { status: 400 });

  const db = await getDb();
  const [save] = await db
    .select({ accountId: gameSaves.accountId })
    .from(gameSaves)
    .where(eq(gameSaves.playerId, playerId))
    .limit(1);
  if (!save) return Response.json({ error: "character_not_found" }, { status: 404 });
  if (save.accountId !== account.id)
    return Response.json({ error: "save_belongs_to_other_account" }, { status: 403 });

  const inserted = await db.run(sql`
    INSERT INTO death_events (player_id, account_id, map_id, floor, player_class, player_level, combat_power, occurred_at)
    SELECT ${playerId}, ${account.id}, ${mapId}, ${floor}, ${playerClass}, ${playerLevel}, ${combatPower}, ${new Date().toISOString()}
    WHERE ${activeSaveSession(login.sessionId!, account.id)}
  `);
  if ((inserted.meta?.changes ?? 0) !== 1) return Response.json({ error: "session_replaced" }, { status: 401 });
  return Response.json({ ok: true });
}
