"use client";
import { useEffect, useRef, useState } from "react";
import { WebGLVfxRenderer } from "./webgl-vfx-renderer";
import { STANCE_ATTACK_MS, STANCE_FADE_MS, STANCE_WOUND_START_MS, STANCE_WOUND_MS, ASCENDED_STANCE_ART, ascendedStanceFrame, stanceHdUv, stanceSpecterBox, stanceSlashPath, stanceFrame, stanceUv } from "./berserker-stance-frames";

type Props = { active: boolean; activationKey: number; pulseKey: number; attackKey: number; attackHit: boolean; attackTarget: string; targetKey: string; ascended: boolean; extensions: number };
export function WebGLBerserkerStanceVfx(props: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const slashRef = useRef<HTMLDivElement>(null);
  const woundRef = useRef<HTMLDivElement>(null);
  const current = useRef(props);
  const [fallback, setFallback] = useState(false);
  useEffect(() => { current.current = props; }, [props]);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let renderer: WebGLVfxRenderer | undefined;
    let ctx: CanvasRenderingContext2D | null = null;
    if (fallback) ctx = canvas.getContext("2d");
    else { try { renderer = new WebGLVfxRenderer(canvas); } catch { setFallback(true); return; } }
    const state = new Image(), attack = new Image();
    const attackPages = props.ascended ? ASCENDED_STANCE_ART.attack.map(() => new Image()) : [];
    const slash = new Image();
    const wound = new Image();
    const stage = canvas.closest<HTMLElement>(".battle-stage");
    const slashLayer = slashRef.current;
    const woundLayer = woundRef.current;
    let raf = 0, idleTimer = 0, disposed = false;
    let activatedAt = 0, pulseAt = 0, attackedAt = 0, fadedAt = 0;
    let lastActivation = 0, lastPulse = 0, lastAttack = current.current.attackKey, wasActive = false;
    const lost = (e: Event) => { e.preventDefault(); setFallback(true); };
    canvas.addEventListener("webglcontextlost", lost);
    function draw(time: number) {
      if (disposed) return;
      const p = current.current;
      if (p.activationKey !== lastActivation) { lastActivation = p.activationKey; activatedAt = time; }
      if (p.pulseKey !== lastPulse) { lastPulse = p.pulseKey; pulseAt = time; }
      if (p.attackKey !== lastAttack) { lastAttack = p.attackKey; attackedAt = time; }
      if (wasActive && !p.active) fadedAt = time;
      if (p.active) fadedAt = 0;
      wasActive = p.active;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const attacking = attackedAt > 0 && time - attackedAt < STANCE_ATTACK_MS;
      // The final consumed attack finishes before the stance dissolves.
      const fadeStart = Math.max(fadedAt, attackedAt + STANCE_ATTACK_MS);
      const fading = fadedAt > 0 && time - fadeStart < STANCE_FADE_MS;
      if (p.ascended) stage?.classList.toggle("berserker-ascended-active", p.active || attacking || fading);
      const rect = canvas!.getBoundingClientRect();
      if (slashLayer) slashLayer.style.opacity = "0";
      if (woundLayer) woundLayer.style.opacity = "0";
      if (renderer) { renderer.resize(); renderer.clear(); }
      else if (ctx) {
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        canvas!.width = Math.max(1, Math.round(rect.width * ratio)); canvas!.height = Math.max(1, Math.round(rect.height * ratio));
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, rect.width, rect.height);
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
      }
      if (p.active || attacking || fading) {
        const player = stage?.querySelector(".fighter.player .fighter-frame")?.getBoundingClientRect();
        if (player) {
          const left = player.left - rect.left, top = player.top - rect.top;
          const width = player.width, height = player.height;
          const phase = attacking ? "attack" : !p.active ? "fade" : pulseAt && time-pulseAt<430 ? "pulse"
            : activatedAt && time-activatedAt<500 ? "activation" : "idle";
          const elapsed = phase === "attack" ? time-attackedAt : phase === "fade" ? Math.max(0,time-fadeStart)
            : phase === "activation" ? time-activatedAt : time;
          const alpha = phase === "fade" ? Math.max(0,1-elapsed/STANCE_FADE_MS) : phase === "activation" ? Math.min(1,elapsed/120) : Math.min(1, 0.88 + p.extensions * 0.035);
          if (p.ascended) {
            // One complete registered spirit remains behind the portrait; no limb crops.
            const frame = ascendedStanceFrame(elapsed, phase, reduced);
            const ghost = attacking ? attackPages[Math.floor(frame / 4)] : state;
            const box = stanceSpecterBox({ left, top, width, height });
            const drawHd = (asset: HTMLImageElement, cell: number, cx: number, cy: number, w: number, h: number, opacity: number, angle = 0) => {
              if (!asset.naturalWidth) return;
              const sample = stanceHdUv(cell);
              if (renderer) renderer.sprite(asset, cx-w/2, cy-h/2, w, h, opacity, false, sample, angle);
              else if (ctx) {
                ctx.save(); ctx.globalAlpha = opacity; ctx.translate(cx, cy); ctx.rotate(angle);
                ctx.drawImage(asset, sample[0]*asset.naturalWidth, sample[1]*asset.naturalHeight,
                  sample[2]*asset.naturalWidth, sample[3]*asset.naturalHeight, -w/2, -h/2, w, h); ctx.restore();
              }
            };
            drawHd(ghost, frame, box.x+box.size/2, box.y+box.size/2, box.size, box.size, alpha*.64);
            const enemy = stage?.querySelector(".fighter.enemy .fighter-frame")?.getBoundingClientRect();
            if (attacking && !reduced && enemy && slashLayer && slash.naturalWidth && stage && elapsed >= STANCE_ATTACK_MS * .25) {
              const path = stanceSlashPath({ left, top, width, height }, { left: enemy.left-rect.left, top: enemy.top-rect.top, width: enemy.width, height: enemy.height });
              const progress = (elapsed-STANCE_ATTACK_MS*.25)/(STANCE_ATTACK_MS*.75);
              const cell = Math.min(3,Math.floor(progress*4));
              const stageRect = stage.getBoundingClientRect();
              // Reuse the exact atlas inset, size and angle in a foreground sprite.
              // The complete spirit stays on its original rear Canvas.
              Object.assign(slashLayer.style, {
                left: `${path.x+rect.left-stageRect.left-path.width/2}px`,
                top: `${path.y+rect.top-stageRect.top-path.height/2}px`,
                width: `${path.width}px`, height: `${path.height}px`,
                backgroundSize: `${path.width*1024/508}px ${path.height*1024/508}px`,
                backgroundPosition: `${-(cell%2*512+2)*path.width/508}px ${-(Math.floor(cell/2)*512+2)*path.height/508}px`,
                transform: `rotate(${path.angle}rad)`,
                opacity: String(alpha*.85*Math.min(1,progress*8, (1-progress)*5)),
              });
            }
            // Pure feedback for this attack's settled hit; never wound a new target.
            const woundAge = elapsed - STANCE_WOUND_START_MS;
            if (attacking && p.attackHit && p.attackTarget === p.targetKey && enemy && stage && woundLayer && wound.naturalWidth && woundAge >= 0 && woundAge < STANCE_WOUND_MS) {
              const stageRect = stage.getBoundingClientRect();
              const size = enemy.width * 1.35;
              const cell = reduced ? 1 : Math.min(3,Math.floor(woundAge/STANCE_WOUND_MS*4));
              Object.assign(woundLayer.style, {
                left: `${enemy.left-stageRect.left+enemy.width*.52-size/2}px`,
                top: `${enemy.top-stageRect.top+enemy.height*.56-size/2}px`,
                width: `${size}px`, height: `${size}px`,
                backgroundSize: `${size*1024/508}px ${size*1024/508}px`,
                backgroundPosition: `${-(cell%2*512+2)*size/508}px ${-(Math.floor(cell/2)*512+2)*size/508}px`,
                opacity: String(reduced ? .55*(1-woundAge/STANCE_WOUND_MS) : Math.min(1,(STANCE_WOUND_MS-woundAge)/90)),
              });
            }
          } else {
            const image = attacking ? attack : state;
            const uv = stanceUv(stanceFrame(elapsed, phase, reduced));
            let dw = width * (attacking ? 2.3 : 3.0), dh = attacking ? height*1.5 : height*1.75;
            let x = left + width/2-dw/2, y = top+height/2-dh/2;
            function piece(a: number,b: number,w: number,h: number) {
              const l = Math.max(x,a), t = Math.max(y,b), r = Math.min(x+dw,a+w), bottom = Math.min(y+dh,b+h);
              if (r<=l || bottom<=t || !image.naturalWidth) return;
              const sub: [number,number,number,number] = [uv[0]+(l-x)/dw*uv[2],uv[1]+(t-y)/dh*uv[3],(r-l)/dw*uv[2],(bottom-t)/dh*uv[3]];
              if (renderer) renderer.sprite(image,l,t,r-l,bottom-t,alpha,false,sub);
              else if(ctx) { ctx.globalAlpha=alpha; ctx.drawImage(image,sub[0]*image.naturalWidth,sub[1]*image.naturalHeight,
                sub[2]*image.naturalWidth,sub[3]*image.naturalHeight,l,t,r-l,bottom-t); }
            }
            function border() {
              piece(x,y,Math.max(0,left-x),dh);
              piece(left+width,y,Math.max(0,x+dw-left-width),dh);
              piece(left,y,width,Math.max(0,top-y));
              piece(left,top+height,width,Math.max(0,y+dh-top-height));
            }
            if (attacking) piece(x,y,dw,dh);
            else {
              border();
            }
          }
        }
      }
      if (p.active || attacking || fading) raf = requestAnimationFrame(draw);
      else idleTimer = window.setTimeout(() => { if (!disposed) raf = requestAnimationFrame(draw); }, 100);
    }
    state.src = props.ascended ? ASCENDED_STANCE_ART.state : "/vfx/berserker-stance-v2/normal-state.webp";
    if (props.ascended) {
      attackPages.forEach((image, index) => { image.src = ASCENDED_STANCE_ART.attack[index]; });
      slash.src = ASCENDED_STANCE_ART.slash;
      wound.src = ASCENDED_STANCE_ART.wound;
    } else attack.src = "/vfx/berserker-stance-v2/normal-attack.webp";
    raf = requestAnimationFrame(draw);
    return () => { disposed=true;cancelAnimationFrame(raf);window.clearTimeout(idleTimer);canvas.removeEventListener("webglcontextlost",lost);
      if (props.ascended) stage?.classList.remove("berserker-ascended-active");
      if (slashLayer) slashLayer.style.opacity = "0";
      if (woundLayer) woundLayer.style.opacity = "0";
      if(renderer && !renderer.gl.isContextLost()) renderer.dispose(); };
  }, [props.ascended, fallback]);
  return [
    <canvas key={fallback ? "2d" : "gl"} ref={ref} className={`skill-effect-canvas berserker-stance-canvas${props.ascended ? " ascended" : ""}`} aria-hidden="true" />,
    props.ascended ? <div key="slash" ref={slashRef} className="berserker-stance-slash"
      style={{ backgroundImage: `url(${ASCENDED_STANCE_ART.slash})` }} aria-hidden="true" /> : null,
    props.ascended ? <div key="wound" ref={woundRef} className="berserker-stance-wound"
      style={{ backgroundImage: `url(${ASCENDED_STANCE_ART.wound})` }} aria-hidden="true" /> : null,
  ];
}
