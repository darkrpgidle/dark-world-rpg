import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import vm from 'node:vm';
registerHooks({ resolve(s, c, next) { return next(s.startsWith('./') && !s.endsWith('.ts') ? `${s}.ts` : s, c); } });
const { affectedRows } = await import('../app/d1-write-result.ts');
const { prepareIdleClaim } = await import('../app/idle-claim.ts');
const { validateSaveTransition } = await import('../app/save-integrity.ts');

// Execute the production claim branch, rather than a copied retry algorithm.
// SQLite is isolated in memory; the adapter maps the Drizzle calls used here.
// This covers claim/CAS behavior, not HTTP authentication or remote D1 transport.
const route = stripTypeScriptTypes(readFileSync(new URL('../app/api/save/route.ts', import.meta.url), 'utf8'));
const start = route.indexOf('if (body.action === "claim_idle")');
const end = route.indexOf('if (body.action ===', start + 1);
assert.ok(start >= 0 && end > start, 'production claim branch must remain identifiable');
const execute = new (Object.getPrototypeOf(async function () {}).constructor)(
  'body', 'existing', 'db', 'gameSaves', 'account', 'playerId', 'sessionId', 'affectedRows',
  'writerCondition', 'writerRevoked', 'replacedResponse', 'jsonNoStore',
  'resetPersonalBossTicketsIfNeeded', 'prepareIdleClaim', 'nextUpdatedAt', 'and', 'eq', 'Date',
  route.slice(start, end),
);
const at = Date.parse('2026-10-10T20:00:00Z');
const id = 'a7420c19-d735-41ca-933c-4f06df77ad52';
const columns = { playerId: 'player_id', accountId: 'account_id', updatedAt: 'updated_at', payload: 'payload' };
const eq = (column, value) => ({ sql: `${column} = ?`, params: [value] });
const and = (...clauses) => ({ sql: clauses.map(c => `(${c.sql})`).join(' AND '), params: clauses.flatMap(c => c.params) });
const baseline = () => ({ playerClass: '遊俠', level: 1, exp: 0, xpSchemaVersion: 2, skillReworkVersion: 2,
  rebirthCount: 0, rebirthPoints: 0, rebirthTalents: {}, gold: 0, yuanbao: 0, enhanceStones: 0,
  reforgeStones: 0, drillingStones: 0, combatPower: 1350, worldDamage: 0, unlockedMapId: 1,
  mapId: 1, wave: 1, mapBestFloors: { 1: 1 }, dailyDate: '2026-10-11', dailyKills: 0,
  items: [], mails: [], gemInventory: [], storedSeconds: 3600, lastSeenAt: at,
});
function setup(t, resultShape = "rowsAffected") {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec('CREATE TABLE game_saves(player_id TEXT PRIMARY KEY, account_id TEXT, payload TEXT, updated_at TEXT); CREATE TABLE sessions(token_hash TEXT PRIMARY KEY, account_id TEXT)');
  sqlite.prepare('INSERT INTO sessions VALUES (?, ?)').run('login-1', 'account');
  sqlite.prepare('INSERT INTO game_saves VALUES (?, ?, ?, ?)').run('player', 'account', JSON.stringify(baseline()), new Date(at).toISOString());
  const metrics = { writes: 0, conflicts: 0 };
  const read = () => sqlite.prepare('SELECT account_id AS accountId, payload, updated_at AS updatedAt FROM game_saves WHERE player_id = ?').get('player');
  const db = {
    update() { return { set(values) { return { async where(predicate) {
      // Yield before the real conditional write to force overlap between requests.
      await new Promise(resolve => setImmediate(resolve));
      const { changes } = sqlite.prepare(`UPDATE game_saves SET account_id = ?, payload = ?, updated_at = ? WHERE ${predicate.sql}`)
        .run(values.accountId, values.payload, values.updatedAt, ...predicate.params);
      metrics[changes ? 'writes' : 'conflicts']++;
      return resultShape === "meta" ? { meta: { changes: Number(changes) } } : { rowsAffected: Number(changes) };
    } }; } }; },
    select() { return { from() { return { where() { return { async limit() { return [read()]; } }; } }; } }; },
  };
  const request = (claimId = id, snapshot = read(), sessionId = 'login-1') => execute(
    { action: 'claim_idle', claimId }, [snapshot], db, columns, { id: 'account' }, 'player', sessionId, affectedRows,
    () => ({ sql: 'EXISTS (SELECT 1 FROM sessions WHERE token_hash = ? AND account_id = ?)', params: [sessionId, 'account'] }),
    async () => !sqlite.prepare('SELECT 1 FROM sessions WHERE token_hash = ?').get(sessionId),
    () => Response.json({ error: 'session_replaced' }, { status: 401 }),
    (body, status = 200) => Response.json(body, { status }), save => save, prepareIdleClaim,
    previous => new Date(Date.parse(previous) + 1).toISOString(), and, eq, { now: () => at },
  );
  return { sqlite, read, request, metrics };
}

