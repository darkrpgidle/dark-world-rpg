import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){
 if(c.parentURL?.includes('/app/api/admin/edit-save/') && s==='../../auth-utils')return {url:'data:text/javascript,export async function currentAccount(){return globalThis.__selfAuth ?? null}',shortCircuit:true};
 if(c.parentURL?.includes('/app/api/admin/edit-save/') && s==='../../../../db')return {url:'data:text/javascript,export async function getDb(){return globalThis.__selfDb}',shortCircuit:true};
 return n(s.startsWith('.')&&!/\.[cm]?[jt]sx?$/.test(s)?`${s}.ts`:s,c);
}});
const {GET,POST}=await import('../app/api/admin/edit-save/route.ts');
function mockDb(target){let calls=0;return {select(){calls++;const chain={from(){return chain},where(){return chain},limit(){return Promise.resolve(calls===1?[target]:[])}};return chain}}}
const get=()=>new Request('https://test/api/admin/edit-save?accountId=target');
const post=()=>new Request('https://test/api/admin/edit-save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accountId:'target',save:{gold:1},expectedUpdatedAt:'stale'})});
test('save editor permits self and ordinary player reads, protects other GM',async()=>{
 globalThis.__selfAuth={id:'gm',isGm:true};
 for(const [target,status] of [[{id:'gm',isGm:true},200],[{id:'player',isGm:false},200],[{id:'other-gm',isGm:true},403]]){
  globalThis.__selfDb=mockDb(target);assert.equal((await GET(get())).status,status);
 }
});
test('self edits reach version guard; other GM edits are denied before save access',async()=>{
 globalThis.__selfAuth={id:'gm',isGm:true};
 for(const [target,status,error] of [[{id:'gm',isGm:true},409,'save_conflict'],[{id:'player',isGm:false},409,'save_conflict'],[{id:'other-gm',isGm:true},403,'protected_account']]){
  globalThis.__selfDb=mockDb(target);const response=await POST(post());assert.equal(response.status,status);assert.equal((await response.json()).error,error);
 }
});
test('self save endpoints still require authenticated GM',async()=>{
 for(const [auth,status] of [[null,401],[{id:'gm',isGm:false},403]]){
  globalThis.__selfAuth=auth;globalThis.__selfDb=null;
  assert.equal((await GET(get())).status,status);assert.equal((await POST(post())).status,status);
 }
});
