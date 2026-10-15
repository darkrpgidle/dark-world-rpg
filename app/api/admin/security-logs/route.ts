import { and, count, desc, eq, like, lt, or, sql } from "drizzle-orm";
import { getDb } from "../../../../db";
import { accounts, gmActionLogs } from "../../../../db/schema";
import { currentAccount } from "../../auth-utils";
import { parseIntegrityDetail } from "../../../save-integrity-audit";
const json = (body: unknown, status=200) => Response.json(body,{status,headers:{"Cache-Control":"no-store, max-age=0"}});
export async function GET(request: Request) {
 const gm = await currentAccount(request);
 if (!gm) return json({error:"not_authenticated"},401);
 if (!gm.isGm) return json({error:"forbidden"},403);
 const p = new URL(request.url).searchParams;
 const q = (p.get("q") ?? "").trim().slice(0,80);
 const reason = (p.get("reason") ?? "").slice(0,80);
 const range = p.get("range") === "all" ? "all" : p.get("range") === "7d" ? "7d" : "24h";
 const cursor = p.has("cursor") ? Number(p.get("cursor")) : null;
 if (cursor !== null && (!Number.isSafeInteger(cursor) || cursor < 1)) return json({error:"invalid_cursor"},400);
 const reasonSql = sql<string>`CASE WHEN json_valid(${gmActionLogs.detail}) THEN json_extract(${gmActionLogs.detail}, '$.reason') ELSE 'unknown' END`;
 const conditions = [eq(gmActionLogs.action,"save_integrity_rejected")];
 if (range !== "all") conditions.push(sql`julianday(${gmActionLogs.createdAt}) >= julianday(${new Date(Date.now()-(range === "7d" ? 7 : 1)*86400000).toISOString()})`);
 if (reason) conditions.push(eq(reasonSql,reason));
 if (q) conditions.push(or(like(accounts.username,`%${q}%`),eq(gmActionLogs.targetAccountId,q))!);
 const db = await getDb();
 const where = and(...conditions);
 const recent = and(eq(gmActionLogs.action,"save_integrity_rejected"),sql`julianday(${gmActionLogs.createdAt}) >= julianday(${new Date(Date.now()-86400000).toISOString()})`);
 const [rows,[total],[dayTotal],reasons] = await Promise.all([
  db.select({id:gmActionLogs.id,accountId:gmActionLogs.targetAccountId,username:accounts.username,detail:gmActionLogs.detail,createdAt:gmActionLogs.createdAt})
   .from(gmActionLogs).leftJoin(accounts,eq(gmActionLogs.targetAccountId,accounts.id)).where(and(where,cursor ? lt(gmActionLogs.id,cursor) : undefined)).orderBy(desc(gmActionLogs.id)).limit(26),
  db.select({value:count()}).from(gmActionLogs).leftJoin(accounts,eq(gmActionLogs.targetAccountId,accounts.id)).where(where),
  db.select({value:count(),accounts:sql<number>`count(distinct ${gmActionLogs.targetAccountId})`}).from(gmActionLogs).where(recent),
  db.select({reason:reasonSql,value:count()}).from(gmActionLogs).where(recent).groupBy(reasonSql).orderBy(desc(count())).limit(12),
 ]);
 const logs = rows.slice(0,25).map(({detail,...row})=>({...row,...parseIntegrityDetail(detail)}));
 return json({logs,total:total?.value ?? 0,nextCursor:rows.length>25 ? logs.at(-1)?.id : null,
  summary:{last24Hours:dayTotal?.value ?? 0,accounts:dayTotal?.accounts ?? 0,reasons}});
}
