// Compare a pre-reset export with an independently recovered export.
// Reads local files only; never writes to a database or restores game saves.
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { previewLegacyRebirth } from "../app/legacy-rebirth-preview.ts";

const fields = {
  accounts: ["id"],
  saves: ["playerId", "accountId", "payload", "updatedAt"],
  snapshots: ["id", "playerId", "accountId", "payload", "capturedAt"],
};

function records(data, table) {
  if (!Array.isArray(data)) throw new Error("Invalid export format");
  const seen = new Set();
  return data.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row) ||
        Object.keys(row).sort().join("|") !== [...fields[table]].sort().join("|") ||
        fields[table].some(key => key !== "id" &&
          (key === "accountId" ? row[key] !== null && typeof row[key] !== "string" : typeof row[key] !== "string")) ||
        (table === "snapshots" && (!Number.isSafeInteger(row.id) || row.id < 1)) ||
        (table === "accounts" && (typeof row.id !== "string" || !row.id.trim())) ||
        (table !== "accounts" && (!row.playerId.trim() ||
          (table === "snapshots" && !row.accountId.trim())))) {
      throw new Error("Invalid export format");
    }
    const key = table === "accounts" ? row.id : table === "saves" ? row.playerId : String(row.id);
    if (seen.has(key)) throw new Error("Duplicate export row");
    seen.add(key);
    return fields[table].map(field => row[field]);
  }).sort((a, b) => String(a[0]).localeCompare(String(b[0]), "en"));
}

function checkExport(data) {
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      Object.keys(data).sort().join("|") !== "accounts|capturedAt|saves|snapshots" ||
      typeof data.capturedAt !== "string" || !Number.isFinite(Date.parse(data.capturedAt))) {
    throw new Error("Invalid export format");
  }
  const accounts = records(data.accounts, "accounts");
  const saves = records(data.saves, "saves");
  const snapshots = records(data.snapshots, "snapshots");
  if (!accounts.length) throw new Error("Empty account export");
  const preview = previewLegacyRebirth({
    capturedAt: data.capturedAt,
    accountIds: accounts.map(row => row[0]),
    rows: [
      ...data.saves.map(row => ({ kind: "save", rowId: row.playerId, playerId: row.playerId,
        accountId: row.accountId, payload: row.payload, capturedAt: row.updatedAt })),
      ...data.snapshots.map(row => ({ kind: "snapshot", rowId: String(row.id), playerId: row.playerId,
        accountId: row.accountId, payload: row.payload, capturedAt: row.capturedAt })),
    ],
  });
  const canonical = JSON.stringify([data.capturedAt, accounts, saves, snapshots]);
  return {
    sha256: createHash("sha256").update(canonical).digest("hex"),
    recordCounts: { accounts: accounts.length, saves: saves.length, snapshots: snapshots.length },
    reviewRequired: Boolean(preview.rejected.length || preview.missingAccountIds.length ||
      preview.entries.some(row => row.needsReview)),
  };
}

if (process.argv.length !== 4) {
  process.stderr.write("Usage: node scripts/verify-legacy-rebirth-backup.mjs pre-reset-export.json recovered-export.json\n");
  process.exitCode = 2;
} else {
  try {
    const [originalFile, recoveredFile] = await Promise.all(process.argv.slice(2).map(path => stat(path)));
    if (originalFile.dev === recoveredFile.dev && originalFile.ino === recoveredFile.ino)
      throw new Error("Two independent export files are required");
    const [original, recovered] = await Promise.all(process.argv.slice(2).map(async path =>
      checkExport(JSON.parse(await readFile(path, "utf8")))));
    const integrityMatches = original.sha256 === recovered.sha256;
    const reviewRequired = original.reviewRequired || recovered.reviewRequired;
    // Matching bytes do not approve migration when source ownership or
    // historical rebirth values still need manual reconciliation.
    const verified = integrityMatches && !reviewRequired;
    process.stdout.write(`${JSON.stringify({ verified, integrityMatches, sha256: original.sha256,
      recordCounts: original.recordCounts, reviewRequired })}\n`);
    if (!verified) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error &&
      ["Invalid export format", "Duplicate export row", "Empty account export", "Two independent export files are required"].includes(error.message)
      ? error.message : "Unable to verify export files"}\n`);
    process.exitCode = 2;
  }
}
