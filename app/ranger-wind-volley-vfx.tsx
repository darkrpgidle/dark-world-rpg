"use client";
import { useEffect, useRef, useState } from "react";
import { WebGLVfxRenderer } from "./webgl-vfx-renderer";
export const VOLLEY_INTERVAL_MS = 70;
export const VOLLEY_FLIGHT_MS = 160;
type Arrow = { hit: boolean; critical: boolean; sixth: boolean };
type Props = { effectKey: number; shotCount?: number; arrows?: Arrow[];
  onImpact: (key: number, index: number) => void; onComplete: (key: number) => void };
// Painted anchors in the 3x2 atlases, normalized within each cell.
const GREEN_ANCHORS = [[.87,.485],[.87,.485],[.87,.485],[.70,.445],[.605,.445],[.64,.51]];
const SIXTH_ANCHORS = [[.985,.61],[.985,.61],[.97,.61],[.84,.525],[.85,.56],[.65,.53]];
export function RangerWindVolleyVfx({ effectKey, shotCount = 5, arrows, onImpact, onComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const callbacks = useRef({ onImpact, onComplete });
  const started = useRef<number | null>(null);
  const impacted = useRef(new Set<number>());
  const [fallback, setFallback] = useState(false);
  useEffect(() => { callbacks.current = { onImpact, onComplete }; }, [onImpact, onComplete]);
  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const canvas = element;
    const stage = canvas.closest<HTMLElement>(".battle-stage");
    const shots = arrows ?? Array.from({ length: shotCount }, () => ({ hit: true, critical: false, sixth: false }));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let disposed = false, completed = false, raf = 0;
    let renderer: WebGLVfxRenderer | null = null, context: CanvasRenderingContext2D | null = null;
    const animations: Animation[] = [];
    const impact = (index: number, shake = true) => {
      if (impacted.current.has(index)) return;
      impacted.current.add(index); callbacks.current.onImpact(effectKey, index);
      const enemy = stage?.querySelector<HTMLElement>(".fighter.enemy .fighter-frame");
      if (shake && shots[index].hit && !reduced && enemy?.animate) {
        const sixth=shots[index].sixth;
        animations.push(enemy.animate([{ transform: "translate(0,0)",filter:"brightness(1)" },
          { transform: sixth?"translate(5px,-3px)":"translate(2px,-1px)",filter:sixth?"brightness(1.7)":"brightness(1.22)" },
          { transform: sixth?"translate(-4px,2px)":"translate(-1px,1px)",filter:"brightness(1.08)" },
          { transform: "translate(0,0)",filter:"brightness(1)" }], { duration: sixth ? 180 : 60 }));
        if(sixth && stage?.animate) {
          const power=(canvas.clientWidth||canvas.getBoundingClientRect().width)<600?4:7;
          animations.push(stage.animate([{transform:"translate(0,0)"},
            {transform:`translate(${-power}px,2px)`},{transform:`translate(${power}px,-2px)`},
            {transform:`translate(${-power*.4}px,1px)`},{transform:"translate(0,0)"}],{duration:180}));
        }
      }
    };
    const finish = () => {
      if (disposed || completed) return;
      completed = true; shots.forEach((_, index) => impact(index, false));
      callbacks.current.onComplete(effectKey);
    };
    let fallbackTimer: number | undefined;
    if (!fallback) {
      try { renderer = new WebGLVfxRenderer(canvas); }
      catch { fallbackTimer = window.setTimeout(() => setFallback(true), 0); }
      if (!renderer) return () => { window.clearTimeout(fallbackTimer); };
    } else {
      context = canvas.getContext("2d");
      if (!context) { finish(); return; }
    }
    const images = [new Image(), new Image()];
    const schedule = () => { if (!disposed && !completed) { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); } };
    const ready = () => {
      if (images.every((image, index) => index === 1 && !shots.some((shot) => shot.sixth) || image.complete && image.naturalWidth > 0)) {
        window.clearTimeout(watchdog); schedule();
      }
    };
    const watchdog = window.setTimeout(finish, 5000);
    images.forEach((image) => { image.onload = ready; image.onerror = finish; });
    images[0].src = "/vfx/wind-volley-v2/arrows.webp";
    if (shots.some((shot) => shot.sixth)) images[1].src = "/vfx/wind-volley-v2/sixth.webp";
    const observer = new ResizeObserver(schedule); observer.observe(canvas);
    const lost = (event: Event) => { event.preventDefault(); setFallback(true); };
    canvas.addEventListener("webglcontextlost", lost);
    function draw(now: number) {
      if (disposed || completed || !images[0].complete || !images[0].naturalWidth || renderer?.gl.isContextLost()) return;
      if (shots.some((shot) => shot.sixth) && (!images[1].complete || !images[1].naturalWidth)) return;
      started.current ??= now;
      const elapsed = now - started.current;
      const duration = reduced ? 240 : 30 + (shots.length - 1) * VOLLEY_INTERVAL_MS + VOLLEY_FLIGHT_MS + 240;
      if (elapsed >= duration) { finish(); return; }
      const rect = canvas.getBoundingClientRect();
      const width = canvas.clientWidth || rect.width, height = canvas.clientHeight || rect.height;
      const scaleX = width / Math.max(1, rect.width), scaleY = height / Math.max(1, rect.height);
      const player = stage?.querySelector<HTMLElement>(".fighter.player .fighter-frame")?.getBoundingClientRect();
      const enemy = stage?.querySelector<HTMLElement>(".fighter.enemy .fighter-frame")?.getBoundingClientRect();
      const fromX = player ? (player.left - rect.left + player.width * .75) * scaleX : width * .27;
      const fromY = player ? (player.top - rect.top + player.height * .53) * scaleY : height * .46;
      const toX = enemy ? (enemy.left - rect.left + enemy.width * .5) * scaleX : width * .73;
      if (renderer) { renderer.resize(width, height); renderer.clear(); }
      else if (context) {
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio));
        context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height);
      }
      shots.forEach((shot, index) => {
        const age = reduced ? VOLLEY_FLIGHT_MS : elapsed - 30 - index * VOLLEY_INTERVAL_MS;
        if (age >= VOLLEY_FLIGHT_MS) impact(index);
        if (age < 0 || age >= VOLLEY_FLIGHT_MS + 240) return;
        const primaryCount = shots.filter((arrow) => !arrow.sixth).length;
        const targetHeight = shot.sixth ? .40 : .78 - index * .54 / Math.max(1, primaryCount - 1);
        const toY = enemy ? (enemy.top - rect.top + enemy.height * targetHeight) * scaleY : height * (.68 - index * .36 / Math.max(1, primaryCount - 1));
        const travel = reduced ? 1 : Math.min(shot.hit ? 1 : 1.3, age / VOLLEY_FLIGHT_MS);
        const tipX = fromX + (toX - fromX) * travel, tipY = fromY + (toY - fromY) * travel;
        const frame = age < VOLLEY_FLIGHT_MS || !shot.hit ? Math.min(2, Math.floor(age / 54)) : Math.min(5, 3 + Math.floor((age - VOLLEY_FLIGHT_MS) / 80));
        const image = images[shot.sixth ? 1 : 0];
        const cw = image.naturalWidth / 3, ch = image.naturalHeight / 2;
        const sx = frame % 3 * cw + 1, sy = Math.floor(frame / 3) * ch + 1, sw = cw - 2, sh = ch - 2;
        const w = Math.min(width * (shot.sixth?.46:.40), shot.sixth ? 260 : 180, Math.max(80, (toX - fromX) * (shot.sixth ? .78 : .53)));
        const h = w * sh / sw;
        const anchors = shot.sixth ? SIXTH_ANCHORS : GREEN_ANCHORS;
        const angle = Math.atan2(toY - fromY, toX - fromX);
        const dx = w * (anchors[frame][0] - .5), dy = h * (anchors[frame][1] - .5);
        const x = tipX - dx * Math.cos(angle) + dy * Math.sin(angle) - w / 2;
        const y = tipY - dx * Math.sin(angle) - dy * Math.cos(angle) - h / 2;
        const opacity = reduced ? .75 : Math.min(1, (VOLLEY_FLIGHT_MS + 240 - age) / 100);
        if (renderer) renderer.sprite(image, x, y, w, h, opacity, false,
          [sx / image.naturalWidth, sy / image.naturalHeight, sw / image.naturalWidth, sh / image.naturalHeight], angle);
        else if (context) {
          context.save(); context.globalAlpha = opacity; context.translate(x + w / 2, y + h / 2); context.rotate(angle);
          context.drawImage(image, sx, sy, sw, sh, -w / 2, -h / 2, w, h); context.restore();
        }
      });
      schedule();
    }
    return () => {
      disposed = true; cancelAnimationFrame(raf); window.clearTimeout(watchdog); observer.disconnect();
      images.forEach((image) => { image.onload = null; image.onerror = null; });
      animations.forEach((animation) => animation.cancel());
      canvas.removeEventListener("webglcontextlost", lost);
      if (renderer && !renderer.gl.isContextLost()) renderer.dispose();
    };
  }, [effectKey, shotCount, arrows, fallback]);
  return <canvas key={fallback ? "canvas" : "webgl"} ref={canvasRef} className="skill-effect-canvas wind-volley-canvas" aria-hidden="true" />;
}
