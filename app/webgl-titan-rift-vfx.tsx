"use client";

import { useEffect, useRef, useState } from "react";
import { titanSpiritPlacement, titanSlashPlacement, type TitanStage, type VfxFrame } from "./titan-rift-layout";
import { TITAN_HD_ART, titanGhostCell, titanHdUv } from "./titan-rift-frames";
import { titanImpactCue } from "./titan-rift-impact";
import { TITAN_RIFT_DURATION_MS, TITAN_RIFT_FRAME_STARTS_MS, TITAN_RIFT_IMPACT_MS, titanRiftFrameAt } from "./titan-rift-timing";
import { WebGLVfxRenderer } from "./webgl-vfx-renderer";

const ECHO_DURATION_MS = 520;

type BaseProps = { effectKey: number; onComplete: (effectKey: number) => void };
type UltimateProps = BaseProps & { kind: "ultimate"; hit: boolean; ascended: boolean; onImpact: (effectKey: number) => void };
type EchoProps = BaseProps & { kind: "echo"; slashIndex: number };
type Props = UltimateProps | EchoProps;

function stageGeometry(canvas: HTMLCanvasElement): TitanStage {
  const rect = canvas.getBoundingClientRect();
  // Undo impact scaling before converting portrait coordinates.
  const width = canvas.clientWidth || rect.width;
  const height = canvas.clientHeight || rect.height;
  const scaleX = width / Math.max(1, rect.width);
  const scaleY = height / Math.max(1, rect.height);
  const stage = canvas.closest(".battle-stage");
  function portrait(side: "player" | "enemy"): VfxFrame {
    const frame = stage?.querySelector<HTMLElement>(`.fighter.${side} .fighter-frame`)?.getBoundingClientRect();
    return frame ? {
      left: (frame.left - rect.left) * scaleX, top: (frame.top - rect.top) * scaleY,
      width: frame.width * scaleX, height: frame.height * scaleY,
    } : { left: width * (side === "player" ? 0.1 : 0.65), top: height * 0.1,
      width: width * 0.25, height: height * 0.65 };
  }
  return { width, height, player: portrait("player"), enemy: portrait("enemy") };
}

export function WebGLTitanRiftVfx(props: UltimateProps) { return <TitanRiftCanvas {...props} />; }
export function WebGLTitanEchoVfx(props: EchoProps) { return <TitanRiftCanvas {...props} />; }

