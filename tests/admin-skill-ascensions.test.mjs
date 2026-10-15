import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[cm]?[jt]sx?$/.test(s)?`${s}.ts`:s,c)}});
const {normalizeAdminAscensions:normalize}=await import('../app/admin-skill-ascensions.ts');
const {ascensionOptions,isValidSkillAscensions,selectSkillAscension,confirmSkillAscensions}=await import('../app/skill-ascensions.ts');
for(const cls of ['戰士','遊俠','法師'])test(`${cls}: GM direct rebirth edit opens selectable stages and fixes older mismatched counts`,()=>{
 for(let count=0;count<=5;count++){
  let state=normalize({rebirthCount:0,choices:[null,null,null,null,null],selectionOpen:false},cls,count);
  assert.equal(state.rebirthCount,count);assert.equal(isValidSkillAscensions(state,cls),true);
  assert.equal(state.selectionOpen,count>0);
  for(let tier=1;tier<=Math.min(count,4);tier++){
   const choice=ascensionOptions(cls,tier).find(name=>tier!==3||name!==state.choices[1]);
   state=selectSkillAscension(state,cls,tier,choice);assert.ok(state);
  }
  if(count>0){assert.ok(confirmSkillAscensions(state,cls));assert.equal(normalize(state,cls,count).selectionOpen,false)}
  if(count===5)assert.equal(state.choices[4],ascensionOptions(cls,5)[0]);
 }
});
test('lowering GM rebirth trims stages and retains valid lower choices',()=>{
 const state=normalize({choices:[ascensionOptions('戰士',1)[0],ascensionOptions('戰士',2)[0],null,null,null]},'戰士',5);
 const down=normalize(state,'戰士',1);assert.deepEqual(down.choices,[state.choices[0],null,null,null,null]);assert.equal(down.selectionOpen,false);
 assert.deepEqual(normalize(state,'戰士',0),{rebirthCount:0,choices:[null,null,null,null,null],selectionOpen:false});
});
test('duplicate, invalid, cross-class choices are cleared; old mage choice migrates',()=>{
 const same=ascensionOptions('戰士',2)[0];const state=normalize({choices:['invalid',same,same,'invalid','invalid']},'戰士',5);
 assert.equal(state.choices[0],null);assert.equal(state.choices[2],null);assert.ok(isValidSkillAscensions(state,'戰士'));
 assert.equal(normalize(state,'法師',5).choices[1],null);
 assert.equal(normalize({choices:['奧術飛彈']},'法師',1).choices[0],'閃電鏈');
});
