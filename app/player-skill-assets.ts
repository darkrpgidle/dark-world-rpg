import {createChapterAssetCache} from './real-monster-assets';
import {FROSTFIRE_ART} from './frostfire-nova-frames';
import {LIGHTNING_ART} from './lightning-chain-frames';
import {MANA_SHIELD_ART} from './mana-shield-frames';
import {ELEMENT_SIGIL_ART} from './element-sigil-frames';
import {METEOR_ART} from './meteor-strike-frames';
import {OVERLOAD_ART} from './arcane-overload-frames';
import {VOID_ART,VOID_ASCENDED_PAGES} from './void-collapse-frames';
import {ASTRAL_PAGES,ASTRAL_STAR_ART} from './astral-annihilation-frames';
import {TITAN_HD_ART} from './titan-rift-frames';
import {ASCENDED_STANCE_ART} from './berserker-stance-frames';
const flatten=(value:unknown):string[]=>typeof value==='string'?[value]:Array.isArray(value)?value.flatMap(flatten):value&&typeof value==='object'?Object.values(value).flatMap(flatten):[];
export const PLAYER_SKILL_ASSETS:Record<string,string[]>={
 '戰士':[
  '/vfx/ground-split-v3/main.webp','/vfx/ground-split-v3/shock.webp','/vfx/blood-blade/frame-sheet.webp','/vfx/unyielding-will/frame-sheet.webp',
  ...['cast','mark','ascension'].map(n=>`/vfx/blood-brand/${n}.webp`),
  ...['normal','ascended','slash','return'].map(n=>`/vfx/blood-roar-v2/${n}.webp`),
  '/vfx/berserker-stance-v2/normal-state.webp','/vfx/berserker-stance-v2/normal-attack.webp',...flatten(ASCENDED_STANCE_ART),
  '/vfx/armor-smash-v2/normal.webp','/vfx/armor-smash-v2/ascended.webp',...flatten(TITAN_HD_ART),
 ],
 '遊俠':[
  '/vfx/piercing-arrow-v3/frames.webp','/vfx/piercing-arrow-v3/ascended.webp','/vfx/tailwind-arrow/charge.webp','/vfx/tailwind-arrow-v3/frames.webp','/vfx/tailwind-arrow-v3/ascended.webp',
  '/vfx/phantom-step/wind.webp','/vfx/hunter-mark-v2/frames.webp','/vfx/wind-volley-v2/arrows.webp','/vfx/wind-volley-v2/sixth.webp','/vfx/wind-domain-v3/aura.webp',
  '/vfx/starbreak-snipe-v3/atlas.webp','/vfx/starbreak-snipe/recovery.webp',
  '/vfx/sky-queen-rain-v2/queen.webp','/vfx/sky-queen-rain-v2/impacts.webp','/vfx/sky-queen-rain-v4/summoning.webp','/vfx/sky-queen-rain-v5/water.webp','/vfx/sky-queen-rain-v6/arrows.webp','/vfx/sky-queen-rain-v7/cannon.webp',
  ...['normal','ascended'].flatMap(n=>[`/vfx/sky-queen-rain-v5/array-${n}.webp`,`/vfx/sky-queen-rain-v6/hit-${n}.webp`]),
 ],
 '法師':flatten([FROSTFIRE_ART,LIGHTNING_ART,MANA_SHIELD_ART,ELEMENT_SIGIL_ART,METEOR_ART,OVERLOAD_ART,VOID_ART,VOID_ASCENDED_PAGES,ASTRAL_PAGES,ASTRAL_STAR_ART]),
};
export const playerSkillClassKey=(name:string)=>['戰士','遊俠','法師'].indexOf(name);
export const playerSkillAssets=createChapterAssetCache<Map<string,HTMLImageElement>>(async(key,progress,signal)=>{
 if(!Number.isInteger(key)||key<0||key>2)throw Error('Invalid character class');
 const paths=[...new Set(PLAYER_SKILL_ASSETS[['戰士','遊俠','法師'][key]]??[])],images=new Map<string,HTMLImageElement>();
 let done=0;progress({done,total:paths.length});
 for(const path of paths){
  if(signal.aborted)throw new DOMException('Aborted','AbortError');
  const image=new Image();image.src=path;
  let abort:(()=>void)|undefined;
  try{await Promise.race([image.decode(),new Promise<never>((_,reject)=>{abort=()=>{image.src='';reject(new DOMException('Aborted','AbortError'));};signal.addEventListener('abort',abort,{once:true});})]);}
  finally{if(abort)signal.removeEventListener('abort',abort);}
  if(signal.aborted)throw new DOMException('Aborted','AbortError');
  images.set(path,image);progress({done:++done,total:paths.length});
 }
 return images;
});
