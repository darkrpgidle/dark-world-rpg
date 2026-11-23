"use client";
import {useEffect,useState,useCallback} from 'react';
import {realChapterAssets,type ChapterAssets} from './real-monster-assets';
import {playerSkillAssets,playerSkillClassKey} from './player-skill-assets';
export function useRealMapAssets(chapter:number|null,characterClass:string){
 const [state,setState]=useState<ChapterAssets|null>(null),[attempt,setAttempt]=useState(0);
 useEffect(()=>{if(chapter===null)return;return realChapterAssets.subscribe(chapter,setState);},[chapter,attempt]);
 const [player,setPlayer]=useState<ChapterAssets<Map<string,HTMLImageElement>>|null>(null);
 const classKey=playerSkillClassKey(characterClass);
 useEffect(()=>{if(chapter===null)return;return playerSkillAssets.subscribe(classKey,setPlayer);},[chapter,classKey,attempt]);
 const retry=useCallback(()=>{setState(null);setPlayer(null);setAttempt(n=>n+1);},[]);
 const current=state?.chapter===chapter?state:null;
 const own=player?.chapter===classKey?player:null;
 const counted=Boolean(current?.progress.total&&own?.progress.total);
 return {assets:own?.assets?current?.assets??null:null,progress:counted?{done:(current?.progress.done??0)+(own?.progress.done??0),total:(current?.progress.total??0)+(own?.progress.total??0)}:{done:0,total:0},error:current?.error??own?.error??null,retry};
}
