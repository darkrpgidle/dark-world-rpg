import {balanceConfig} from './balance-config';
import {MAX_REBIRTHS,REBIRTH_REWARD_PER_TURN} from './rebirth-config';
type Save=Record<string,unknown>;
// The receipt and ascension transition are already stored by a server skill
// action. They authorize exactly one legacy progression reset, never client data.
export function finalizePendingRebirth(save:Save,now=Date.now()):Save{
 const count=save.rebirthCount,ascensions=save.skillAscensions as {rebirthCount?:unknown}|undefined;
 if(typeof count!=='number'||!Number.isSafeInteger(count)||count<0||count>=MAX_REBIRTHS||save.level!==100||
   save._lastSkillRebirthLegacyCount!==count||typeof ascensions?.rebirthCount!=='number'||!Number.isSafeInteger(ascensions.rebirthCount)||ascensions.rebirthCount<1||ascensions.rebirthCount>count+1||
   !Number.isSafeInteger((save.mapBestFloors as Record<string,unknown>|undefined)?.['9'])||Number((save.mapBestFloors as Record<string,unknown>|undefined)?.['9'])<30)return save;
 const points=save.rebirthPoints??0;
 if(typeof points!=='number'||!Number.isSafeInteger(points)||points<0||points>Number.MAX_SAFE_INTEGER-REBIRTH_REWARD_PER_TURN.talentPoints)return save;
 const revision=save.adminRevision??0;
 if(typeof revision!=='number'||!Number.isSafeInteger(revision)||revision<0||revision>=Number.MAX_SAFE_INTEGER)return save;
 const next:Save={...save,rebirthCount:count+1,rebirthPoints:points+REBIRTH_REWARD_PER_TURN.talentPoints,
  level:1,exp:0,xpSchemaVersion:2,mapId:1,unlockedMapId:1,wave:1,highestFloor:1,mapBestFloors:{1:1},
  items:[],mails:[],loadouts:{1:[],2:[]},unseenItemIds:[],completedRuns:0,storedSeconds:0,idleSeconds:0,
  enemyHp:100,playerHp:100,battleOn:true,dailyKills:0,dailyRewardClaimed:false,finalBossDefeated:false,
  dailyDate:new Date(now).toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}),lastSeenAt:now,
  combatPower:balanceConfig.character.combatPower.base+balanceConfig.character.combatPower.perLevel,
  adminRevision:revision+1,_lastRebirthRevision:revision+1,_lastIdleClaimId:null,_lastIdleClaimSeconds:0};
 delete next._saveIntegrity;
 return next;
}
