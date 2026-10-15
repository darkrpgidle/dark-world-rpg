// Drizzle's D1 driver returns native D1 metadata. Some adapters expose the
// row count directly; keep that compatibility without treating a successful
// D1 mutation as a failed CAS or a replaced login.
export function affectedRows(result: { meta?: { changes?: number }; rowsAffected?: number }) {
  return result.meta?.changes ?? result.rowsAffected ?? 0;
}
