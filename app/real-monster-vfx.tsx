"use client";
import {useEffect,useState} from 'react';
import {installRealMonsterRenderer} from './real-monster-renderer';
import type {realMonsterSnapshot} from './real-monster-combat';
type Snapshot=ReturnType<typeof realMonsterSnapshot>;
import type {RealSprites} from './real-monster-assets';
export function RealMonsterVfx({chapter,sprites}:{chapter:number;sprites:RealSprites}){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
 useEffect(()=>{const renderer=installRealMonsterRenderer(sprites);return()=>renderer.dispose();},[sprites]);
 useEffect(()=>{let last=0;const update=(event:Event)=>{const data=(event as CustomEvent<Snapshot>).detail;if(performance.now()-last<90)return;last=performance.now();setSnapshot(data);};const clear=()=>setSnapshot(null);
  window.addEventListener('dark-world-monster-state',update);window.addEventListener('dark-world-monster-target',clear);
  return()=>{window.removeEventListener('dark-world-monster-state',update);window.removeEventListener('dark-world-monster-target',clear);};
 },[chapter]);
 const at=snapshot?.clock??0;
 const statuses=snapshot?[
  snapshot.weakenUntil>at?'攻擊 -15%':null,snapshot.fractureUntil>at?'防禦 -20%':null,snapshot.slowUntil>at?'攻速 -20%':null,
  snapshot.poisonUntil>at?'中毒':null,snapshot.brandUntil>at?'灼燒':null,snapshot.bleedUntil>at?'流血':null,
  snapshot.armorUntil>at?'怪物重甲':null,snapshot.shellUntil>at?'怪物鐵殼':null,snapshot.hasteUntil>at?'怪物狂熱':null,
 ].filter(Boolean):[];
 return <>{statuses.length>0&&<div className="real-monster-statuses" aria-label="真實模式戰鬥狀態">{statuses.map(label=><span key={label}>{label}</span>)}</div>}</>;
}
