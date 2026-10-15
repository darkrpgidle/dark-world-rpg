type BatchableQuery = {
  _prepare(): {
    getQuery(): { sql: string; params: unknown[] };
  };
};

type D1BatchClient<Result> = {
  prepare(sql: string): {
    bind(...values: unknown[]): unknown;
  };
  batch(statements: unknown[]): Promise<Result[]>;
};

export function chunkByBindingLimit<T>(rows: readonly T[], bindingsPerRow: number, maxBindings = 100) {
  if (!Number.isInteger(bindingsPerRow) || bindingsPerRow < 1 || bindingsPerRow > maxBindings) {
    throw new RangeError("Each row must use between 1 and maxBindings parameters.");
  }
  const chunkSize = Math.floor(maxBindings / bindingsPerRow);
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += chunkSize) {
    chunks.push(rows.slice(index, index + chunkSize));
  }
  return chunks;
}

/**
 * Drizzle's D1 batch adapter assumes every prepared query has a D1 statement.
 * Raw `db.run(sql`...`)` queries do not, so parameterized raw queries throw
 * while reading `stmt.bind`. Prepare every Drizzle query through D1 directly
 * and submit the complete list in one atomic D1 batch instead.
 */
export function executeD1Batch<Result>(
  client: D1BatchClient<Result>,
  queries: readonly BatchableQuery[],
) {
  const statements = queries.map((query) => {
    const built = query._prepare().getQuery();
    return client.prepare(built.sql).bind(...built.params);
  });
  return client.batch(statements);
}