function TitanRiftCanvas(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const slashRef = useRef<HTMLDivElement>(null);
  const woundRef = useRef<HTMLDivElement>(null);
  const completeRef = useRef(props.onComplete);
  const impactRef = useRef(props.kind === "ultimate" ? props.onImpact : undefined);
  const impactNotifiedRef = useRef(false);
  const startedAtRef = useRef<number | null>(null);
  const [fallback, setFallback] = useState(false);
  const hit = props.kind === "ultimate" ? props.hit : true;
  const slashIndex = props.kind === "echo" ? props.slashIndex : 1;
  const ascended = props.kind === "echo" || props.ascended;
  useEffect(() => { completeRef.current = props.onComplete; }, [props.onComplete]);
  useEffect(() => { impactRef.current = props.kind === "ultimate" ? props.onImpact : undefined; });

  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;
    const canvas = canvasElement;
    const main = props.kind === "ultimate";
    const notifyImpact = () => {
      if (!main || impactNotifiedRef.current) return;
      impactNotifiedRef.current = true;
      impactRef.current?.(props.effectKey);
    };
    let renderer: WebGLVfxRenderer | null = null;
    let context: CanvasRenderingContext2D | null = null;
    if (!fallback) {
      try { renderer = new WebGLVfxRenderer(canvas); }
      catch { window.setTimeout(() => setFallback(true), 0); return; }
    } else {
      context = canvas.getContext("2d");
      if (!context) { notifyImpact(); completeRef.current(props.effectKey); return; }
    }
    const image = new Image(), slash = new Image(), wound = new Image();
    const slashLayer = slashRef.current, woundLayer = woundRef.current;
    let frameId = 0;
    let disposed = false;
    let completed = false;
    let previousElapsed = -1;
    let impactAnimation: Animation | null = null;
    const stage = canvas.closest<HTMLElement>(".battle-stage");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finish = () => {
      if (completed || disposed) return;
      completed = true;
      // Image failure still reports the already-settled number once.
      notifyImpact();
      impactAnimation?.cancel();
      if (slashLayer) slashLayer.style.opacity = "0";
      if (woundLayer) woundLayer.style.opacity = "0";
      if (main) stage?.classList.remove("titan-spirit-active");
      completeRef.current(props.effectKey);
    };
    function schedule() {
      if (disposed || completed) return;
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(draw);
    }
    image.onload = schedule;
    image.onerror = finish;
    image.src = main ? (ascended ? TITAN_HD_ART.ascended : TITAN_HD_ART.normal) : TITAN_HD_ART.impact;
    slash.src = TITAN_HD_ART.slash;
    wound.src = TITAN_HD_ART.impact;
    if (main) stage?.classList.add("titan-spirit-active");
    const contextLost = (event: Event) => { event.preventDefault(); setFallback(true); };
    canvas.addEventListener("webglcontextlost", contextLost);
    // Resize replaces a pending frame instead of starting a second animation loop.
    const observer = new ResizeObserver(schedule);
    observer.observe(canvas);

    function draw(time: number) {
      if (disposed || completed || renderer?.gl.isContextLost() || !image.complete || !image.naturalWidth) return;
      startedAtRef.current ??= time;
      const elapsed = time - startedAtRef.current;
      const duration = main ? (hit ? TITAN_RIFT_DURATION_MS : TITAN_RIFT_FRAME_STARTS_MS[11] + 300) : ECHO_DURATION_MS;
      if (elapsed >= (reducedMotion ? 430 : duration)) { finish(); return; }
      const frame = main
        ? Math.min(19, reducedMotion ? (hit ? 14 : 10) : titanRiftFrameAt(elapsed))
        : Math.min(3, reducedMotion ? 2 : Math.floor(elapsed / (ECHO_DURATION_MS / 4)));
      if (main && (reducedMotion || elapsed >= TITAN_RIFT_IMPACT_MS)) notifyImpact();
      const fade = main && !hit && elapsed > TITAN_RIFT_FRAME_STARTS_MS[11]
        ? Math.max(0, 1 - (elapsed - TITAN_RIFT_FRAME_STARTS_MS[11]) / 300)
        : main && hit && elapsed > TITAN_RIFT_DURATION_MS - 360 ? Math.max(0, (TITAN_RIFT_DURATION_MS - elapsed) / 360)
        : !main && elapsed > 390 ? Math.max(0, 1 - (elapsed - 390) / 130) : 1;
      const opacity = fade * (main ? 0.88 : 0.8);

      const geometry = stageGeometry(canvas);
      const cue = main ? titanImpactCue(previousElapsed, elapsed, hit, reducedMotion) : null;
      previousElapsed = elapsed;
      if (cue && stage && typeof stage.animate === "function") {
        impactAnimation?.cancel();
        const amplitude = (stage.getBoundingClientRect().width < 600 ? 9 : 16) * cue.strength * (ascended ? 1.2 : 1);
        // Separate translate composes with other skills' CSS transform animations.
        const jolts = [[0, 0], [-1, .6], [1, -.75], [-.85, -.4], [.9, .65],
          [-.75, .5], [.7, -.6], [-.6, -.35], [.55, .4], [-.45, .3],
          [.35, -.3], [-.25, .18], [.15, -.1], [0, 0]];
        impactAnimation = stage.animate(jolts.map(([x, y], index) => ({
          translate: `${amplitude * x}px ${amplitude * y}px`, offset: index / (jolts.length - 1),
        })), { duration: cue.duration, easing: "linear" });
      }
      if (slashLayer) slashLayer.style.opacity = "0";
      if (woundLayer) woundLayer.style.opacity = "0";
      if (renderer) { renderer.resize(geometry.width, geometry.height); renderer.clear(); }
      else if (context) {
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        const pixelWidth = Math.max(1, Math.round(geometry.width * ratio));
        const pixelHeight = Math.max(1, Math.round(geometry.height * ratio));
        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width=pixelWidth;canvas.height=pixelHeight; }
        context.setTransform(ratio,0,0,ratio,0,0);context.clearRect(0,0,geometry.width,geometry.height);
        context.imageSmoothingEnabled=true;context.imageSmoothingQuality="high";
      }
      const drawSprite = (asset: HTMLImageElement, uv: [number,number,number,number], box: {x:number;y:number;width:number;height:number}, alpha:number, angle=0) => {
        if (!asset.complete || !asset.naturalWidth) return;
        if (renderer) renderer.sprite(asset,box.x,box.y,box.width,box.height,alpha,false,uv,angle);
        else if(context) {
          context.save();context.globalAlpha=alpha;context.translate(box.x+box.width/2,box.y+box.height/2);context.rotate(angle);
          context.drawImage(asset,uv[0]*asset.naturalWidth,uv[1]*asset.naturalHeight,uv[2]*asset.naturalWidth,uv[3]*asset.naturalHeight,-box.width/2,-box.height/2,box.width,box.height);context.restore();
        }
      };
      const targetSize=geometry.enemy.width*(ascended?2:1.6);
      const target={x:geometry.enemy.left+geometry.enemy.width*.52-targetSize/2,y:geometry.enemy.top+geometry.enemy.height*.56-targetSize/2,width:targetSize,height:targetSize};
      const path=titanSlashPlacement(geometry,ascended,main?0:slashIndex);
      // Foreground sprites share atlas UVs with WebGL/2D, above the enemy portrait.
      const foreground = (layer: HTMLDivElement | null, asset:HTMLImageElement, cell:number, box:typeof target, alpha:number, angle=0, cellSize=512) => {
        if(!layer || !asset.complete || !asset.naturalWidth || !stage)return;
        const rect=canvas.getBoundingClientRect(), stageRect=stage.getBoundingClientRect();
        const sx=rect.width/geometry.width, sy=rect.height/geometry.height;
        const w=box.width*sx,h=box.height*sy;
        Object.assign(layer.style,{left:`${rect.left-stageRect.left+box.x*sx}px`,top:`${rect.top-stageRect.top+box.y*sy}px`,
          width:`${w}px`,height:`${h}px`,backgroundSize:`${w*cellSize*2/(cellSize-4)}px ${h*cellSize*2/(cellSize-4)}px`,
          backgroundPosition:`${-(cell%2*cellSize+2)*w/(cellSize-4)}px ${-(Math.floor(cell/2)*cellSize+2)*h/(cellSize-4)}px`,
          transform:`rotate(${angle}rad)`,opacity:String(alpha)});
      };
      if(main) {
        drawSprite(image,titanHdUv(titanGhostCell(frame)),titanSpiritPlacement(geometry,ascended),fade*(ascended ? .68 : .60)*(reducedMotion ? 1 : Math.min(1,elapsed/180)));
        const swingStart=TITAN_RIFT_FRAME_STARTS_MS[11];
        if(!reducedMotion && elapsed>=swingStart && elapsed<swingStart+420) {
          const progress=(elapsed-swingStart)/420;
          foreground(slashLayer,slash,Math.min(3,Math.floor(progress*4)),path,Math.min(1,progress*9,(1-progress)*5)*opacity,path.angle);
        }
        if(hit && (reducedMotion || elapsed>=TITAN_RIFT_IMPACT_MS)) {
          const age=elapsed-TITAN_RIFT_IMPACT_MS;
          const cell=(ascended?2:0)+(reducedMotion||age>=180?1:0);
          foreground(woundLayer,wound,cell,target,fade*(reducedMotion ? .55 : Math.min(1,(TITAN_RIFT_DURATION_MS-elapsed)/220)),0,768);
        }
      } else {
        // Only actual ascended echo events mount this one foreground Canvas.
        if(!reducedMotion) drawSprite(slash,titanHdUv(frame,2,2,512),path,opacity,path.angle);
        drawSprite(image,titanHdUv(reducedMotion||frame>=2?3:2,2,2),target,opacity*(reducedMotion ? .55 : 1));
      }
      schedule();
    }

    return () => {
      disposed = true;
      if (main) stage?.classList.remove("titan-spirit-active");
      if (slashLayer) slashLayer.style.opacity = "0";
      if (woundLayer) woundLayer.style.opacity = "0";
      impactAnimation?.cancel();
      cancelAnimationFrame(frameId);
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", contextLost);
      image.onload = null; image.onerror = null;
      if (renderer && !renderer.gl.isContextLost()) renderer.dispose();
    };
  }, [props.effectKey, props.kind, hit, slashIndex, ascended, fallback]);

  return [
    <canvas key={`${fallback ? "canvas" : "webgl"}-${props.kind}-${props.effectKey}`}
      ref={canvasRef} className={`skill-effect-canvas titan-rift-canvas${props.kind === "ultimate" ? " titan-spirit-canvas" : ""}`} aria-hidden="true" />,
    props.kind === "ultimate" ? <div key="slash" ref={slashRef} className="titan-ultimate-slash"
      style={{backgroundImage:`url(${TITAN_HD_ART.slash})`}} aria-hidden="true" /> : null,
    props.kind === "ultimate" ? <div key="wound" ref={woundRef} className="titan-ultimate-wound"
      style={{backgroundImage:`url(${TITAN_HD_ART.impact})`}} aria-hidden="true" /> : null,
  ];
}
