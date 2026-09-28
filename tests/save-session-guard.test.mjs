import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";

const { activeSaveSession } = await import("../app/save-session-guard.ts");
const dialect = new SQLiteSyncDialect();
const future = "2099-01-01T00:00:00.000Z";
const now = "2026-09-27T06:00:00.000Z";

function setup() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE sessions(token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, expires_at TEXT NOT NULL)");
  db.exec("CREATE TABLE game_saves(player_id TEXT PRIMARY KEY, account_id TEXT, payload TEXT NOT NULL)");
  db.prepare("INSERT INTO game_saves VALUES(?, ?, ?)").run("player", "account", "before");
  db.prepare("INSERT INTO sessions VALUES(?, ?, ?)").run("old", "account", future);
  return db;
}

function guardedUpdate(db, tokenHash) {
  const predicate = dialect.sqlToQuery(activeSaveSession(tokenHash, "account", now));
  return db.prepare(`UPDATE game_saves SET payload = ? WHERE player_id = ? AND ${predicate.sql}`)
    .run("after", "player", ...predicate.params).changes;
}

function guardedInsert(db, tokenHash, playerId) {
  const predicate = dialect.sqlToQuery(activeSaveSession(tokenHash, "account", now));
  return db.prepare(`INSERT OR IGNORE INTO game_saves(player_id, account_id, payload)
    SELECT ?, ?, ? WHERE ${predicate.sql}`)
    .run(playerId, "account", "created", ...predicate.params).changes;
}

test("a replaced login cannot update or create a save after its session is deleted", () => {
  const db = setup();
  assert.equal(guardedUpdate(db, "old"), 1);
  db.prepare("UPDATE game_saves SET payload = ?").run("before");
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run("old");
  db.prepare("INSERT INTO sessions VALUES(?, ?, ?)").run("new", "account", future);
  assert.equal(guardedUpdate(db, "old"), 0);
  assert.equal(guardedInsert(db, "old", "new-player"), 0);
  assert.equal(db.prepare("SELECT payload FROM game_saves WHERE player_id = ?").get("player").payload, "before");
  assert.equal(db.prepare("SELECT count(*) AS count FROM game_saves").get().count, 1);
  assert.equal(guardedUpdate(db, "new"), 1);
  assert.equal(guardedInsert(db, "new", "new-player"), 1);
  db.close();
});

test("expired or other-account sessions never satisfy the write predicate", () => {
  const db = setup();
  db.prepare("UPDATE sessions SET expires_at = ?").run("2020-01-01T00:00:00.000Z");
  assert.equal(guardedUpdate(db, "old"), 0);
  db.prepare("UPDATE sessions SET expires_at = ?, account_id = ?").run(future, "another-account");
  assert.equal(guardedInsert(db, "old", "new-player"), 0);
  db.close();
});
