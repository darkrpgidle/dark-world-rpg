import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
registerHooks({resolve(s,c,next){return next(s.startsWith('./')&&!s.endsWith('.ts')?s+'.ts':s,c);}});
const {assessedRankingPower}=await import('../app/ranking-power.ts');
const {saveDisplay}=await import('../app/save-field-schema.ts');
const {calculateAssessedCombatPower,normalizeSceneItem,emptyAssessmentTalents}=await import('../app/character-power.ts');
const {restoreSkillBuild}=await import('../app/skill-rework.ts');
const {restoreSkillAscensions}=await import('../app/skill-ascensions.ts');
const {equippedCosmeticBonuses}=await import('../app/cosmetic-bonuses.ts');
const gear={id:1,name:'時墟手套',slot:'手套',quality:'傳奇',enhance:10,power:2000,mapId:9,set:'',affixes:['攻速 +10%','攻擊% +10%'],sockets:{socketCount:1,gems:[{gemId:'thunderlight',tier:'advanced'}]},prefixId:'lightning'};
const naked={level:100,items:[],loadouts:{1:[],2:[]},combatPower:999999};
test('offline snapshot score equals panel for all three classes including equipped stats, skills, ascensions and rebirth',()=>{
 for(const [cls,build] of [['戰士',{ranks:{鐵骨:5,血刃斬:5},activeSlots:['血刃斬',null,null]}],['遊俠',{ranks:{迅捷手感:5,穿雲箭:5},activeSlots:['穿雲箭',null,null]}],['法師',{ranks:{閃電鏈:5},activeSlots:['閃電鏈',null,null]}]]){
 const talents={...emptyAssessmentTalents,combatCritRate:3,survivalHp:2,combatAttackSpeed:2,growthSkill:1};
 const save={...naked,playerClass:cls,items:[gear],loadouts:{1:[1],2:[]},rebirthCount:3,rebirthTalents:talents,skillReworkBuild:build,selectedTitle:'abyss-reincarnator',ownedTitles:['abyss-reincarnator'],legacyRebirthCount:10,selectedAppearance:'abyss-aura'};
 const snapshot=JSON.stringify(save),cosmetics=equippedCosmeticBonuses(save.selectedTitle,save.selectedAppearance);
 const panel=calculateAssessedCombatPower(cls,100,[normalizeSceneItem(gear)],[],restoreSkillBuild(build,cls,100),restoreSkillAscensions(undefined,cls),{hp:35,attack:15,defense:15},{attack:25,defense:20},talents,12,cosmetics);
 assert.equal(assessedRankingPower(save),panel,cls);assert.equal(JSON.stringify(save),snapshot);
 }
});
test('stored legacy power is ignored and only the active legal loadout contributes',()=>{
 const save={...naked,playerClass:'遊俠',items:[gear],loadouts:{1:[1],2:[]}};
 assert.equal(assessedRankingPower({...save,combatPower:1}),assessedRankingPower(save));
 assert.ok(assessedRankingPower(save)>assessedRankingPower({...save,activeLoadout:2}));
 assert.equal(assessedRankingPower({...save,activeLoadout:2}),assessedRankingPower({...naked,playerClass:'遊俠'}));
 assert.ok(Number.isFinite(assessedRankingPower({level:'bad',items:[null],rebirthTalents:{combatAttackSpeed:'bad'}})));
});
test('ranking GET reassesses every offline save before slicing and both boards use the same score without exposing saves',async()=>{
 const source=readFileSync(new URL('../app/api/ranking/route.ts',import.meta.url),'utf8');
 const body=ts.transpileModule(source.slice(source.indexOf('export async function GET()')).replace('export async','async'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const saves=[{accountId:'gm',payload:JSON.stringify({...naked,playerName:'管理員'})},...Array.from({length:105},(_,i)=>({accountId:'u'+i,payload:JSON.stringify({...naked,playerName:'玩家'+i,playerClass:'遊俠',level:1+i%100,combatPower:105-i,dailyDate:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}),worldBossResetVersion:'2026-09-14-60s',worldDamage:i+1})}))];
 let count=0;
 const getDb=async()=>({select(fields){return {from(){return fields?{where:async()=>[{id:'gm'}]}:Promise.resolve(saves);}};}});
 const get=Function('getDb','accounts','gameSaves','eq','saveDisplay','assessedRankingPower','WORLD_BOSS_RESET_VERSION','settleWorldBoss','worldBossRanking',body+';return GET;')(getDb,{id:1,isGm:2},{},()=>{},saveDisplay,s=>{count++;return assessedRankingPower(s);},'2026-09-14-60s',async()=>{},async()=>saves.slice(1).reverse().slice(0,100).map(r=>({account_id:r.accountId,damage:JSON.parse(r.payload).worldDamage,snapshot:r.payload})));
 const response=await get(),data=await response.json();
 assert.equal(count,105);assert.equal(data.ranks.length,100);assert.equal(data.worldRanks.length,100);assert.equal(response.headers.get('Cache-Control'),'no-store');
 for(const entry of [...data.ranks,...data.worldRanks]){assert.notEqual(entry.name,'管理員');const save=JSON.parse(saves.find(s=>JSON.parse(s.payload).playerName===entry.name).payload);assert.equal(entry.power,assessedRankingPower(save));assert.equal(entry.items,undefined);assert.equal(entry.accountId,undefined);assert.equal(entry.skillReworkBuild,undefined);}
});
