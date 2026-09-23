import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { gameSaves } from "../../../db/schema";
import { currentLogin } from "../auth-utils";

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
        name: save.playerName ?? account.username,
        cls: save.playerClass,
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
  const body = (await request.json()) as {
    playerId?: string;
    accountName?: string;
    playerName?: string;
    playerClass?: string;
  };
  const playerId = body.playerId?.trim() ?? "";
  const accountName = account.username;
  const playerName = body.playerName?.trim() ?? "";
  const playerClass = body.playerClass?.trim() ?? "";
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
    saveSchemaVersion: 5,
    accountName,
    playerName,
    playerClass,
    reservationOnly: true,
  });
  await db.insert(gameSaves).values({
    playerId,
    accountId: account.id,
    payload,
    updatedAt: new Date().toISOString(),
  });
  return Response.json({ ok: true });
}
