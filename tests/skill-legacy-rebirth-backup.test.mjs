import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/verify-legacy-rebirth-backup.mjs", import.meta.url));
const sample = () => ({
  capturedAt: "2026-09-27T01:00:00Z",
  accounts: [{ id: "account-a" }],
  saves: [{ playerId: "player-a", accountId: "account-a",
    payload: JSON.stringify({ rebirthCount: 3 }), updatedAt: "2026-09-26 12:00:00" }],
  snapshots: [{ id: 1, playerId: "player-a", accountId: "account-a",
    payload: JSON.stringify({ rebirthCount: 5 }), capturedAt: "2026-09-25 12:00:00" }],
});

async function withExports(run) {
  const dir = await mkdtemp(join(tmpdir(), "legacy-rebirth-check-"));
  try {
    const source = join(dir, "source.json");
    const recovered = join(dir, "recovered.json");
    const data = sample();
    await writeFile(source, JSON.stringify(data));
    await writeFile(recovered, JSON.stringify(data));
    await run({ source, recovered, data });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function verify(source, recovered) {
  return spawnSync(process.execPath, [script, source, recovered], { encoding: "utf8" });
}

test("independent exports with reordered records pass and reveal only counts and digest", async () => {
  await withExports(async ({ source, recovered, data }) => {
    data.snapshots.push({ ...data.snapshots[0], id: 2, payload: JSON.stringify({ rebirthCount: 3 }) });
    await writeFile(source, JSON.stringify(data));
    data.snapshots.reverse();
    await writeFile(recovered, JSON.stringify(data));
    const result = verify(source, recovered);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.verified, true);
    assert.equal(output.integrityMatches, true);
    assert.equal(output.sha256.length, 64);
    assert.deepEqual(output.recordCounts, { accounts: 1, saves: 1, snapshots: 2 });
    assert.equal(result.stdout.includes("rebirthCount"), false);
  });
});

test("a missing snapshot or changed historical count fails comparison", async () => {
  await withExports(async ({ source, recovered, data }) => {
    data.snapshots = [];
    await writeFile(recovered, JSON.stringify(data));
    assert.equal(verify(source, recovered).status, 1);
    data = sample();
    data.snapshots[0].payload = JSON.stringify({ rebirthCount: 4 });
    await writeFile(recovered, JSON.stringify(data));
    assert.equal(verify(source, recovered).status, 1);
  });
});

test("the same file, duplicate rows or malformed exports cannot pass as a recovery", async () => {
  await withExports(async ({ source, recovered, data }) => {
    assert.equal(verify(source, source).status, 2);
    data.snapshots.push({ ...data.snapshots[0] });
    await writeFile(recovered, JSON.stringify(data));
    assert.equal(verify(source, recovered).status, 2);
    await writeFile(recovered, "{corrupt");
    assert.equal(verify(source, recovered).status, 2);
  });
});

test("a faithful copy of unverifiable history is not marked verified", async () => {
  await withExports(async ({ source, recovered, data }) => {
    data.snapshots[0].payload = JSON.stringify({ rebirthCount: 21 });
    await Promise.all([writeFile(source, JSON.stringify(data)), writeFile(recovered, JSON.stringify(data))]);
    const result = verify(source, recovered);
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.integrityMatches, true);
    assert.equal(output.reviewRequired, true);
    assert.equal(output.verified, false);
  });
});

test("matching exports with unknown account ownership cannot pass preflight", async () => {
  await withExports(async ({ source, recovered, data }) => {
    data.snapshots[0].accountId = "unknown-account";
    await Promise.all([writeFile(source, JSON.stringify(data)), writeFile(recovered, JSON.stringify(data))]);
    const result = verify(source, recovered);
    assert.equal(result.status, 1);
    const output = JSON.parse(result.stdout);
    assert.equal(output.verified, false);
    assert.equal(output.integrityMatches, true);
    assert.equal(output.reviewRequired, true);
    assert.deepEqual(output.recordCounts, { accounts: 1, saves: 1, snapshots: 1 });
  });
});
