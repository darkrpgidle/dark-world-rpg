import type { CombatFloatEvent } from "./combat-float-events";
export type FloatBox = { x: number; y: number; width: number; height: number };
export type FloatView = { width: number; height: number; enemy: { x: number; y: number }; player: { x: number; y: number } };
export type FloatMeasure = { width: number; height: number; font: number; text: string; caption: string };
export type PlacedFloat = CombatFloatEvent & FloatMeasure & { x: number; y: number; born: number; duration: number; travel: number; column?: boolean };
export function floatDuration(event: CombatFloatEvent) {
  return event.channel === "ultimate" ? 1200 : event.volley ? 950 : event.channel === "extra" || event.channel === "dot" ? 600 : event.critical ? 800 : 700;
}
export function floatEnvelope(item: Pick<PlacedFloat, "x" | "y" | "width" | "height" | "travel"> & { column?: boolean }): FloatBox {
  const verticalPadding=item.column?1:5;
  return { x: item.x - 5, y: item.y - item.travel - verticalPadding, width: item.width + 10, height: item.height + item.travel + verticalPadding*2 };
}
export function floatsOverlap(a: FloatBox, b: FloatBox) {
  return a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y;
}
function candidates(event: CombatFloatEvent, size: FloatMeasure, view: FloatView, travel: number) {
  const anchor = view[event.target], ultimate = event.channel === "ultimate";
  const preferredX = ultimate ? view.width*.5 : anchor.x + (event.channel === "extra" ? 42 : event.channel === "dot" ? 52 : -20);
  const preferredY = ultimate ? view.height*.27 : event.channel === "dot" ? view.height*.68
    : event.channel === "extra" ? anchor.y+76 : anchor.y;
  const xs = [preferredX, preferredX-size.width-18, preferredX+size.width+18,
    view.width*.72, view.width*.28, view.width*.5];
  const ys = [preferredY,preferredY+size.height+travel+14,preferredY-size.height-travel-14,
    view.height*.82,view.height*.52,view.height*.22];
  const boxes: FloatBox[] = [];
  const zoneLeft=ultimate?10:event.target==="enemy"?view.width*.50:10;
  const zoneRight=ultimate?view.width-10:event.target==="player"?view.width*.48:view.width-10;
  const fitsZone=size.width<=zoneRight-zoneLeft;
  for (const y of ys) for (const x of xs) {
    const box = { x: Math.max(fitsZone?zoneLeft:10,Math.min((fitsZone?zoneRight:view.width-10)-size.width,x-size.width/2)),
      y: Math.max(travel+10,Math.min(view.height-size.height-10,y)), width: size.width, height: size.height };
    if (!boxes.some((b) => Math.abs(b.x-box.x)<1 && Math.abs(b.y-box.y)<1)) boxes.push(box);
  }
  return boxes;
}
export class CombatFloatLayout {
  active: PlacedFloat[] = [];
  pending: { event: CombatFloatEvent; due: number }[] = [];
  revision = 0;
  enqueue(events: readonly CombatFloatEvent[], now: number) {
    const known = new Set([...this.active.map((e)=>e.id),...this.pending.map((e)=>e.event.id)]);
    for (const event of events) {
      if (known.has(event.id)) continue;
      known.add(event.id); this.pending.push({ event, due: now+Math.max(0,event.delayMs??0) });
    }
  }
  clear() { this.active=[];this.pending=[];this.revision++; }
  tick(now: number, view: FloatView, measure: (event: CombatFloatEvent, view: FloatView)=>FloatMeasure) {
    const before = this.active.length;
    this.active=this.active.filter((item)=>now-item.born<item.duration);
    if (before!==this.active.length)this.revision++;
    const due=this.pending.filter((p)=>p.due<=now).sort((a,b)=>a.due-b.due || Number(b.event.channel==="ultimate")-Number(a.event.channel==="ultimate"));
    this.pending=this.pending.filter((p)=>p.due>now);
    for (const item of due) {
      // Do not replay a hidden tab's old visual backlog. HP was settled earlier.
      if (now-item.due>floatDuration(item.event))continue;
      this.place(item.event,now,view,measure(item.event,view));
    }
    return due.map((item)=>item.event);
  }
  reflow(now: number, view: FloatView, measure: (event: CombatFloatEvent, view: FloatView)=>FloatMeasure) {
    const old=[...this.active].sort((a,b)=>Number(b.channel==="ultimate")-Number(a.channel==="ultimate"));
    this.active=[];this.revision++;
    for (const item of old) if(now-item.born<item.duration)this.place(item,item.born,view,measure(item,view));
  }
  private place(event: CombatFloatEvent, now: number, view: FloatView, size: FloatMeasure) {
    if (this.placeColumn(event, now, view, size)) return;
    const cap=view.width<600?6:10, travel=event.channel==="ultimate"?20:30;
    if (event.channel==="ultimate") {
      if(this.active.some((item)=>item.channel==="ultimate"))this.revision++;
      this.active=this.active.filter((item)=>item.channel!=="ultimate");
    }
    const options=candidates(event,size,view,travel);
    if(event.channel==="ultimate") {
      const center=floatEnvelope({...options[0],travel});
      const count=this.active.length;
      this.active=this.active.filter((other)=>!floatsOverlap(center,floatEnvelope(other)));
      if(count!==this.active.length)this.revision++;
    }
    let slot=options.find((box)=>this.active.every((other)=>!floatsOverlap(floatEnvelope({...box,travel}),floatEnvelope(other))));
    // New hits never wait for a position. Retire the oldest regular numbers
    // until a space is free; keep the ultimate's large text protected.
    while ((!slot || this.active.length>=cap) && this.active.some((item)=>item.channel!=="ultimate")) {
      const oldest=this.active.filter((item)=>item.channel!=="ultimate").sort((a,b)=>a.born-b.born)[0];
      this.active=this.active.filter((item)=>item!==oldest);
      this.revision++;
      slot=options.find((box)=>this.active.every((other)=>!floatsOverlap(floatEnvelope({...box,travel}),floatEnvelope(other))));
    }
    if (!slot) return;
    this.active.push({...event,...size,x:slot.x,y:slot.y,born:now,duration:floatDuration(event),travel});
    this.revision++;
  }
  private placeColumn(event: CombatFloatEvent, now: number, view: FloatView, size: FloatMeasure) {
    if(event.target!=="enemy" || (event.channel!=="primary" && event.channel!=="extra"))return false;
    const incoming: PlacedFloat={...event,...size,height:Math.ceil(size.font*1.1)+2,
      x:0,y:0,born:now,duration:floatDuration(event),travel:Math.min(18,floatDuration(event)*.0225),column:true};
    const stack=[...this.active.filter((item)=>item.column),incoming].sort((a,b)=>a.born-b.born);
    let others=this.active.filter((item)=>!item.column);
    const cap=view.width<600?6:10,gap=6;
    let base=Math.max(18,view.enemy.y);
    const centerX=(item: PlacedFloat)=>Math.max(10,Math.min(view.width-item.width-10,view.enemy.x-item.width/2));
    for(const ultimate of others.filter((item)=>item.channel==="ultimate")) {
      if(floatsOverlap(floatEnvelope({...incoming,x:centerX(incoming),y:base}),floatEnvelope(ultimate)))
        base=Math.max(base,ultimate.y+ultimate.height+incoming.travel+10);
    }
    while(stack.length>1 && stack.length+others.length>cap)stack.shift();
    while(stack.length) {
      let y=Math.min(base,view.height-incoming.height-10);
      const placed=[...stack].reverse().map((item)=>{
        const next={...item,x:centerX(item),y,travel:Math.min(18,item.duration*.0225)};
        y-=gap+(stack[stack.indexOf(item)-1]?.height??0);return next;
      }).reverse();
      if(placed.some((item)=>item.y<0 || others.some((other)=>other.channel==="ultimate"&&floatsOverlap(floatEnvelope(item),floatEnvelope(other))))) {
        stack.shift();continue;
      }
      // New hit stays at the head. Existing numbers move UP one tight line,
      // retaining their damage, birth time, fade lifetime and vertical axis.
      others=others.filter((other)=>!placed.some((item)=>floatsOverlap(floatEnvelope(item),floatEnvelope(other))));
      while(placed.length+others.length>cap && others.some((item)=>item.channel!=="ultimate")) {
        const oldest=others.filter((item)=>item.channel!=="ultimate").sort((a,b)=>a.born-b.born)[0];others=others.filter((item)=>item!==oldest);
      }
      this.active=[...others,...placed];this.revision++;return true;
    }
    return true;
  }
}

// Predict relative separation over their shared lifetime, including the 8%
// birth pop. The static sample also keeps reduced-motion numbers separated.
export function flowNumbersConflict(a: PlacedFloat,b: PlacedFloat,now: number) {
  if(a.x+a.width+3<=b.x-3 || b.x+b.width+3<=a.x-3)return false;
  const at=(item: PlacedFloat,time: number)=>item.y-item.travel*Math.max(0,Math.min(1,(time-item.born)/item.duration));
  const end=Math.min(a.born+a.duration,b.born+b.duration);
  const differences=[a.y-b.y,at(a,now)-at(b,now),at(a,end)-at(b,end)];
  return Math.min(...differences)<b.height+6 && Math.max(...differences)>-a.height-6;
}
