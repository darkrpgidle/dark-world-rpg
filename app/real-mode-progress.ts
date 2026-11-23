import {balanceConfig} from './balance-config';
export type RealModeProgress={version:1;unlocked:boolean;acknowledged:boolean;mode:'normal'|'real';mapId:number;wave:number;unlockedMapId:number;bestFloors:Record<number,number>;completedRuns:number};
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const integer=(v:unknown,min:number,max:number,fallback:number)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max?v:fallback;
export function emptyRealMode(unlocked=false):RealModeProgress{return {version:1,unlocked,acknowledged:false,mode:'normal',mapId:1,wave:1,unlockedMapId:1,bestFloors:{1:0},completedRuns:0};}
export function normalizeRealMode(value:unknown,normalBest:unknown,finalBossDefeated:unknown=false):RealModeProgress{
 const s=object(value),earned=Number(object(normalBest)['9'])>=30&&finalBossDefeated===true,unlocked=s.unlocked===true||earned;
 const max=integer(s.unlockedMapId,1,4,1),best=object(s.bestFloors),bestFloors:Record<number,number>={};
 for(let i=1;i<=4;i++)bestFloors[i]=i<=max?integer(best[String(i)],0,30,0):0;
 return {version:1,unlocked,acknowledged:unlocked&&s.acknowledged===true,mode:unlocked&&s.acknowledged===true&&s.mode==='real'?'real':'normal',mapId:integer(s.mapId,1,max,1),wave:integer(s.wave,1,30,1),unlockedMapId:max,bestFloors,completedRuns:integer(s.completedRuns,0,Number.MAX_SAFE_INTEGER,0)};
}
export function invalidRealMode(value:unknown):boolean{
 const s=object(value);if(s.version!==1||typeof s.unlocked!=='boolean'||typeof s.acknowledged!=='boolean'||!['normal','real'].includes(String(s.mode)))return true;
 if(integer(s.mapId,1,4,0)===0||integer(s.wave,1,30,0)===0||integer(s.unlockedMapId,1,4,0)===0||integer(s.completedRuns,0,Number.MAX_SAFE_INTEGER,-1)<0)return true;
 if(!s.bestFloors||typeof s.bestFloors!=='object'||Array.isArray(s.bestFloors))return true;
 return Object.entries(object(s.bestFloors)).some(([k,v])=>!['1','2','3','4'].includes(k)||integer(v,0,30,-1)<0);
}
export function realModeScale(chapter:number,floor:number,tier:'normal'|'elite'|'guardian'|'boss'){
 const c=balanceConfig.realMode.chapters[Math.max(0,Math.min(3,Math.floor(chapter)-1))],growth=(1+Math.max(0,Math.min(29,floor-1))*balanceConfig.realMode.floorGrowth)*balanceConfig.realMode.tier[tier];
 return {health:c.health*growth,attack:c.attack*growth,defense:c.defense*growth,power:c.power*growth,reward:c.reward};
}
export function validateRealModeTransition(incoming:Record<string,unknown>,server:Record<string,unknown>,reborn=false):RealModeProgress{
 const previous=normalizeRealMode(server.realMode,server.mapBestFloors,server.finalBossDefeated),raw=incoming.realMode;
 if(reborn)return {...emptyRealMode(previous.unlocked),acknowledged:previous.acknowledged};
 if(raw===undefined)return {...previous,mode:'normal'};
 if(invalidRealMode(raw))throw Error('invalid_real_mode');
 const r=raw as RealModeProgress,earned=previous.unlocked||Number(object(incoming.mapBestFloors)['9'])>=30&&incoming.finalBossDefeated===true;
 if(r.unlocked&&!earned||r.mode==='real'&&(!earned||!r.acknowledged)||r.acknowledged&&!earned)throw Error('unearned_real_mode');
 if(previous.unlocked&&!r.unlocked||previous.acknowledged&&!r.acknowledged)throw Error('real_mode_regression');
 if(r.unlockedMapId<previous.unlockedMapId||r.unlockedMapId>Math.min(4,previous.unlockedMapId+1)||r.mapId>r.unlockedMapId)throw Error('real_map_unlock_jump');
 if(r.unlockedMapId>previous.unlockedMapId&&Number(r.bestFloors[previous.unlockedMapId]??0)<30)throw Error('unearned_real_map_unlock');
 if(!earned&&(r.unlockedMapId!==1||r.wave!==1||r.completedRuns>0||Object.values(r.bestFloors).some(v=>v>0)))throw Error('locked_real_progress');
 for(let i=1;i<=4;i++){const n=r.bestFloors[i]??0;if(n<(previous.bestFloors[i]??0)||i>r.unlockedMapId&&n>0)throw Error('invalid_real_best_floor');}
 if(r.completedRuns<previous.completedRuns)throw Error('real_runs_regression');
 return normalizeRealMode({...r,unlocked:earned},incoming.mapBestFloors,incoming.finalBossDefeated);
}
