"use client";
import { useEffect, useRef, useState } from "react";
import { WebGLVfxRenderer } from "./webgl-vfx-renderer";
import { SKY_RAIN_DURATION_MS, SKY_RAIN_IMPACTS_MS, skyMarksAt, type SkyArrow } from "./sky-queen-rain-timing";

// Components are authored separately: the queen never carries baked arrows/rings.
type SkyArt = "queen" | "array" | "impacts" | "flow" | "water" | "holy" | "hit" | "cannon";
const SKY_ART: SkyArt[] = ["queen", "array", "impacts", "flow", "water", "holy", "hit"];
// Fit the filled dimensional gate directly above the fixed queen portrait.
export function skyArrayPlacement(width: number, actorTop: number, queenX: number, queenWidth: number,
  aspect: number, nativeWidth: number, density: number) {
  const available = Math.max(8, actorTop - 20);
  const w = Math.max(1,Math.min(width*.43,queenWidth*1.65,430,nativeWidth/Math.max(1,density),available/(1/aspect+.04)));
  const h=w/aspect, rotatedH=h+w*.04;
  const x=Math.max(w/2+8,Math.min(width-w/2-8,queenX));
  return { x, y:8+rotatedH/2, w, h };
}
type Props = { effectKey: number; ascended: boolean; arrows: SkyArrow[];
  onImpact: (key: number, index: number) => void; onComplete: (key: number) => void };
