// Formula-level calibration only. No account, save, reward, or database writes.
import {registerHooks, stripTypeScriptTypes} from 'node:module';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[cm]?[jt]sx?$/.test(s)?`${s}.ts`:s,c);}});
const balance=await import('../app/balance.ts');
const {balanceConfig}=await import('../app/balance-config.ts');
const {maps}=await import('../app/game-data.ts');
const {calculateCharacterStats,calculateAssessedCombatPower,emptyAssessmentTalents}=await import('../app/character-power.ts');
const {rollAffixes,canonicalAffixes}=await import('../app/equipment-affixes.ts');
const {equippedSetAttackMultiplier:setAttackMultiplier}=await import('../app/set-bonuses.ts');
const equippedSetAttackMultiplier=gear=>setAttackMultiplier(gear,.1);
const {upgradeSkill,equipActiveSkill,isValidSkillBuild}=await import('../app/skill-rework.ts');
const {createSkillAscensions}=await import('../app/skill-ascensions.ts');
const {warriorPassiveDefenses}=await import('../app/skill-warrior-passives.ts');
const {rangerPassiveStats}=await import('../app/skill-ranger-passives.ts');
const live=await import('../app/skill-live-combat.ts');
const {settleCombatHealth}=await import('../app/skill-health-settlement.ts');
const {TITAN_RIFT_DURATION_MS,TITAN_RIFT_FRAME_STARTS_MS}=await import('../app/titan-rift-timing.ts');
const {SKY_RAIN_DURATION_MS}=await import('../app/sky-queen-rain-timing.ts');
const {ASTRAL_TIMING}=await import('../app/astral-annihilation-frames.ts');
const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
function pageFunction(name,dependencies){
  const start=page.indexOf(`function ${name}(`),end=page.indexOf('\n}\n',start)+2;
  if(start<0||end<start)throw new Error(`Missing ${name}`);
  const js=stripTypeScriptTypes(page.slice(start,end));
  return Function(...Object.keys(dependencies),`${js}\nreturn ${name};`)(...Object.values(dependencies));
}
// Extract the actual client functions, avoiding a second implementation.
const legacyPower=pageFunction('calculateCombatPower',{calculateCharacterStats,equippedSetAttackMultiplier,balanceConfig});
const floorPower=pageFunction('recommendedPowerAtFloor',{balanceConfig,MAP_FLOORS:30,...balance});
const monsterMaximumHealth=pageFunction('monsterMaximumHealth',{balanceConfig,...balance});
const monsterCombatHealthMultiplier=pageFunction('monsterCombatHealthMultiplier',{balanceConfig});
const maximumEnemyHealth=pageFunction('effectiveMonsterMaximumHealth',{balanceConfig,monsterMaximumHealth,monsterCombatHealthMultiplier,...balance});
export function seededRandom(seed){let state=seed>>>0;return()=>((state=(Math.imul(1664525,state)+1013904223)>>>0)/4294967296);}
const layouts={
  戰士:['裂地斬','血刃斬','不屈戰意','泰坦斷界斬','鐵骨','血氣汲取','裂傷本能','堅盾反射','破鎧追擊','重刃專精'],
  遊俠:['穿雲箭','追風箭','疾風連射','蒼穹箭雨','迅捷手感','鷹眼','精準連射','破綻獵手','影步反射','狩獵節奏'],
  法師:['霜火新星','閃電鏈','魔力護盾','星界寂滅','奧術感知','焰脈','星界護體','精密咒式','護盾轉流','餘燼回響'],
};
const slots=['武器','頭盔','胸甲','手套','鞋子','項鍊','戒指','腰帶','護腕','披風'];
export function createCalibrationFixture({mapId,cls,level,quality='傳奇',enhance=0,gearMapId=mapId,affixSeed=0,gemTier=null}){
  let build={ranks:{},activeSlots:[null,null,null]};
  for(let rank=0;rank<5;rank++)for(const name of layouts[cls])build=upgradeSkill(build,cls,level,name)??build;
  for(let i=0;i<3;i++)build=equipActiveSkill(build,cls,level,i,layouts[cls][i])??build;
  if(!isValidSkillBuild(build,cls,level))throw new Error('Illegal sample build');
  const random=seededRandom(affixSeed),oldRandom=Math.random;
  const gear=slots.map((slot,i)=>{
    const item={id:i+1,name:`${maps[gearMapId-1].set}${slot}`,slot,quality,enhance,mapId:gearMapId,power:balance.dropPowerRange(gearMapId,['普通','良好','優秀','史詩','傳奇'].indexOf(quality)).minimum,
      set:maps[gearMapId-1].set,affixSchemaVersion:7,affixes:[],equipmentType:'場景普通裝備',
      sockets:{socketCount:gemTier?1:0,gems:gemTier?[{gemId:i<5?'redIron':'blooddrop',tier:gemTier}]:[]}};
    if(affixSeed){try{Math.random=random;item.affixes=rollAffixes(item);}finally{Math.random=oldRandom;}}
    item.affixes=canonicalAffixes(item);
    return item;
  });
  const base=calculateCharacterStats(cls,level,gear,[]),ranger=cls==='遊俠'?rangerPassiveStats(build):null;
  const stats={...base,attack:Math.round(base.attack*equippedSetAttackMultiplier(gear)),
    defense:base.defense+(cls==='戰士'?warriorPassiveDefenses(build,100).defenseBonusFlat:0),
    speed:base.speed*(1+(ranger?.attackSpeedBonusPercent??0)/100),crit:base.crit+(ranger?.criticalChancePoints??0)};
  const ascensions=createSkillAscensions();
  return {mapId,cls,level,quality,enhance,gearMapId,affixSeed,gemTier,gear,build,stats,ascensions,
    legacyPower:legacyPower(cls,level,gear,[]),
    score:calculateAssessedCombatPower(cls,level,gear,[],build,ascensions,{hp:0,attack:0,defense:0},
      {attack:0,defense:0},emptyAssessmentTalents,0,{hit:0,dodge:0})};
}
export function sampleMapEncounter(fixture,{floor=30,profileIndex=4,seed=1,suppressionPower=fixture.legacyPower,limitMs=90000,combatValues=balance.towerCombatValues}={}){
  const {mapId,cls,level,stats,gear,build,ascensions}=fixture,map=maps[mapId-1],name=map.monsters[profileIndex];
  const tier=floor===30?'boss':floor%10===0?'guardian':floor%5===0?'elite':'normal';
  const required=floorPower(map,floor),maxEnemy=maximumEnemyHealth(mapId,required,tier,name);
  const combat=live.syncLiveCombat(null,'map-calibration',name,build,cls,level,ascensions),roll=seededRandom(seed);
  const ratings=balance.monsterRatingsForMap(mapId),suppression=balance.realmSuppression(suppressionPower,required);
  const hitChance=Math.max(5,balance.hitChanceFromRatings(stats.hit,ratings.evasion)-suppression.hitBonus);
  const dodgeChance=balance.evadeChanceFromRatings(ratings.accuracy,stats.dodge*balanceConfig.combat.evasionModel.statToRating);
  let player=100,enemy=100,playerClock=0,enemyClock=0,lockUntil=0,now=0,attacks=0;
  let dealt=0,received=0;
  const parameters={combatPower:suppressionPower,recommendedPower:required,mapId,localFloor:floor,tier,
    attacks:1,skillTriggered:false,setTier:10,monsterName:name,playerDefense:stats.defense,playerAttack:stats.attack,
    bossReduction:stats.bossReduction,lowHealthReduction:stats.lowHealthReduction,firstChapterTuning:true,secondChapterTuning:mapId===2};
  function applyDamage(raw){const result=settleCombatHealth(enemy,maxEnemy,Math.max(0,raw));enemy=result.remainingPercent;dealt+=result.actualDamage;return result.actualDamage;}
  while(now<limitMs&&player>0&&enemy>0){
    now+=50;if(now<lockUntil)continue;
    for(const tick of live.advanceLiveCombat(combat,now))applyDamage(tick);
    if(enemy<=0)break;
    playerClock+=50;enemyClock+=50;
    const playerInterval=100000/Math.max(1,stats.speed*(1+live.liveCombatSpeedBonus(combat)/100));
    const control=live.liveEnemyControl(combat,now);
    const baseline=combatValues({...parameters,lowHealth:player<=35});
    const enemyInterval=100000/Math.max(1,baseline.monsterAttackSpeed*control.speedMultiplier);
    const playerActs=playerClock>=playerInterval;
    let enemyActs=!control.frozen&&enemyClock>=enemyInterval;
    if(control.frozen)enemyClock=0;
    if(enemyActs)enemyClock%=enemyInterval;
    if(playerActs){
      playerClock%=playerInterval;attacks++;
      const action=live.resolveLiveCombatAttack(combat,{now,healthPercent:player,attack:stats.attack,hitChance,
        criticalChance:stats.crit,criticalDamage:stats.critDamage,equippedItems:gear,roll});
      if(live.liveEnemyControl(combat,now).frozen){enemyActs=false;enemyClock=0;}
      const values=combatValues({...parameters,lowHealth:player<=35,
        skillTriggered:!!action.name,skillMultiplier:action.damagePercent/100,defenseIgnore:action.defenseIgnore,
        skillDamage:stats.skillDamage+20,bossDamage:stats.bossDamage,lowHealthDamage:stats.lowHealthDamage});
      const direct=action.damagePercent>0?values.playerDamage:0;
      const damage=Math.round(direct)
        +Math.round(direct*.15)+(attacks%10===0?Math.round(direct*2):0);
      const actual=applyDamage(damage);
      for(const tick of action.ticks)applyDamage(tick.damage);
      const leech=Math.min(100,stats.lifesteal+action.lifestealPercent);
      if(actual>0&&leech>0)player=Math.min(100,player+balance.healthPercentFromDamage(actual*leech/100,stats.hp));
      const duration=action.name==='泰坦斷界斬'?(action.hits.some(h=>h.hit)?TITAN_RIFT_DURATION_MS:TITAN_RIFT_FRAME_STARTS_MS[11]+300)
        :action.name==='蒼穹箭雨'?SKY_RAIN_DURATION_MS:action.name==='星界寂滅'?ASTRAL_TIMING.duration:0;
      if(duration){lockUntil=now+duration;if(action.name!=='泰坦斷界斬'&&enemyActs){enemyActs=false;enemyClock+=enemyInterval;}}
    }
    if(enemy<=0)break;
    if(enemyActs){
      const damage=Math.max(1,Math.round(baseline.monsterDamage*(1-Math.min(80,stats.damageReduction)/100)));
      const defense=live.resolveLiveEnemyAttack(combat,{healthPercent:player,maxHealth:stats.hp,damage,
        baseDodgeChance:dodgeChance,defense:stats.defense,equippedItems:gear,roll});
      const result=settleCombatHealth(player,stats.hp,defense.damage);player=result.remainingPercent;received+=result.actualDamage;
      if(defense.counterDamagePercent>0)applyDamage(stats.attack*defense.counterDamagePercent/100);
    }
  }
  return {won:enemy<=0,seconds:now/1000,hp:player,enemyHp:enemy,dealt,received,
    suppression:suppression.tier,legacyRatio:suppression.ratio,score:fixture.score};
}
export function evaluateFixture(fixture,{floors=[30],trials=20,limitSeconds=60}={}){
  const results=[];
  for(const floor of floors)for(let trial=0;trial<trials;trial++)results.push(sampleMapEncounter(fixture,
    {floor,profileIndex:floor%5===0?4:trial%5,seed:20261007+trial*100003+floor*101}));
  return {wins:results.filter(r=>r.won).length,trials:results.length,
    winRate:results.filter(r=>r.won).length/results.length,
    timelyWinRate:results.filter(r=>r.won&&r.seconds<=limitSeconds).length/results.length,
    averageSeconds:results.reduce((s,r)=>s+r.seconds,0)/results.length,
    averageHp:results.reduce((s,r)=>s+r.hp,0)/results.length,
    suppression:[...new Set(results.map(r=>r.suppression))],
    byFloor:floors.map((floor,i)=>{const group=results.slice(i*trials,(i+1)*trials);return {floor,winRate:group.filter(r=>r.won).length/trials,timelyWinRate:group.filter(r=>r.won&&r.seconds<=limitSeconds).length/trials,averageSeconds:group.reduce((s,r)=>s+r.seconds,0)/trials};})};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const mapIds=process.argv.slice(2).map(Number);if(!mapIds.length)mapIds.push(...maps.map(m=>m.id));
  for(const mapId of mapIds){
    const map=maps[mapId-1],classResults=[];
    for(const cls of ['戰士','遊俠','法師']){
      const candidates=[];
      for(const level of [...new Set([map.level,Math.min(100,map.level+5),Math.min(100,map.level+10),Math.min(100,map.level+20)])])
        for(const gearMapId of [...new Set([Math.max(1,mapId-1),mapId])])
        for(const quality of ['普通','良好','優秀','史詩','傳奇'])for(const enhance of [0,5,8,10,12,15])
          for(const gemTier of [null,'intermediate','advanced'])for(const affixSeed of [0,773+mapId*101,2026+mapId*101]){
            const fixture=createCalibrationFixture({mapId,cls,level,quality,enhance,gemTier,affixSeed,gearMapId});
            candidates.push(fixture);
          }
      const seen=new Set();candidates.sort((a,b)=>a.score-b.score);
      const unique=candidates.filter(f=>{const key=JSON.stringify([f.level,f.stats,f.gear.map(g=>g.affixes)]);if(seen.has(key))return false;seen.add(key);return true;});
      const stable=(f,floors)=>evaluateFixture(f,{floors,trials:10}).byFloor.every(r=>r.timelyWinRate>=.9)
        &&evaluateFixture(f,{floors,trials:30}).byFloor.every(r=>r.timelyWinRate>=.9);
      const entry=unique.find(f=>stable(f,[1,9,10]));
      const clear=unique.find(f=>stable(f,[20,29,30]));
      const describe=(f,floors)=>f?{...Object.fromEntries(['mapId','cls','level','quality','enhance','gearMapId','affixSeed','gemTier','score','legacyPower'].map(k=>[k,f[k]])),result:evaluateFixture(f,{floors,trials:30})}:null;
      classResults.push({cls,entry:describe(entry,[1,9,10]),clear:describe(clear,[20,29,30])});
    }
    console.log(JSON.stringify({mapId,name:map.name,classResults}));
  }
}
