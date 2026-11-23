import {maps} from './game-data';
import {realMonsterRule,type RealAbility} from './real-monster-rules';
export type RealHit={ability:RealAbility;index:number;scale:number;label:string;dot?:boolean;defenseIgnore?:number};
export type RealHitResult={landed:boolean;damage:number};
export type RealPending={castId:string;ability:RealAbility;tier:string;start:number;endsAt:number;pauseMs:number;cursor:number;hitAt:number[];hits:RealHitResult[]};
type Dot={next:number;remaining:number;ability:RealAbility;label:string;serial:number};
export type RealMonster={identity:string;ability:RealAbility;tier:string;floor:number;clock:number;nextSkillAt:number;serial:number;bossIndex:number;bloodShieldUsed?:boolean;pending:RealPending|null;armorUntil:number;slowUntil:number;hasteUntil:number;shellUntil:number;fractureUntil:number;weakenUntil:number;poisonUntil:number;poisonVisualUntil:number;brandUntil:number;brandVisualUntil:number;slowAbility:string;fractureAbility:string;serpentGrip:{start:number;mask:number}|null;bleed:Dot[];poison:Dot|null;burn:Dot|null};
const abilities:RealAbility[][]=[['claw','curse','guard','bleed','knight'],['boneArrows','hound','boneSoldier','boneCurse','boneBeast'],['mineScreech','ironCharge','minerPick','rockFist','ironWhip'],['venomPierce','mudPalm','miasmaBreath','serpentHex','mireTail']];
export function realAbilityFor(chapter:number,name:string):RealAbility|null{
 const map=maps[chapter-1],index=(map?.monsters as readonly string[]|undefined)?.indexOf(name.replace(/・.*$/,''));return index!==undefined&&index>=0?abilities[chapter-1]?.[index]??null:null;
}
export function createRealMonster(identity:string,ability:RealAbility,tier:string,floor:number):RealMonster{
 return {identity,ability,tier,floor,clock:0,nextSkillAt:Math.min(1500,realMonsterRule(ability,tier).cooldown),serial:0,bossIndex:0,pending:null,armorUntil:0,slowUntil:0,hasteUntil:0,shellUntil:0,fractureUntil:0,weakenUntil:0,poisonUntil:0,poisonVisualUntil:0,brandUntil:0,brandVisualUntil:0,slowAbility:'curse',fractureAbility:'boneCurse',serpentGrip:null,bleed:[],poison:null,burn:null};
}
export function realMonsterModifiers(s:RealMonster|null){
 const at=s?.clock??0;return {attack:s&&s.weakenUntil>at?.85:1,defense:s&&s.fractureUntil>at?.8:1,speed:s&&s.slowUntil>at?.8:1,enemySpeed:s&&s.hasteUntil>at?1.2:1,incomingEnemy:s&&s.armorUntil>at?.70:s&&s.shellUntil>at?.75:1};
}
export function realMonsterSnapshot(s:RealMonster,running=true){return {...s,id:s.identity,running,phase:'active',pending:s.pending?{...s.pending,hitAt:[...s.pending.hitAt],hits:s.pending.hits.map(h=>({...h}))}:null,bleedUntil:Math.max(0,...s.bleed.map(d=>d.next+(d.remaining-1)*1000))};}
export type RealMonsterCallbacks={hit:(request:RealHit,id:string)=>RealHitResult;alive:()=>boolean;heal:(attackFraction:number)=>void;notify:(type:string,detail:Record<string,unknown>)=>void};
export function advanceRealMonster(s:RealMonster,ms:number,frozen:boolean,c:RealMonsterCallbacks){
 if(!c.alive())return;
 const delta=Math.max(0,Math.min(250,ms));s.clock+=delta;
 for(const dot of [...s.bleed,...(s.poison?[s.poison]:[]),...(s.burn?[s.burn]:[])]){
  while(dot.remaining>0&&s.clock>=dot.next&&c.alive()){
   const tick=dot.next;dot.next+=1000;dot.remaining--;
   const result=c.hit({ability:dot.ability,index:3-dot.remaining,scale:.2,label:dot.label,dot:true},`${s.identity}:dot:${dot.serial}:${tick}`);
   if(dot.ability==='venomPierce')c.notify('dark-world-monster-poison-tick',{identity:s.identity,damage:result.damage,at:s.clock});
  }
 }
 s.bleed=s.bleed.filter(d=>d.remaining>0);if(s.poison?.remaining===0)s.poison=null;if(s.burn?.remaining===0)s.burn=null;
 if(!c.alive())return;
 if(frozen&&s.pending){s.pending.pauseMs+=delta;s.pending.endsAt+=delta;}
 if(!frozen&&!s.pending&&s.clock>=s.nextSkillAt){
  let ability=s.ability;
  if(s.floor===30&&s.tier==='boss'){
   const extra:Partial<Record<RealAbility,RealAbility>>={knight:'charge',boneBeast:'boneBurial',ironWhip:'ironExecution',mireTail:'mireTide'};
   if(extra[ability]){if(s.bossIndex++%2)ability=extra[ability]!;}
  }
  const rule=realMonsterRule(ability,s.tier),serial=++s.serial;
  s.pending={castId:`${s.identity}:skill:${serial}`,ability,tier:s.tier,start:s.clock,endsAt:s.clock+rule.duration,pauseMs:0,cursor:0,hitAt:[...rule.hitAt],hits:[]};
  s.nextSkillAt=s.clock+rule.cooldown;
  if(ability==='ironCharge')s.shellUntil=s.clock+3000;
  if(ability==='serpentHex')s.serpentGrip={start:s.clock,mask:0};
  c.notify('dark-world-monster-cast',{...s.pending,identity:s.identity});
 }
 const p=s.pending;
 if(p&&!frozen){const rule=realMonsterRule(p.ability,s.tier);
  while(p.cursor<p.hitAt.length&&s.clock>=p.start+p.pauseMs+p.hitAt[p.cursor]&&c.alive()){
   const index=p.cursor++,ability=p.ability;
   const label=ability==='venomPierce'?(index===0?'毒卵附著':'毒卵爆裂'):ability==='ironExecution'&&index>0?'處刑餘波':rule.name;
   const result=c.hit({ability,index,label,scale:rule.scales?.[index]??rule.scale,defenseIgnore:['boneSoldier','minerPick','mudPalm'].includes(ability)?.25:0},`${p.castId}:hit:${index}`);
   p.hits[index]=result;
   if(c.alive()){
    if(ability==='guard')s.armorUntil=s.clock+4000;
    if(ability==='hound')s.hasteUntil=s.clock+3000;
    if(result.landed){
     if(['curse','boneBeast','mineScreech','mireTail'].includes(ability)){s.slowUntil=s.clock+(rule.statusMs??3000);s.slowAbility=ability;}
     if(['boneCurse','rockFist','serpentHex'].includes(ability)){s.fractureUntil=s.clock+3000;s.fractureAbility=ability;if(ability==='serpentHex'){s.serpentGrip??={start:p.start+p.pauseMs,mask:0};s.serpentGrip.start=p.start+p.pauseMs;s.serpentGrip.mask|=1<<index;}}
     if(ability==='miasmaBreath')s.weakenUntil=s.clock+3000;
     if(ability==='venomPierce'&&index===1){s.poisonUntil=s.clock+3000;s.poisonVisualUntil=s.poisonUntil+400;s.poison={next:s.clock+1000,remaining:3,ability,label:'毒卵中毒',serial:s.serial};}
     if(ability==='bleed')s.bleed=[{next:s.clock+1000,remaining:3,ability,label:'流血',serial:s.serial}];
     if(ability==='ironWhip'){s.brandUntil=s.clock+3000;s.brandVisualUntil=s.brandUntil+(['guardian','boss'].includes(s.tier)?400:0);s.burn={next:s.clock+1000,remaining:3,ability,label:'烙印灼燒',serial:s.serial};}
     if(ability==='mireTail')c.heal(.30);
    }
   }
   c.notify('dark-world-monster-hit',{...result,identity:s.identity,castId:p.castId,ability,tier:s.tier,index,at:s.clock});
  }
  if(s.clock>=p.endsAt||!c.alive())s.pending=null;
 }
 if(c.alive())c.notify('dark-world-monster-state',realMonsterSnapshot(s));
}
