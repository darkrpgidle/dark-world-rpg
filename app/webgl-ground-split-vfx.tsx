"use client";

import { useEffect, useRef, useState } from "react";
import { WebGLVfxRenderer } from "./webgl-vfx-renderer";
import { groundSplitRect } from "./ground-split-frames";

type Props = { effectKey: number; kind: "main" | "shock"; hit: boolean;
  onImpact?: (key: number) => void; onComplete: (key: number) => void };

// The main strike lands on frame 7; the separate ascension lands on frame 3.
export const GROUND_SPLIT_DURATION_MS = 800;
export const GROUND_SPLIT_IMPACT_MS = 360;
export const GROUND_SHOCK_DURATION_MS = 400;
export const GROUND_SHOCK_IMPACT_MS = 120;
const MAIN_STARTS = [0, 80, 160, 220, 265, 310, 360, 420, 480, 560, 640, 720];
const SHOCK_STARTS = [0, 60, 120, 180, 250, 325];

export function WebGLGroundSplitVfx({ effectKey, kind, hit, onImpact, onComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const callbacks = useRef({ onImpact, onComplete });
  const startedAt = useRef<number | null>(null);
  const impacted = useRef(false);
  const [fallback, setFallback] = useState(false);
  useEffect(() => { callbacks.current = { onImpact, onComplete }; }, [onImpact, onComplete]);

  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;
    const canvas = canvasElement;
    let disposed = false, completed = false, raf = 0;
    let shake: Animation | null = null;
    let renderer: WebGLVfxRenderer | null = null;
    let context: CanvasRenderingContext2D | null = null;
    const stage = canvas.closest<HTMLElement>(".battle-stage");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const main = kind === "main";
    const starts = main ? MAIN_STARTS : SHOCK_STARTS;
    const duration = main ? GROUND_SPLIT_DURATION_MS : GROUND_SHOCK_DURATION_MS;
    const impactAt = main ? GROUND_SPLIT_IMPACT_MS : GROUND_SHOCK_IMPACT_MS;
    const notifyImpact = () => {
      if (impacted.current) return;
      impacted.current = true;
      callbacks.current.onImpact?.(effectKey);
    };
    const finish = () => {
      if (disposed || completed) return;
      completed = true;
      notifyImpact();
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
    const image = new Image();
    const schedule = () => {
      if (disposed || completed) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    };
    const watchdog = window.setTimeout(finish, 5000);
    image.onload = () => { window.clearTimeout(watchdog); schedule(); };
    image.onerror = finish;
    image.src = `/vfx/ground-split-v3/${main ? "main" : "shock"}.webp`;
    const observer = new ResizeObserver(schedule);
    observer.observe(canvas);
    const contextLost = (event: Event) => { event.preventDefault(); setFallback(true); };
    canvas.addEventListener("webglcontextlost", contextLost);

    function draw(now: number) {
      if (disposed || completed || !image.complete || !image.naturalWidth || renderer?.gl.isContextLost()) return;
      startedAt.current ??= now;
      const elapsed = now - startedAt.current;
      // A missed strike fades before its painted shield-breaking impact frames.
      const end = reducedMotion ? 280 : main && !hit ? impactAt : duration;
      if (elapsed >= end) { finish(); return; }
      const frame = reducedMotion ? (hit ? (main ? 6 : 2) : 3)
        : Math.max(0, starts.findLastIndex((at) => elapsed >= at));
      if (reducedMotion || elapsed >= impactAt) {
        const firstImpact = !impacted.current;
        notifyImpact();
        if (firstImpact && hit && !reducedMotion && elapsed - impactAt < 120 && stage?.animate) {
          const amplitude = (canvas.clientWidth < 600 ? 4 : 7) * (main ? 1 : 0.7);
          shake = stage.animate([{ translate: "0 0" }, { translate: `${-amplitude}px 2px` },
            { translate: `${amplitude}px -2px` }, { translate: `${-amplitude * .5}px 1px` },
            { translate: "0 0" }], { duration: main ? 180 : 140, easing: "linear" });
        }
      }
      const rect = canvas.getBoundingClientRect();
      const width = canvas.clientWidth || rect.width, height = canvas.clientHeight || rect.height;
      const scaleX = width / Math.max(1, rect.width), scaleY = height / Math.max(1, rect.height);
      const player = stage?.querySelector<HTMLElement>(".fighter.player .fighter-frame")?.getBoundingClientRect();
      const enemy = stage?.querySelector<HTMLElement>(".fighter.enemy .fighter-frame")?.getBoundingClientRect();
      const playerX = player ? (player.left - rect.left + player.width * .7) * scaleX : width * .25;
      const enemyX = enemy ? (enemy.left - rect.left + enemy.width * .5) * scaleX : width * .73;
      const groundY = enemy ? Math.min(height - 5, (enemy.bottom - rect.top) * scaleY) : height * .8;
      const enemyWidth = enemy ? enemy.width * scaleX : width * .25;
      const travel = main ? Math.min(1, Math.max(0, (frame - 2) / 4)) : 1;
      const centerX = playerX + (enemyX - playerX) * travel;
      const source = groundSplitRect(kind, frame, image.naturalWidth, image.naturalHeight);
      const { x: sourceX, y: sourceY, width: sourceWidth, height: sourceHeight } = source;
      const drawWidth = Math.min(width * .65, enemyWidth * (main ? 1.8 : 1.65));
      const drawHeight = Math.min(height * .65, drawWidth * sourceHeight / sourceWidth);
      const actualWidth = drawHeight * sourceWidth / sourceHeight;
      const x = Math.max(0, Math.min(width - actualWidth, centerX - actualWidth / 2));
      // Align each painted ground line, independent of the cropped cell height.
      const y = Math.max(0, Math.min(height - drawHeight, groundY - drawHeight * source.groundAnchor));
      const fade = reducedMotion ? 1 : main && !hit ? Math.min(1, (end - elapsed) / 100)
        : Math.min(1, (duration - elapsed) / (main ? 150 : 90));
      if (renderer) {
        renderer.resize(width, height); renderer.clear();
        renderer.sprite(image, x, y, actualWidth, drawHeight, fade, false,
          [sourceX / image.naturalWidth, sourceY / image.naturalHeight,
            sourceWidth / image.naturalWidth, sourceHeight / image.naturalHeight]);
      } else if (context) {
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio));
        context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height);
        context.globalAlpha = fade;
        context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, actualWidth, drawHeight);
      }
      schedule();
    }
    return () => {
      disposed = true; cancelAnimationFrame(raf); window.clearTimeout(watchdog);
      observer.disconnect(); shake?.cancel();
      canvas.removeEventListener("webglcontextlost", contextLost);
      image.onload = null; image.onerror = null;
      if (renderer && !renderer.gl.isContextLost()) renderer.dispose();
    };
  }, [effectKey, kind, hit, fallback]);

  return <canvas key={fallback ? "canvas" : "webgl"} ref={canvasRef} className="skill-effect-canvas ground-split-canvas" aria-hidden="true" />;
}