test('commit succeeds but response is lost: 32 parallel retries return the original receipt without a second write', async t => {
  const h = setup(t);
  const first = await h.request();
  assert.equal((await first.json()).accepted, true);
  // The transport drops this response after the database commit, before client consumption.
  const committed = h.read();
  const retries = await Promise.all(Array.from({ length: 32 }, () => h.request()));
  for (const response of retries) {
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, accepted: false, updatedAt: committed.updatedAt, claimedSeconds: 3600 });
  }
  assert.equal(h.metrics.writes, 1);
  assert.deepEqual(h.read(), committed);
  assert.equal(JSON.parse(committed.payload).storedSeconds, 0);
});

test('32 claims read the same old version: exactly one CAS commits and losers reload the receipt', async t => {
  const h = setup(t), snapshot = h.read();
  const results = await Promise.all(Array.from({ length: 32 }, () => h.request(id, snapshot).then(r => r.json())));
  assert.equal(results.filter(r => r.accepted).length, 1);
  assert.equal(h.metrics.writes, 1);
  assert.equal(h.metrics.conflicts, 31);
  assert.ok(results.every(r => r.ok && r.claimedSeconds === 3600 && r.updatedAt === h.read().updatedAt));
});

test('different claim IDs cannot both consume the same accumulated hour', async t => {
  const h = setup(t), snapshot = h.read();
  const other = 'b7420c19-d735-41ca-933c-4f06df77ad52';
  const results = await Promise.all([h.request(id, snapshot), h.request(other, snapshot)]);
  const receipts = await Promise.all(results.map(r => r.json()));
  assert.deepEqual(receipts.map(r => r.claimedSeconds).sort((a, b) => a - b), [0, 3600]);
  assert.equal(JSON.parse(h.read().payload).storedSeconds, 0);
});

test('login is replaced after initial read: stale claimant cannot commit or consume time', async t => {
  const h = setup(t), snapshot = h.read();
  h.sqlite.prepare('DELETE FROM sessions WHERE token_hash = ?').run('login-1');
  const response = await h.request(id, snapshot);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'session_replaced');
  assert.equal(h.metrics.writes, 0);
  assert.deepEqual(h.read(), snapshot);
});

test('lost-response retries do not mint additional offline resource credit when rewards are saved', async t => {
  const h = setup(t);
  await h.request();
  let server = JSON.parse(h.read().payload);
  const rewarded = validateSaveTransition({ ...server, gold: 920, enhanceStones: 6 }, server, at, at);
  assert.equal(rewarded.gold, 920);
  assert.equal(rewarded.enhanceStones, 6);
  assert.equal(rewarded._saveIntegrity.idleClaimId, id);
  h.sqlite.prepare('UPDATE game_saves SET payload = ?').run(JSON.stringify(rewarded));
  await Promise.all(Array.from({ length: 32 }, () => h.request()));
  server = JSON.parse(h.read().payload);
  const savedAgain = validateSaveTransition(server, server, at, at);
  for (const [field, credit] of Object.entries(savedAgain._saveIntegrity.credits))
    assert.ok(credit <= rewarded._saveIntegrity.credits[field], `${field} credit must not increase on replay`);
  assert.equal(savedAgain.gold, 920);
  assert.equal(savedAgain.enhanceStones, 6);
});


