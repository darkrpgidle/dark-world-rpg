import assert from "node:assert/strict";
import test from "node:test";
import { preserveServerResourceRevision } from "../app/server-resource-revision.ts";

const server = { adminRevision: 3, yuanbao: 100, gold: 20, level: 7,
  exp: 4, enhanceStones: 2, reforgeStones: 1, items: ["server-item"] };

test("first save starts at revision zero regardless of client input", () => {
  assert.equal(preserveServerResourceRevision({ adminRevision: 99, yuanbao: 0 }, null).adminRevision, 0);
});

test("stale autosave preserves server grants and revision without erasing other save fields", () => {
  const result = preserveServerResourceRevision({ adminRevision: 2, yuanbao: 0, gold: 1,
    level: 1, exp: 0, enhanceStones: 0, reforgeStones: 0, items: ["client-item"] }, server);
  assert.equal(result.adminRevision, 3);
  assert.equal(preserveServerResourceRevision({ adminRevision: 2 }, { ...server, adminRevision: "3" }).adminRevision, 3);
  for (const field of ["yuanbao", "gold", "level", "exp", "enhanceStones", "reforgeStones"])
    assert.equal(result[field], server[field]);
  assert.deepEqual(result.items, ["client-item"]);
});

test("current revision keeps ordinary client gains while server revision remains canonical", () => {
  const result = preserveServerResourceRevision({ adminRevision: 3, yuanbao: 101, gold: 25 }, server);
  assert.equal(result.yuanbao, 101);
  assert.equal(result.gold, 25);
  assert.equal(result.adminRevision, 3);
});

test("future, malformed or negative client revisions never bypass server checks", () => {
  for (const value of [4, 999, -1, 3.5, "3", Infinity, NaN])
    assert.equal(preserveServerResourceRevision({ adminRevision: value, yuanbao: 9999 }, server), null);
  assert.equal(preserveServerResourceRevision({ adminRevision: 0 }, { ...server, adminRevision: -1 }), null);
});
