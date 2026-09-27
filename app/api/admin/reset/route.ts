import { currentAccount } from "../../auth-utils";

// The former global wipe deleted stable player account IDs. Disable it until
// the replacement restart migration has a verified backup and per-account
// compensation evidence. This route must never be a shortcut around that gate.
export async function POST(request: Request) {
  const gm = await currentAccount(request);
  if (!gm) return Response.json({ error: "not_authenticated" }, { status: 401 });
  if (!gm.isGm) return Response.json({ error: "forbidden" }, { status: 403 });
  return Response.json({ error: "legacy_rebirth_migration_required" }, { status: 409 });
}