test('actual browser claim handler retries a lost committed response and 32 simultaneous clicks grant local rewards once', async t => {
  const h = setup(t);
  const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
  const begin = page.indexOf('const claimOfflineReport = async () => {');
  const finish = page.indexOf('const enhance =', begin);
  assert.ok(begin >= 0 && finish > begin);
  const stats = { fetches: 0, gold: 0, stones: 0, experienceGrants: 0, experience: 0, successfulReports: 0 };
  const noop = () => {};
  const context = {
    gemActionBusyRef: { current: false },gemPendingRef: { current: null },offlineClaimPendingRef: { current: false }, equipmentBusyRef: { current: false }, equipmentPendingRef: { current: false },
    pendingIdleClaimIdRef: { current: null }, saveInFlightRef: { current: false }, lastIdleClaimIdRef: { current: null },
    storedSeconds: 3600, saveUpdatedAt: new Date(at).toISOString(), loginId: 'login-1', playerId: 'player',
    crypto: { randomUUID: () => id }, loginHeaders: () => ({}),
    async fetch(url, options) {
      stats.fetches++;
      const response = await h.request(JSON.parse(options.body).claimId);
      if (stats.fetches === 1) throw new TypeError('Injected response loss after successful database commit');
      return response;
    },
    window: { setTimeout: resolve => setTimeout(resolve, 0) },
    characterStats: { goldBonus: 0, expBonus: 0 }, offlineSetMultiplier: 1,
    currentMap: { exp: [999, 999] }, offlineMap: { exp: [10, 10] }, normalMapId: 1, EXPERIENCE_MULTIPLIER: 1, newcomerExperienceFactor: () => 1,
    mapId: 1, level: 1, Math: Object.assign(Object.create(Math), { random: () => 1 }),
    rollGemDrop: () => null, rollDrillingStoneDrop: () => false,
    grantExperience: amount => { stats.experienceGrants++; stats.experience += amount; },
    setGold: update => { stats.gold = update(stats.gold); },
    setEnhanceStones: update => { stats.stones = update(stats.stones); },
    setOfflineClaimPending: noop, resetStoredTime: noop, setSaveUpdatedAt: noop, setSaveStatus: noop,
    setOfflineReportOpen: noop, setBattleOn: noop, pauseSupersededSession: noop, addLoot: noop, pushLog: noop,
    toast: { error: message => assert.fail(message), info: noop, success: () => stats.successfulReports++ },
  };
  vm.createContext(context);
  vm.runInContext(`${stripTypeScriptTypes(page.slice(begin, finish))}; globalThis.runClaim = claimOfflineReport;`, context);
  await Promise.all(Array.from({ length: 32 }, () => context.runClaim()));
  assert.equal(stats.fetches, 2);
  assert.equal(h.metrics.writes, 1);
  assert.equal(stats.gold, 920);
  assert.equal(stats.stones, 6);
  assert.equal(stats.experienceGrants, 1);
  assert.equal(stats.experience, 3000, "offline rewards use the saved ordinary map even while a real map is active");
  assert.equal(stats.successfulReports, 1);
  assert.equal(context.pendingIdleClaimIdRef.current, null);
  assert.equal(context.offlineClaimPendingRef.current, false);
});


test('D1 meta.changes-only result correctly acknowledges the first committed claim', async t => {
  const h = setup(t, 'meta');
  const response = await h.request();
  const result = await response.json();
  assert.equal(result.ok, true);
  assert.equal(result.accepted, true);
  assert.equal(result.claimedSeconds, 3600);
  assert.equal(h.metrics.writes, 1);
  assert.equal(JSON.parse(h.read().payload)._lastIdleClaimId, id);
});
