import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {buildAccountDeletion} from '../app/admin-account-delete.ts';
function setup(){const db=new DatabaseSync(':memory:');db.exec(`
CREATE TABLE accounts(id TEXT PRIMARY KEY,username TEXT UNIQUE,is_gm INTEGER);
CREATE TABLE sessions(account_id TEXT);
CREATE TABLE game_saves(player_id TEXT PRIMARY KEY,account_id TEXT,payload TEXT,updated_at TEXT);
CREATE TABLE account_rebirth_entitlements(account_id TEXT);
CREATE TABLE save_snapshots(id INTEGER PRIMARY KEY,player_id TEXT,account_id TEXT,payload TEXT,kind TEXT,captured_at TEXT);
CREATE TABLE gm_action_logs(id INTEGER PRIMARY KEY,gm_account_id TEXT,target_account_id TEXT,action TEXT,detail TEXT,created_at TEXT);
INSERT INTO accounts VALUES('a','player',0),('gm','gm4d',1);
INSERT INTO sessions VALUES('a'),('gm');
INSERT INTO game_saves VALUES('p','a','{"gold":100}','old'),('p2','a','{}','old'),('g','gm','{}','old');
INSERT INTO account_rebirth_entitlements VALUES('a'),('gm');`);return db;}
function run(db,id='a',name='player',actor='gm'){db.exec('BEGIN');try{const r=buildAccountDeletion(id,name,actor,'test').map(s=>db.prepare(s.sql).run(...s.bindings));db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}
test('deletes credentials and all live account data atomically while preserving backups and audit',()=>{
const db=setup();assert.equal(run(db).at(-1).changes,1);
for(const table of ['accounts','sessions','game_saves','account_rebirth_entitlements']){const key=table==='accounts'?'id':'account_id';assert.equal(db.prepare(`SELECT count(*) n FROM ${table} WHERE ${key}='a'`).get().n,0);assert.equal(db.prepare(`SELECT count(*) n FROM ${table} WHERE ${key}='gm'`).get().n,1);}
assert.equal(db.prepare('SELECT count(*) n FROM save_snapshots').get().n,2);
assert.deepEqual(JSON.parse(db.prepare('SELECT detail FROM gm_action_logs').get().detail),{username:'player',reason:'test'});
assert.equal(run(db).at(-1).changes,0);assert.equal(db.prepare('SELECT count(*) n FROM gm_action_logs').get().n,1);
db.exec("INSERT INTO accounts VALUES('new','player',0)");assert.equal(db.prepare("SELECT count(*) n FROM account_rebirth_entitlements WHERE account_id='new'").get().n,0);db.close();
});
test('SQL rechecks GM protection, self deletion and exact target name without side effects',()=>{
for(const [id,name,actor] of [['gm','gm4d','other'],['a','player','a'],['a','wrong','gm']]){const db=setup();assert.equal(run(db,id,name,actor).at(-1).changes,0);assert.equal(db.prepare('SELECT count(*) n FROM accounts').get().n,2);assert.equal(db.prepare('SELECT count(*) n FROM save_snapshots').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM gm_action_logs').get().n,0);db.close();}
});
test('failure during deletion rolls back account, sessions, entitlements, saves and audit',()=>{
const db=setup();db.exec("CREATE TRIGGER fail_delete BEFORE DELETE ON accounts BEGIN SELECT RAISE(ABORT,'failed'); END;");assert.throws(()=>run(db));assert.equal(db.prepare('SELECT count(*) n FROM game_saves').get().n,3);assert.equal(db.prepare('SELECT count(*) n FROM sessions').get().n,2);assert.equal(db.prepare('SELECT count(*) n FROM account_rebirth_entitlements').get().n,2);assert.equal(db.prepare('SELECT count(*) n FROM gm_action_logs').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM save_snapshots').get().n,0);db.close();
});
test('route checks role, exact confirmation and reason before invoking deletion; UI requires explicit confirmation',()=>{
const route=readFileSync(new URL('../app/api/admin/player-control/route.ts',import.meta.url),'utf8'),ui=readFileSync(new URL('../app/admin-panels.tsx',import.meta.url),'utf8');
assert.ok(route.indexOf('if (!gm.isGm)')<route.indexOf('buildAccountDeletion(target'));assert.ok(route.indexOf('body.confirmation !== target.username')<route.indexOf('buildAccountDeletion(target'));assert.match(route,/deletion_reason_required/);assert.match(ui,/deleteConfirmation!==pendingDelete\?\.username/);assert.match(ui,/event.preventDefault\(\);void deleteAccount\(\)/);
});
