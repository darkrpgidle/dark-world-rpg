export type RealAbility='venomPierce'|'mudPalm'|'miasmaBreath'|'serpentHex'|'mireTail'|'mireTide'|'ironExecution'|'mineScreech'|'ironCharge'|'minerPick'|'rockFist'|'ironWhip'|'boneArrows'|'boneSoldier'|'boneCurse'|'boneBeast'|'boneBurial'|'hound'|'claw'|'curse'|'guard'|'bleed'|'knight'|'charge';
export type RealMonsterRule={name:string;cooldown:number;scale:number;scales?:number[];multiplier?:number;hitAt:number[];duration:number;statusMs?:number};
export const REAL_MONSTER_RULES:Record<RealAbility,RealMonsterRule>={
 venomPierce:{name:'毒卵寄爆',cooldown:4000,scale:1.2,scales:[.4,.8],hitAt:[600,1320],duration:1920,statusMs:3000},
 mudPalm:{name:'爛泥重掌',cooldown:4500,scale:1.7,hitAt:[520],duration:1080},
 miasmaBreath:{name:'瘴影侵身',cooldown:5000,scale:.9,hitAt:[1040],duration:1680,statusMs:3000},
 serpentHex:{name:'雙蟒絞魂',cooldown:4500,scale:.7,hitAt:[1040,1280],duration:1840,statusMs:3000},
 mireTail:{name:'潛沼伏襲',cooldown:5000,scale:2.5,hitAt:[900],duration:1760,statusMs:2000},
 mireTide:{name:'濁息滅境',cooldown:5000,scale:1,scales:[1,1,1,1],hitAt:[1100,1400,1700,2000],duration:2760},
 ironExecution:{name:'黑鐵處刑',cooldown:4500,scale:3,scales:[3,.25,.25,.25,.25],hitAt:[640,820,1000,1180,1360],duration:1500},
 mineScreech:{name:'裂音尖嘯',cooldown:4000,scale:1,hitAt:[280],duration:620,statusMs:3000},
 ironCharge:{name:'鐵殼衝撞',cooldown:4500,scale:1.5,hitAt:[240],duration:640,statusMs:3000},
 minerPick:{name:'碎顱礦鎬',cooldown:4500,scale:1.7,hitAt:[480],duration:820},
 rockFist:{name:'裂礦岩拳',cooldown:5000,scale:1.8,hitAt:[620],duration:1100,statusMs:3000},
 ironWhip:{name:'熔鐵烙印',cooldown:4500,scale:1.6,hitAt:[320],duration:800,statusMs:3000},

 boneArrows:{name:'碎骨連矢',cooldown:4000,scale:.6,hitAt:[180,330,480],duration:780},
 boneSoldier:{name:'斷刃重劈',cooldown:4500,scale:1.6,hitAt:[180],duration:360},
 boneCurse:{name:'枯骨咒印',cooldown:5000,scale:.9,hitAt:[180],duration:360,statusMs:3000},
 boneBeast:{name:'骸震重踏',cooldown:4500,scale:1.8,hitAt:[220],duration:1000,statusMs:2000},
 boneBurial:{name:'骸顎吞天',cooldown:4500,scale:4,hitAt:[620],duration:1320},
 hound:{name:'獵魂撲咬',cooldown:4000,scale:1.4,hitAt:[140],duration:420,statusMs:3000},
 claw:{name:'裂骨撕咬',cooldown:3000,multiplier:1,scale:1.3,hitAt:[180],duration:360},
 curse:{name:'遊魂詛咒',cooldown:4000,scale:.8,hitAt:[360],duration:720,statusMs:3000},
 guard:{name:'墓石重甲',cooldown:4500,scale:1,hitAt:[440],duration:720,statusMs:4000},
 bleed:{name:'腐血爪痕',cooldown:3500,scale:1,hitAt:[130],duration:700,statusMs:3000},
 knight:{name:'亡靈斬',cooldown:4000,scale:1.8,hitAt:[620],duration:1040},
 charge:{name:'亡靈衝鋒',cooldown:4000,scale:1,hitAt:[220,460,700,940,1180],duration:1480}
};

export function realMonsterRule(ability:RealAbility,tier:string):RealMonsterRule{return ability==='ironWhip'&&(tier==='guardian'||tier==='boss')?{...REAL_MONSTER_RULES.ironWhip,hitAt:[520],duration:1100}:REAL_MONSTER_RULES[ability];}
