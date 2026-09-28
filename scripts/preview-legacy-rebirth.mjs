// Usage: node scripts/preview-legacy-rebirth.mjs authorized-export.json
// Only reads an export; never connects to the game database or changes saves.
import { readFile } from "node:fs/promises";
import { previewLegacyRebirth } from "../app/legacy-rebirth-preview.ts";

if (process.argv.length !== 3) {
  process.stderr.write("Usage: node scripts/preview-legacy-rebirth.mjs authorized-export.json\n");
  process.exitCode = 2;
} else {
  try {
    const exportData = JSON.parse(await readFile(process.argv[2], "utf8"));
    const rows = [
      ...exportData.saves.map(row => ({
        kind: "save", rowId: row.playerId, playerId: row.playerId,
        accountId: row.accountId, capturedAt: row.updatedAt, payload: row.payload,
      })),
      ...exportData.snapshots.map(row => ({
        kind: "snapshot", rowId: String(row.id), playerId: row.playerId,
        accountId: row.accountId, capturedAt: row.capturedAt, payload: row.payload,
      })),
    ];
    const preview = previewLegacyRebirth({
      capturedAt: exportData.capturedAt,
      accountIds: exportData.accounts.map(row => row.id),
      rows,
    });
    process.stdout.write(`${JSON.stringify(preview, null, 2)}\n`);
    if (preview.rejected.length || preview.missingAccountIds.length || preview.entries.some(row => row.needsReview)) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Invalid export"}\n`);
    process.exitCode = 2;
  }
}
