"use client";
import { useEffect, useRef, useState } from "react";
import { WebGLVfxRenderer } from "./webgl-vfx-renderer";
import { ASTRAL_TIMING, ASTRAL_PAGES, astralPage, astralSky, ASTRAL_STAR_ART, ASTRAL_CORE_ANCHORS, astralStarsAt, astralContact, astralUv, ASTRAL_STAR_POSITIONS, astralStarPosition, type AstralSegment } from "./astral-annihilation-frames";

type Props = { effectKey: number; ascended: boolean; segments: AstralSegment[];
  onImpact: (key: number, index: number) => void; onComplete: (key: number) => void };
export function MageAstralAnnihilationVfx({ effectKey, ascended, segments, onImpact, onComplete }: Props) {
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
    let disposed = false, completed = false, raf = 0, dimmed = false;
    let renderer: WebGLVfxRenderer | null = null, context: CanvasRenderingContext2D | null = null;
    const animations: Animation[] = [];
    const impact = (index: number, shake = true) => {
      if (impacted.current.has(index)) return;
      impacted.current.add(index); callbacks.current.onImpact(effectKey, index);
      if (!shake || !segments[index]?.hit || reduced || !stage?.animate) return;
      if (index < 6 && segments.slice(0,index).some(part => part.hit)) return;
      const main = index === 6, amount = main ? (stage.clientWidth < 600 ? 10 : 18) : 3;
      animations.push(stage.animate([
        { transform: "translate(0,0)" }, { transform: `translate(${amount}px,${-amount*.55}px)` },
        { transform: `translate(${-amount}px,${amount*.4}px)` }, { transform: `translate(${amount*.7}px,${-amount*.3}px)` },
        { transform: `translate(${-amount*.45}px,${amount*.2}px)` }, { transform: "translate(0,0)" },
      ], { duration: main ? 440 : 85 }));
    };
    const finish = () => {
      if (disposed || completed) return;
      completed = true; segments.forEach((_, index) => impact(index, false));
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
    const pages = ASTRAL_PAGES[ascended ? "ascended" : "normal"].map(() => new Image());
    const starArt = ASTRAL_STAR_ART[ascended ? "ascended" : "normal"];
    const core = new Image(), halo = new Image(), tail = new Image();
    const images = [...pages, core, halo, tail];
    const schedule = () => { if (!disposed && !completed) { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); } };
    const watchdog = window.setTimeout(finish, 3500);
    for (const asset of images) {
      asset.onload = () => {
        if (images.every(value => value.complete && value.naturalWidth)) {
          window.clearTimeout(watchdog); schedule();
        }
      };
      asset.onerror = finish;
    }
    ASTRAL_PAGES[ascended ? "ascended" : "normal"].forEach((path, index) => { pages[index].src = path; });
    core.src = starArt.core; halo.src = starArt.halo; tail.src = starArt.tail;
    const observer = new ResizeObserver(schedule); observer.observe(canvas);
    const lost = (event: Event) => { event.preventDefault(); setFallback(true); };
    canvas.addEventListener("webglcontextlost", lost);
    function draw(now: number) {
      if (disposed || completed || !images.every(value => value.complete && value.naturalWidth) || renderer?.gl.isContextLost()) return;
      started.current ??= now;
      const elapsed = now - started.current;
      if (elapsed >= (reduced ? 300 : ASTRAL_TIMING.duration)) { finish(); return; }
      const rect = canvas!.getBoundingClientRect();
      const width = canvas!.clientWidth || rect.width, height = canvas!.clientHeight || rect.height;
      const sx = width / Math.max(1, rect.width), sy = height / Math.max(1, rect.height);
      const p = stage?.querySelector<HTMLElement>(".fighter.player .fighter-frame")?.getBoundingClientRect();
      const e = stage?.querySelector<HTMLElement>(".fighter.enemy .fighter-frame")?.getBoundingClientRect();
      if (!p || !e || !width || !height) { finish(); return; }
      const ex = (e.left - rect.left + e.width * .5) * sx;
      const ey = (e.top - rect.top + e.height * .56) * sy;
      const ew = e.width * sx;
      const stageRect = stage!.getBoundingClientRect();
      const sw = stage!.clientWidth, sh = stage!.clientHeight;
      const left = (stageRect.left - rect.left) * sx, top = (stageRect.top - rect.top) * sy;
      const origins = ASTRAL_STAR_POSITIONS.map(([x,y,scale]) => ({ x: left+sw*x, y: top+sh*y, scale }));
      if (renderer) { renderer.resize(width, height); renderer.clear(); }
      else if (context) {
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        canvas!.width = Math.max(1, Math.round(width*ratio)); canvas!.height = Math.max(1, Math.round(height*ratio));
        context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
        context.setTransform(ratio,0,0,ratio,0,0); context.clearRect(0,0,width,height);
      }
      const sprite = (frame: number, x: number, y: number, w: number, h = w, alpha = 1,
        angle = 0, asset?: HTMLImageElement) => {
        const atlas = !asset;
        asset ??= pages[astralPage(frame)];
        const uv: [number, number, number, number] = atlas ? astralUv(frame, asset.naturalWidth, asset.naturalHeight) : [0,0,1,1];
        // Registered HD nucleus centers keep contraction and blast pinned to the target.
        const anchor=atlas && frame>=18 && frame<36
          ? ASTRAL_CORE_ANCHORS[ascended ? "ascended" : "normal"][frame-18] : [.5,.5];
        const dx=(anchor[0]-.5)*w, dy=(anchor[1]-.5)*h;
        const cx=x-dx*Math.cos(angle)+dy*Math.sin(angle), cy=y-dx*Math.sin(angle)-dy*Math.cos(angle);
        if (renderer) renderer.sprite(asset, cx-w/2, cy-h/2, w, h, alpha, false, uv, angle);
        else if (context) {
          context.save(); context.globalAlpha=alpha; context.translate(cx,cy); context.rotate(angle);
          context.drawImage(asset, uv[0]*asset.naturalWidth, uv[1]*asset.naturalHeight,
            uv[2]*asset.naturalWidth, uv[3]*asset.naturalHeight, -w/2, -h/2, w, h); context.restore();
        }
      };
      // Dedicated transparent layers keep the six spheres independent of the sky.
      const star = (x: number, y: number, size: number, alpha: number, angle = 0) => {
        sprite(0,x,y,size*1.5,size*1.5,alpha*.45,angle,halo);
        sprite(0,x,y,size,size,alpha,angle,core);
      };
      for (let index = 0; index < segments.length; index++)
        if (reduced || elapsed >= astralContact(index)) impact(index);
      if (reduced) {
        sprite(segments[6]?.hit ? 24 : 23, ex, ey, sw*1.15, sw*1.15, 1-elapsed/300);
        schedule(); return;
      }
      const stars = astralStarsAt(elapsed), landed = segments.slice(0,6).filter(part=>part.hit).length;
      // The first six logical frames form the sky; six spheres are anchored separately.
      if (elapsed < ASTRAL_TIMING.compress) {
        const frame = Math.min(5, Math.floor(elapsed/100));
        const fade = elapsed < 600 ? elapsed/600 : Math.min(1,(ASTRAL_TIMING.compress-elapsed)/300);
        const sky = astralSky(elapsed, sw, sh);
        sprite(frame,left+sw*.5,top+sky.y,sky.size,sky.size,fade*.75,sky.angle);
      }
      for (let i=0;i<stars;i++) {
        const origin=origins[i], size=ew*.95*origin.scale;
        if (elapsed < ASTRAL_TIMING.fire) {
          const age=elapsed-ASTRAL_TIMING.firstStar-i*ASTRAL_TIMING.starInterval;
          star(origin.x,origin.y,size,Math.min(1,age/140),elapsed*.00012*(i%2?1:-1));
        } else if (elapsed < ASTRAL_TIMING.beamImpact+240) {
          const bend=sw*(i%2 ? .12 : -.12);
          const point=astralStarPosition(i,elapsed,Boolean(segments[i]?.hit),origin,{x:ex,y:ey},bend);
          const age=elapsed-ASTRAL_TIMING.beamImpact;
          const fade=age<=0?1:Math.max(0,1-age/240);
          // Thin independent dust streaks follow the curve; no repeated sphere fog.
          for(let trail=3;trail>=1;trail--) {
            const past=astralStarPosition(i,elapsed-trail*24,Boolean(segments[i]?.hit),origin,{x:ex,y:ey},bend);
            const next=astralStarPosition(i,elapsed-(trail-1)*24,Boolean(segments[i]?.hit),origin,{x:ex,y:ey},bend);
            const distance=Math.hypot(next.x-past.x,next.y-past.y);
            if (distance>1) sprite(0,(past.x+next.x)/2,(past.y+next.y)/2,
              distance*1.6,size*.32,fade*(.42-trail*.07),Math.atan2(next.y-past.y,next.x-past.x),tail);
          }
          if (age<0 || !segments[i]?.hit) star(point.x,point.y,size,fade,elapsed*.00025);
          else sprite(24,ex,ey,ew*1.35,ew*1.35,fade*.5);
        }
      }
      if (elapsed >= ASTRAL_TIMING.compress && elapsed < ASTRAL_TIMING.blast) {
        const t=(elapsed-ASTRAL_TIMING.compress)/(ASTRAL_TIMING.blast-ASTRAL_TIMING.compress);
        if (!dimmed && t > .72 && stage?.animate) {
          dimmed = true;
          animations.push(stage.animate([{filter:"brightness(1)"},{filter:"brightness(.35)"},{filter:"brightness(.35)"},{filter:"brightness(1)"}],
            {duration:Math.max(1,ASTRAL_TIMING.blast-elapsed),easing:"ease-in-out"}));
        }
        // The last 200ms is deliberately quiet and dark before the final ring.
        const darkness = t > .72 ? .30 : 1;
        sprite(18+Math.min(5,Math.floor(t*6)),ex,ey,ew*(2.5-t*.85),ew*(2.5-t*.85),darkness);
        if (ascended) for(let i=0;i<landed;i++) {
          const angle=i*Math.PI/3+elapsed*.001;
          star(ex+Math.cos(angle)*ew*.78,ey+Math.sin(angle)*ew*.42,ew*.18,darkness);
        }
      }
      if (elapsed >= ASTRAL_TIMING.blast) {
        const age=elapsed-ASTRAL_TIMING.blast;
        if (segments[6]?.hit) {
          const frame=age<480 ? 24+Math.min(5,Math.floor(age/80)) : 30+Math.min(5,Math.floor((age-480)/87));
          const scale=ascended ? 1+landed*.025 : 1;
          // Blast and its fading orbit share one enemy anchor and one square size.
          sprite(frame,ex,ey,sw*1.25*scale,sw*1.25*scale,
            frame<30 ? 1 : Math.min(1,(ASTRAL_TIMING.duration-elapsed)/200));
        } else sprite(23,ex,ey,ew*1.4,ew*1.4,Math.max(0,1-age/250));
        if (segments.length>7 && age>=160 && segments.slice(7).some(part=>part.hit))
          sprite(25,ex,ey,ew*1.8,ew*1.8,Math.max(0,1-(age-160)/400));
      }
      schedule();
    }
    return () => {
      disposed=true; cancelAnimationFrame(raf); window.clearTimeout(watchdog); observer.disconnect();
      images.forEach(asset => { asset.onload=null; asset.onerror=null; }); animations.forEach((animation)=>animation.cancel());
      canvas.removeEventListener("webglcontextlost",lost);
      if (renderer && !renderer.gl.isContextLost()) renderer.dispose();
    };
  }, [effectKey,ascended,segments,fallback]);
  return <canvas key={fallback?"canvas":"webgl"} ref={canvasRef}
    className="skill-effect-canvas astral-annihilation-canvas" aria-hidden="true" />;
}
