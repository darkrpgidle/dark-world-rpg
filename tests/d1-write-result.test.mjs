import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { affectedRows } from '../app/d1-write-result.ts';

test('D1 changes are authoritative and zero is not confused with an adapter count', () => {
  assert.equal(affectedRows({meta:{changes:1}}),1);
  assert.equal(affectedRows({rowsAffected:1}),1);
  assert.equal(affectedRows({meta:{changes:0},rowsAffected:1}),0);
  assert.equal(affectedRows({}),0);
});

test('real logout function acknowledges a D1 deletion and rejects zero-change stale logout', async () => {
  const source=stripTypeScriptTypes(readFileSync(new URL('../app/api/auth-utils.ts',import.meta.url),'utf8'));
  const start=source.indexOf('export async function deleteSession(');
  const end=source.indexOf('export function normalizeUsername',start);
  assert.ok(start>=0&&end>start);
  let changes=1,seen;
  const factory=new Function('getDb','readSessionToken','LOGIN_ID_HEADER','sessions','eq','and','digest','affectedRows',
    `${source.slice(start,end).replace('export async function','async function')};return deleteSession;`);
  const fn=factory(async()=>({delete:()=>({where:async predicate=>{seen=predicate;return {meta:{changes}};}})}),
    ()=> 'token','x-dark-world-login-id',{tokenHash:'hash',loginId:'login'},(key,value)=>({key,value}),(...clauses)=>clauses,
    async()=> 'hashed-token',affectedRows);
  const request=new Request('https://example.test',{headers:{'x-dark-world-login-id':'instance'}});
  assert.equal(await fn(request),true);
  assert.deepEqual(seen,[{key:'hash',value:'hashed-token'},{key:'login',value:'instance'}]);
  changes=0;assert.equal(await fn(request),false);
  assert.equal(await fn(new Request('https://example.test')),false);
});
