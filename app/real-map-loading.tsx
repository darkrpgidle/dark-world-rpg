"use client";
import {maps} from './game-data';
import type {AssetProgress} from './real-monster-assets';
export function RealMapLoading({chapter,progress,error,onRetry,onCancel}:{chapter:number;progress:AssetProgress;error:string|null;onRetry:()=>void;onCancel:()=>void}){
 const percent=progress.total?Math.floor(progress.done/progress.total*100):0;
 return <div className="real-map-loading" role="dialog" aria-modal="true" aria-labelledby="real-map-loading-title">
  <section><small>DARK WORLD · REALM GATE</small><h2 id="real-map-loading-title">準備進入{maps[chapter-1].name}</h2>
   <p role="status">{error??'正在備妥本章怪物與職業技能影格，完成後進入戰場'}</p>
   <progress max={100} value={percent} aria-label="地圖技能特效讀取進度"/><span>{percent}%{progress.total?` · ${progress.done} / ${progress.total}`:''}</span>
   <div>{error&&<button onClick={onRetry}>重新讀取</button>}<button onClick={onCancel}>返回</button></div>
  </section>
 </div>;
}
