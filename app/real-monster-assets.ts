import {prepareRealMonsterSheets} from './real-monster-sprites';
export type RealSprites=Awaited<ReturnType<typeof prepareRealMonsterSheets>>;
export type AssetProgress={done:number;total:number};
export type ChapterAssets<T=RealSprites>={chapter:number;progress:AssetProgress;assets:T|null;error:string|null};
type Loader<T>=(chapter:number,progress:(p:AssetProgress)=>void,signal:AbortSignal)=>Promise<T>;
// One ready chapter is retained. A leaving renderer may still hold its bank
// until unmount; eviction never mutates a bank that is being displayed.
export function createChapterAssetCache<T>(load:Loader<T>,timeoutMs=120_000){
 type Entry={state:ChapterAssets<T>;listeners:Set<(s:ChapterAssets<T>)=>void>;controller:AbortController;pending:boolean};
 const entries=new Map<number,Entry>();
 return {subscribe(chapter:number,listener:(s:ChapterAssets<T>)=>void){
  let entry=entries.get(chapter);
  if(!entry){
   entry={state:{chapter,progress:{done:0,total:0},assets:null,error:null},listeners:new Set(),controller:new AbortController(),pending:true};
   entries.set(chapter,entry);const owned=entry;
   const emit=()=>{for(const fn of owned.listeners)fn(owned.state);};
   let rejectAbort:()=>void=()=>{};
   const aborted=new Promise<never>((_,reject)=>{rejectAbort=()=>reject(new DOMException('Aborted','AbortError'));owned.controller.signal.addEventListener('abort',rejectAbort,{once:true});});
   const timeout=setTimeout(()=>owned.controller.abort(),timeoutMs);
   Promise.race([aborted,Promise.resolve().then(()=>load(chapter,progress=>{if(owned.controller.signal.aborted)return;owned.state={...owned.state,progress};emit();},owned.controller.signal))]).then(assets=>{
    if(owned.controller.signal.aborted)throw new DOMException('Aborted','AbortError');
    owned.pending=false;owned.state={...owned.state,assets};
    for(const [key,other]of entries)if(key!==chapter&&!other.pending&&other.listeners.size===0)entries.delete(key);
    emit();
   }).catch(()=>{
    owned.pending=false;owned.state={...owned.state,error:'技能素材讀取失敗，請重試'};
    if(entries.get(chapter)===owned)entries.delete(chapter);emit();
   }).finally(()=>{clearTimeout(timeout);owned.controller.signal.removeEventListener('abort',rejectAbort);});
  }
  const owned=entry;owned.listeners.add(listener);listener(owned.state);
  return()=>{owned.listeners.delete(listener);queueMicrotask(()=>{
   if(owned.pending&&owned.listeners.size===0){owned.controller.abort();if(entries.get(chapter)===owned)entries.delete(chapter);}
   if(!owned.pending&&owned.listeners.size===0&&[...entries.values()].some(e=>e!==owned&&e.state.assets&&e.listeners.size>0))entries.delete(chapter);
  });};
 }};
}
export const realChapterAssets=createChapterAssetCache<RealSprites>(async(chapter,progress,signal)=>{
 if(!Number.isInteger(chapter)||chapter<1||chapter>4)throw Error('Invalid chapter');
 const response=await fetch(`/vfx/real-mode/chapter-${chapter}.json`,{signal});
 if(!response.ok)throw Error('Missing chapter sprites');
 const sheets=await response.json();
 if(!sheets.manifest||!sheets.images||Object.keys(sheets.manifest).length===0)throw Error('Invalid chapter sprites');
 return prepareRealMonsterSheets(sheets,progress,signal);
});
