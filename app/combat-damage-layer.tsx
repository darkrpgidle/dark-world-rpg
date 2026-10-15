"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { collectCombatFloats, type CombatFloatInputs, type CombatFloatEvent } from "./combat-float-events";
import { CombatFloatLayout, type FloatView, type FloatMeasure, type PlacedFloat } from "./combat-float-layout";

const NUMBER_FONT = "ui-monospace, SFMono-Regular, Consolas, monospace";
export function measureCombatFloat(event: CombatFloatEvent, view: FloatView,
  context: CanvasRenderingContext2D | null): FloatMeasure {
  const text = event.damage !== undefined ? `-${Math.round(event.damage).toLocaleString()}` : event.text ?? "";
  const caption = [event.label,event.critical ? "暴擊！" : ""].filter(Boolean).join("・");
  const ultimate = event.channel === "ultimate", small = event.channel === "extra" || event.channel === "dot";
  let font = ultimate ? Math.min(60,view.width*.12) : event.text ? 17
    : event.volley ? event.label === "六重風葬" ? 30 : event.critical ? 26 : 23
    : small ? 18 : event.tone === "ice" || event.tone === "violet" ? 34 : event.critical ? 29 : 23;
  const widthOf = (value: string, size: number, family: string) => {
    if (!context) return value.length*size*.66;
    context.font=`950 ${size}px ${family}`;return context.measureText(value).width;
  };
  const maxWidth = Math.max(90,view.width*(ultimate?.82:.44)-20);
  const initialWidth=widthOf(text,font,NUMBER_FONT);
  if(initialWidth>maxWidth)font=Math.max(14,font*maxWidth/initialWidth);
  const numberWidth=widthOf(text,font,NUMBER_FONT);
  const labelWidth=Math.min(maxWidth,widthOf(caption,ultimate?13:11,"sans-serif"));
  return {text,caption,font,width:Math.min(view.width-20,Math.max(numberWidth,labelWidth)+16),
    height:Math.ceil(font*1.1+(caption?(ultimate?18:15):0)+12)};
}
function FloatNumber({ item, reduced }: { item: PlacedFloat; reduced: boolean }) {
  return <div className={`combat-float-number float-${item.channel} tone-${item.tone??"normal"}${item.critical?" is-critical":""}${item.column?" is-column":""}`}
    data-target={item.target} data-float-id={item.id} title={item.caption}
    style={{ left:item.x,top:item.y,width:item.width,height:item.height,
      "--float-font":`${item.font}px`,"--float-rise":`${-item.travel}px`,
      animationName:reduced?"combat-float-still":item.column?"combat-float-stack":"combat-float-rise",
      animationDuration:`${item.duration}ms`,animationDelay:"0ms",
      animationTimingFunction:item.column?"linear":"ease-out",
    } as React.CSSProperties}>
    {item.caption && <small>{item.caption}</small>}<b>{item.text}</b>
  </div>;
}
export function CombatDamageLayer({ inputs, resetToken, enabled=true, onDamageShown }: {
  inputs: CombatFloatInputs; resetToken: string | object; enabled?: boolean;
  onDamageShown?: (events: readonly CombatFloatEvent[], token: string | object) => void;
}) {
  const layerRef=useRef<HTMLDivElement>(null);
  const model=useRef(new CombatFloatLayout());
  const sourceIds=useRef(new WeakMap<object,string>()), serial=useRef(0);
  const previous=useRef<{token: string | object | null; ids: Set<string>}>({token:null,ids:new Set()});
  const wake=useRef<(()=>void)|null>(null), allowed=useRef(enabled);
  const damageShown=useRef(onDamageShown);
  useLayoutEffect(()=>{damageShown.current=onDamageShown;},[onDamageShown]);
  const [items,setItems]=useState<PlacedFloat[]>([]), [reduced,setReduced]=useState(false);
  useEffect(()=>{
    const element=layerRef.current;
    if(!element)return;
    const stage=element.closest<HTMLElement>(".battle-stage");
    const context=document.createElement("canvas").getContext("2d");
    let disposed=false,raf=0,revision=-1,needsLayout=true;
    let view: FloatView={width:360,height:280,enemy:{x:260,y:90},player:{x:90,y:90}};
    const motion=window.matchMedia("(prefers-reduced-motion: reduce)");
    const schedule=()=>{if(!disposed){cancelAnimationFrame(raf);raf=requestAnimationFrame(draw);}};
    wake.current=schedule;
    const observer=new ResizeObserver(()=>{needsLayout=true;schedule();});observer.observe(element);
    if(stage)observer.observe(stage);
    function draw(now: number) {
      if(disposed)return;
      if(needsLayout){
        const rect=element!.getBoundingClientRect();
        const width=element!.clientWidth||rect.width,height=element!.clientHeight||rect.height;
        if(width<120||height<150)return;
        const sx=width/Math.max(1,rect.width),sy=height/Math.max(1,rect.height);
        const anchor=(target:"enemy"|"player")=>{
          const fighter=stage?.querySelector<HTMLElement>(`.fighter.${target} .fighter-frame`)?.getBoundingClientRect();
          return fighter?{x:(fighter.left-rect.left+fighter.width*.5)*sx,
            y:(fighter.top-rect.top+fighter.height*.24)*sy}:{x:width*(target==="enemy"?.73:.27),y:height*.28};
        };
        view={width,height,enemy:anchor("enemy"),player:anchor("player")};
        model.current.reflow(now,view,(event,v)=>measureCombatFloat(event,v,context));needsLayout=false;
      }
      const shown=model.current.tick(now,view,(event,v)=>measureCombatFloat(event,v,context));
      if(revision!==model.current.revision){revision=model.current.revision;setItems([...model.current.active]);}
      if(shown.length && previous.current.token!==null)damageShown.current?.(shown,previous.current.token);
      setReduced((old)=>old===motion.matches?old:motion.matches);
      if(allowed.current&&(model.current.pending.length||model.current.active.length))schedule();
    }
    schedule();
    return()=>{disposed=true;cancelAnimationFrame(raf);observer.disconnect();wake.current=null;};
  },[]);
  useEffect(()=>{
    allowed.current=enabled;
    const events=collectCombatFloats(inputs,(source)=>{
      let id=sourceIds.current.get(source);
      if(!id){id=String(++serial.current);sourceIds.current.set(source,id);}return id;
    });
    const old=previous.current;
    const changed=old.token!==null&&old.token!==resetToken;
    if(changed||!enabled)model.current.clear();
    if(!changed&&enabled)model.current.enqueue(events.filter((event)=>!old.ids.has(event.id)),performance.now());
    previous.current={token:resetToken,ids:new Set(events.map((event)=>event.id))};
    wake.current?.();
  },[inputs,resetToken,enabled]);
  return <div ref={layerRef} className="combat-damage-layer" aria-hidden="true">
    {items.map((item)=><FloatNumber key={item.id} item={item} reduced={reduced}/>)}
  </div>;
}
