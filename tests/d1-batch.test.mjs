import test from "node:test";
import assert from "node:assert/strict";
import { chunkByBindingLimit, executeD1Batch } from "../app/d1-batch.ts";

test("multi-row reset entitlements fit the 100-binding D1 limit with one reset guard", () => {
  const rows = Array.from({ length: 51 }, (_, index) => ({ accountId: `account-${index}` }));
  const chunks = chunkByBindingLimit(rows, 5, 95);

  assert.deepEqual(chunks.map((chunk) => chunk.length), [19, 19, 13]);
  assert.deepEqual(chunks.flat(), rows);
  assert.ok(chunks.every((chunk) => chunk.length * 5 + 1 <= 100));
  assert.deepEqual(chunkByBindingLimit([], 5, 95), []);
});

test("parameterized raw SQL and Drizzle queries are prepared before one native D1 batch", async () => {
  const prepared = [];
  const calls = [];
  const client = {
    prepare(sql) {
      const statement = { sql, values: [] };
      prepared.push(statement);
      return { bind(...values) { statement.values = values; return statement; } };
    },
    async batch(statements) {
      calls.push(statements);
      return statements.map((_, index) => ({ meta: { changes: index + 1 } }));
    },
  };
  const query = (sql, params) => ({ _prepare: () => ({ getQuery: () => ({ sql, params }) }) });

  const result = await executeD1Batch(client, [
    query("INSERT INTO runs (id) SELECT ? WHERE ? = 1", ["run-1", 1]),
    query("DELETE FROM sessions", []),
  ]);

  assert.deepEqual(prepared, [
    { sql: "INSERT INTO runs (id) SELECT ? WHERE ? = 1", values: ["run-1", 1] },
    { sql: "DELETE FROM sessions", values: [] },
  ]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].length, 2);
  assert.deepEqual(result.map((row) => row.meta.changes), [1, 2]);
});