export function RangerSkyQueenRainVfx({ effectKey, ascended, arrows, onImpact, onComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const callbacks = useRef({ onImpact, onComplete });
  const started = useRef<number | null>(null);
  const impacted = useRef(new Set<number>());
  const [fallback, setFallback] = useState(false);
  useEffect(() => { callbacks.current = { onImpact, onComplete }; }, [onImpact, onComplete]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stage = canvas.closest<HTMLElement>(".battle-stage");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let disposed = false, completed = false, raf = 0;
    let renderer: WebGLVfxRenderer | null = null, context: CanvasRenderingContext2D | null = null;
    const animations: Animation[] = [];
    const impact = (index: number, shake = true) => {
      if (impacted.current.has(index)) return;
      impacted.current.add(index); callbacks.current.onImpact(effectKey, index);
      if (!shake || !arrows[index]?.hit || reduced || !stage?.animate) return;
      const main = index === 8, amount = main ? (stage.clientWidth < 600 ? 9 : 16) : 2;
      animations.push(stage.animate([
        { transform: "translate(0,0)" }, { transform: `translate(${amount}px,${-amount*.55}px)` },
        { transform: `translate(${-amount}px,${amount*.4}px)` }, { transform: `translate(${amount*.7}px,${-amount*.3}px)` },
        { transform: `translate(${-amount*.45}px,${amount*.2}px)` }, { transform: "translate(0,0)" },
      ], { duration: main ? 440 : 85 }));
    };
    const finish = () => {
      if (disposed || completed) return;
      completed = true; arrows.forEach((_, index) => impact(index, false));
      callbacks.current.onComplete(effectKey);
    };
    let fallbackTimer: number | undefined;
    if (!fallback) {
      try { renderer = new WebGLVfxRenderer(canvas); }
      catch { fallbackTimer = window.setTimeout(() => setFallback(true), 0); }
      if (!renderer) return () => window.clearTimeout(fallbackTimer);
    } else {
      context = canvas.getContext("2d");
      if (!context) { finish(); return; }
    }
    const art = ascended ? [...SKY_ART, "cannon" as const] : SKY_ART;
    const images = Object.fromEntries(art.map((kind) => [kind, new Image()])) as Record<SkyArt, HTMLImageElement>;
    const ready = () => art.every((kind) => images[kind].complete && images[kind].naturalWidth > 0);
    const schedule = () => { if (!disposed && !completed) { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); } };
    const watchdog = window.setTimeout(finish, 5000);
    for (const kind of art) {
      images[kind].onload = () => { if (ready()) { window.clearTimeout(watchdog); schedule(); } };
      images[kind].onerror = finish;
      images[kind].src = kind === "array"
        ? `/vfx/sky-queen-rain-v5/array-${ascended ? "ascended" : "normal"}.webp`
        : kind === "cannon" ? "/vfx/sky-queen-rain-v7/cannon.webp" : kind === "holy" ? "/vfx/sky-queen-rain-v6/arrows.webp" : kind === "hit" ? `/vfx/sky-queen-rain-v6/hit-${ascended ? "ascended" : "normal"}.webp` : kind === "water" ? "/vfx/sky-queen-rain-v5/water.webp" : kind === "flow" ? "/vfx/sky-queen-rain-v4/summoning.webp" : `/vfx/sky-queen-rain-v2/${kind}.webp`;
    }
    const observer = new ResizeObserver(schedule); observer.observe(canvas);
    const lost = (event: Event) => { event.preventDefault(); setFallback(true); };
    canvas.addEventListener("webglcontextlost", lost);
    function draw(now: number) {
      if (disposed || completed || !ready() || renderer?.gl.isContextLost()) return;
      started.current ??= now;
      const elapsed = now - started.current;
      if (elapsed >= (reduced ? 300 : SKY_RAIN_DURATION_MS)) { finish(); return; }
      const rect = canvas!.getBoundingClientRect();
      const width = canvas!.clientWidth || rect.width, height = canvas!.clientHeight || rect.height;
      const sx = width / Math.max(1, rect.width), sy = height / Math.max(1, rect.height);
      const p = stage?.querySelector<HTMLElement>(".fighter.player .fighter-frame")?.getBoundingClientRect();
      const e = stage?.querySelector<HTMLElement>(".fighter.enemy .fighter-frame")?.getBoundingClientRect();
      const px = p ? (p.left - rect.left + p.width*.60)*sx : width*.27;
      const foot = p ? (p.top - rect.top + p.height)*sy : height*.85;
      const ex = e ? (e.left - rect.left + e.width*.5)*sx : width*.74;
      const ey = e ? (e.top - rect.top + e.height*.58)*sy : height*.56;
      const actorH = p ? p.height*sy : height*.62;
      if (renderer) { renderer.resize(width, height); renderer.clear(); }
      else if (context) {
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        canvas!.width = Math.max(1, Math.round(width*ratio)); canvas!.height = Math.max(1, Math.round(height*ratio));
        context.setTransform(ratio,0,0,ratio,0,0); context.clearRect(0,0,width,height);
      }
      const sprite = (kind: SkyArt, cell: number, x: number, y: number, w: number, alpha: number,
        rotation = 0, ax = .5, ay = .5, overrideH?: number) => {
        if (alpha <= 0 || w <= 0) return;
        const image = images[kind], columns = kind === "array" ? 1 : kind === "impacts" ? 4 : 2;
        const index = kind === "array" ? 0 : cell + (ascended && kind!=="hit" && kind!=="cannon" ? (kind === "impacts" ? 8 : kind === "holy" ? 2 : 4) : 0);
        const cw = image.naturalWidth / columns, ch = image.naturalHeight / (kind === "array" ? 1 : kind === "holy" || kind === "hit" ? 2 : 4);
        const cx = index % columns * cw, cy = Math.floor(index / columns) * ch;
        const h = overrideH ?? w * (ch - 2) / (cw - 2);
        const dx = (ax-.5)*w, dy = (ay-.5)*h;
        const left = x-dx*Math.cos(rotation)+dy*Math.sin(rotation)-w/2;
        const top = y-dx*Math.sin(rotation)-dy*Math.cos(rotation)-h/2;
        if (renderer) renderer.sprite(image,left,top,w,h,alpha,false,
          [(cx+1)/image.naturalWidth,(cy+1)/image.naturalHeight,(cw-2)/image.naturalWidth,(ch-2)/image.naturalHeight],rotation);
        else if (context) {
          context.save(); context.globalAlpha=alpha; context.translate(left+w/2,top+h/2); context.rotate(rotation);
          context.drawImage(image,cx+1,cy+1,cw-2,ch-2,-w/2,-h/2,w,h); context.restore();
        }
      };
      // Preserve the previous queen scale when expanding only the overhead canvas.
      const previousHeight=height*124/150, previousFoot=foot-height*26/150;
      const queenH = Math.min(previousHeight*.86,actorH*1.5,Math.max(1,previousFoot-8));
      const queenImage = images.queen;
      const queenW = queenH * (queenImage.naturalWidth / 2 - 2) / (queenImage.naturalHeight / 4 - 2);
      const queenCell = reduced ? 3 : elapsed<340 ? 0 : elapsed<740 ? 1 : elapsed<970 ? 2 : 3;
      const opacity = reduced ? .65 : Math.min(.90,elapsed/300)*Math.min(1,(SKY_RAIN_DURATION_MS-elapsed)/420);
      // Awakening is independent art, behind the queen: her eyes first open at 740ms.
      if (!reduced && elapsed >= 740 && elapsed < 1120) {
        const age = elapsed - 740;
        sprite("impacts", age < 120 ? 0 : 1, px, foot-queenH*.65,
          Math.min(width*.43,queenW*1.8), Math.min(1,(380-age)/150));
      }
      // All poses keep one destination rectangle and fixed feet, with no full-scene zoom.
      sprite("queen",queenCell,px,foot,queenW,opacity,0,.5,.932);
      const marks = skyMarksAt(arrows,reduced ? 2440 : elapsed,ascended);
      const arrayImage=images.array;
      const arrayAspect=(arrayImage.naturalWidth-2)/(arrayImage.naturalHeight-2);
      const actorTop = Math.max(8,foot-queenH);
      const array = skyArrayPlacement(width,actorTop,px,queenW,arrayAspect,arrayImage.naturalWidth-2,
        Math.min(2,window.devicePixelRatio||1));
      const arrayX=array.x,arrayY=array.y,arrayW=array.w;
      const launchPoint = (index: number) => {
        const offset = index===8 ? 0 : (index-3.5)*arrayW*.055;
        return [arrayX+offset,arrayY+offset*.25] as const;
      };
      if (reduced || elapsed >= 970) {
        const age = elapsed-970;
        const alpha = reduced ? .65 : Math.min(1,age/170)*Math.max(0,1-(elapsed-2040)/340);
        // One native high-resolution plane per variant; never enlarge small atlas cells.
        sprite("array",0,arrayX,arrayY,arrayW*(reduced?1:1-.32*Math.max(0,Math.min(1,(elapsed-2040)/340))),alpha*.92,
          reduced?0:Math.sin(age/700)*.03);
      }
      // Queen sends one continuous holy stream into the sky array. No arrows
      // originate at her body: all projectiles are born in the array below.
      if(!reduced && elapsed>=740 && elapsed<1170) {
        const fromX=px+queenW*.10,fromY=foot-queenH*.65;
        const t=Math.min(1,(elapsed-740)/230),tipX=fromX+(arrayX-fromX)*t,tipY=fromY+(arrayY-fromY)*t;
        const length=Math.hypot(tipX-fromX,tipY-fromY),angle=Math.atan2(arrayY-fromY,arrayX-fromX);
        const alpha=Math.min(1,(elapsed-740)/65)*Math.min(1,(1170-elapsed)/160);
        sprite("flow",0,(fromX+tipX)/2,(fromY+tipY)/2,length,alpha,angle,.5,.5,actorH*.15);
        if(t===1) sprite("flow",1,arrayX,arrayY,Math.min(arrayW*.42,130),alpha);
      }
      for (let i=0;i<marks;i++) {
        const angle = -Math.PI*.8+i*Math.PI*.22;
        sprite("impacts",2,ex+Math.cos(angle)*actorH*.25,ey+Math.sin(angle)*actorH*.22,
          Math.min(queenW*.14,32),.85);
      }
      // Each arrow emerges slowly from the queen's dimensional gate, then accelerates.
      arrows.forEach((arrow,index) => {
        const impactAt = SKY_RAIN_IMPACTS_MS[index];
        if (reduced || elapsed>=impactAt) impact(index,!reduced && elapsed-impactAt<120);
        const main = index===8, flightMs=main?60:90;
        const launch=impactAt-flightMs, birth=main?2040:launch-240;
        const [skyX,skyY]=launchPoint(index);
        const angle=Math.atan2(ey-skyY,ex-skyX),ux=Math.cos(angle),uy=Math.sin(angle);
        const arrowW=main?Math.min(width*.43,310)*(1+marks*.025):Math.min(width*.21,160);
        const emergence=arrowW*.75, pullback=main?actorH*.16:0;
        const departX=skyX+ux*(emergence-pullback),departY=skyY+uy*(emergence-pullback);
        if(!reduced && elapsed>=birth && elapsed<launch) {
          const t=(elapsed-birth)/(launch-birth), draw=main?Math.max(0,(t-.3)/.7):0;
          const emerge=Math.min(1,t/(main?.3:1));
          const tx=skyX+ux*(emergence*emerge-pullback*draw),ty=skyY+uy*(emergence*emerge-pullback*draw);
          sprite("flow",main?3:2,skyX,skyY,arrowW*(main?.72:.48),Math.sin(t*Math.PI)*.65);
          sprite(ascended?"cannon":"holy",ascended?(t<.5?0:1):(main?1:0),tx,ty,arrowW*(.65+.35*emerge),Math.min(1,t*1.7),angle,.85,.5);
          if(main) {
            // The bow stays at the gate while the arrow/string visibly draw backward.
            sprite("water",2,skyX+ux*arrowW*.30,skyY+uy*arrowW*.30,arrowW*.65,
              Math.min(1,t*3),angle,.5,.5);
            const nockX=tx-ux*arrowW*.73,nockY=ty-uy*arrowW*.73;
            for(const side of [-1,1]) {
              const limbX=skyX+ux*arrowW*.4-uy*side*arrowW*.20;
              const limbY=skyY+uy*arrowW*.4+ux*side*arrowW*.20;
              sprite("flow",0,(limbX+nockX)/2,(limbY+nockY)/2,
                Math.hypot(limbX-nockX,limbY-nockY),draw*.85,
                Math.atan2(nockY-limbY,nockX-limbX),.5,.5,Math.max(2,width*.003));
            }
          }
        }
        if(!reduced && elapsed>=launch && elapsed<impactAt+(arrow.hit?0:100)) {
          const t=(elapsed-launch)/flightMs;
          const tx=departX+(ex-departX)*t,ty=departY+(ey-departY)*t;
          sprite(ascended?"cannon":"holy",ascended?(t<.35?2:3):(main?1:0),tx,ty,arrowW,arrow.hit?1:Math.max(0,1-(t-1)*2),angle,.85,.5);
          if(main) {
            // Remaining gate energy travels with the finisher rather than vanishing separately.
            sprite("array",0,tx-ux*arrowW*.3,ty-uy*arrowW*.3,arrayW*.5,
              Math.max(0,1-t)*.65,angle);
          }
        }
        if(!reduced && elapsed>=launch && elapsed<impactAt+330) {
          const t=Math.max(0,Math.min(1,(elapsed-launch)/flightMs));
          const tipX=departX+(ex-departX)*t,tipY=departY+(ey-departY)*t;
          sprite(ascended?"cannon":"holy",ascended?3:(main?1:0),(departX+tipX)/2,(departY+tipY)/2,Math.hypot(tipX-departX,tipY-departY),
            Math.max(0,1-Math.max(0,elapsed-impactAt)/330)*(main?.8:.4),angle,.5,.5,
            ascended?actorH*(main?.22:.12):Math.max(6,width*(main?.025:.012)));
        }
        const impactAge=reduced?0:elapsed-impactAt;
        if (arrow.hit && impactAge>=0 && impactAge<(main?480:220)) {
          const duration=main?480:220;
          // Arrow penetration -> powerful breaking wave -> spreading wall -> dissipating water.
          const frame=ascended?(reduced?6:main?(impactAge<45?4:impactAge<150?5:impactAge<300?6:7)
            :(impactAge<30?4:impactAge<85?5:impactAge<150?6:7)):reduced?2:main?(impactAge<45?0:impactAge<150?1:impactAge<300?2:3)
            :(impactAge<30?0:impactAge<85?1:impactAge<150?2:3);
          const enemyW=e?e.width*sx:width*.18;
          const hitArt=ascended?"cannon":"hit";
          const nativeCell=(images[hitArt].naturalWidth/2-2)/Math.min(2,window.devicePixelRatio||1);
          const hitW=Math.min(nativeCell,main?Math.min(enemyW*2.5,width*.48,420)*(1+marks*.015):Math.min(enemyW*1.4,210));
          sprite(hitArt,frame,ex,ey,hitW,reduced?.65:Math.min(1,(duration-impactAge)/100),(frame===0||frame===4)?angle:0);
        }
      });
      schedule();
    }
    return () => {
      disposed=true; cancelAnimationFrame(raf); window.clearTimeout(watchdog); observer.disconnect();
      for(const image of Object.values(images)) { image.onload=null; image.onerror=null; } animations.forEach((animation)=>animation.cancel());
      canvas.removeEventListener("webglcontextlost",lost);
      if (renderer && !renderer.gl.isContextLost()) renderer.dispose();
    };
  }, [effectKey,ascended,arrows,fallback]);
  return <canvas key={fallback?"canvas":"webgl"} ref={canvasRef}
    className="skill-effect-canvas sky-queen-rain-canvas" aria-hidden="true" />;
}
