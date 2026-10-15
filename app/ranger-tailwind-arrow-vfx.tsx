"use client";
import { useEffect, useRef, useState } from "react";
import { WebGLVfxRenderer } from "./webgl-vfx-renderer";
const MAIN = { impact: 270, duration: 850 };
const ECHO = { impact: 170, duration: 750 };
const CHARGE = { impact: 150, duration: 320, starts: [0, 75, 150, 235] };
const WIND_FRAME_MS = 60;
type Props = { kind: "main" | "echo" | "charge"; effectKey: number; hit: boolean; onImpact: (key: number) => void; onComplete: (key: number) => void };

export function RangerTailwindArrowVfx({ kind, effectKey, hit, onImpact, onComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const callbacks = useRef({ onImpact, onComplete });
  const startedAt = useRef<number | null>(null);
  const impacted = useRef(false);
  const [fallback, setFallback] = useState(false);
  useEffect(() => { callbacks.current = { onImpact, onComplete }; }, [onImpact, onComplete]);
  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const canvas = element, stage = canvas.closest<HTMLElement>(".battle-stage");
    const config = kind === "main" ? MAIN : kind === "echo" ? ECHO : CHARGE;
    const charge = kind === "charge", echo = kind === "echo";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let disposed = false, completed = false, raf = 0;
    let renderer: WebGLVfxRenderer | null = null, context: CanvasRenderingContext2D | null = null;
    const impact = () => {
      if (impacted.current) return;
      impacted.current = true;
      callbacks.current.onImpact(effectKey);
    };
    const finish = () => {
      if (disposed || completed) return;
      completed = true; impact(); callbacks.current.onComplete(effectKey);
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
      cancelAnimationFrame(raf); raf = requestAnimationFrame(draw);
    };
    // Covers both slow loading and stalled RAF; never holds the combat loop.
    const watchdog = window.setTimeout(finish, 5000);
    image.onload = schedule;
    image.onerror = finish;
    image.src = charge ? "/vfx/tailwind-arrow/charge.webp"
      : echo ? "/vfx/tailwind-arrow-v3/ascended.webp" : "/vfx/tailwind-arrow-v3/frames.webp";
    const observer = new ResizeObserver(schedule);
    observer.observe(canvas);
    const lost = (event: Event) => { event.preventDefault(); setFallback(true); };
    canvas.addEventListener("webglcontextlost", lost);
    function draw(now: number) {
      if (disposed || completed || !image.complete || !image.naturalWidth || renderer?.gl.isContextLost()) return;
      startedAt.current ??= now;
      const elapsed = now - startedAt.current;
      if (elapsed >= (reduced ? 240 : config.duration)) { finish(); return; }
      if (reduced || elapsed >= config.impact) impact();
      const rect = canvas.getBoundingClientRect();
      const width = canvas.clientWidth || rect.width, height = canvas.clientHeight || rect.height;
      const scaleX = width / Math.max(1, rect.width), scaleY = height / Math.max(1, rect.height);
      const player = stage?.querySelector<HTMLElement>(".fighter.player .fighter-frame")?.getBoundingClientRect();
      const enemy = stage?.querySelector<HTMLElement>(".fighter.enemy .fighter-frame")?.getBoundingClientRect();
      const fromX = player ? (player.left - rect.left + player.width * .72) * scaleX : width * .27;
      const fromY = player ? (player.top - rect.top + player.height * .48) * scaleY : height * .43;
      const toX = enemy ? (enemy.left - rect.left + enemy.width * .5) * scaleX : width * .73;
      const toY = enemy ? (enemy.top - rect.top + enemy.height * .48) * scaleY : height * .43;
      const dx = toX - fromX, dy = toY - fromY;
      const angle = Math.atan2(dy, dx);
      if (renderer) { renderer.resize(width, height); renderer.clear(); }
      else if (context) {
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        const pw = Math.max(1, Math.round(width * ratio)), ph = Math.max(1, Math.round(height * ratio));
        if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
        context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height);
      }
      // All layers use the same atlas rectangles in WebGL and the 2D fallback.
      const sprite = (frame: number, cx: number, cy: number, w: number, h: number, opacity = 1, rotation = 0) => {
        if (opacity <= 0) return;
        const columns = charge ? 2 : 4, rows = charge ? 2 : 3;
        const cw = image.naturalWidth / columns, ch = image.naturalHeight / rows;
        const sx = Math.floor(frame % columns * cw) + 1, sy = Math.floor(Math.floor(frame / columns) * ch) + 1;
        const sw = Math.floor((frame % columns + 1) * cw) - sx - 1;
        const sh = Math.floor((Math.floor(frame / columns) + 1) * ch) - sy - 1;
        if (renderer) renderer.sprite(image, cx - w / 2, cy - h / 2, w, h, opacity, false,
          [sx / image.naturalWidth, sy / image.naturalHeight, sw / image.naturalWidth, sh / image.naturalHeight], rotation);
        else if (context) {
          context.save(); context.globalAlpha = opacity;
          context.translate(cx, cy); context.rotate(rotation);
          context.drawImage(image, sx, sy, sw, sh, -w / 2, -h / 2, w, h); context.restore();
        }
      };
      if (charge) {
        const frame = reduced ? 2 : Math.max(0, CHARGE.starts.findLastIndex(at => elapsed >= at));
        const w = Math.min(64, width * .15), h = w * (image.naturalHeight / 2 - 2) / (image.naturalWidth / 2 - 2);
        sprite(frame, fromX, fromY, w, h, reduced ? 1 : Math.min(1, (CHARGE.duration - elapsed) / 100));
      } else {
        const travel = reduced ? 1 : Math.min(hit ? 1 : 1.3, elapsed / config.impact);
        if ((!hit || elapsed < config.impact) && !reduced) {
          const w = Math.min(echo ? 130 : 150, width * .34);
          const opacity = hit ? 1 : Math.max(0, 1 - Math.max(0, elapsed - config.impact) / 180);
          const tipOffset = w * .44;
          const cx = fromX + dx * travel - Math.cos(angle) * tipOffset;
          const cy = fromY + dy * travel - Math.sin(angle) * tipOffset;
          const flightFrame = Math.floor(elapsed / 75) % 2;
          // Short moving afterimages follow the wind arrow; no deposited armor wake.
          for (const [behind, alpha] of [[.13, .16], [.065, .32]]) {
            const q = Math.max(0, travel - behind);
            sprite(flightFrame, fromX + dx * q - Math.cos(angle) * tipOffset,
              fromY + dy * q - Math.sin(angle) * tipOffset, w, w, opacity * alpha, angle);
          }
          sprite(flightFrame, cx, cy, w, w, opacity, angle);
          const spiralFrame = 2 + Math.floor(elapsed / 60) % 2;
          sprite(spiralFrame, cx - Math.cos(angle) * w * .08,
            cy - Math.sin(angle) * w * .08, w * .82, w * .62, opacity * .75,
            angle + Math.sin(elapsed / 45) * .12);
        }
        const age = elapsed - config.impact;
        if (hit && (reduced || (age >= 0 && age < WIND_FRAME_MS * 8))) {
          const frame = reduced ? 6 : 4 + Math.min(7, Math.floor(age / WIND_FRAME_MS));
          const enemyWidth = enemy ? enemy.width * scaleX : width * .22;
          const w = Math.min(enemyWidth * (echo ? 1.15 : 1), echo ? 185 : 160, width * .32, height * .5);
          // Three wind-blade crescents bloom on contact, with no armor artwork.
          sprite(frame, toX, toY, w, w, reduced ? .85 : Math.min(1, (WIND_FRAME_MS * 8 - age) / 100));
        }
      }
      schedule();
    }
    return () => {
      disposed = true; cancelAnimationFrame(raf); window.clearTimeout(watchdog);
      observer.disconnect(); image.onload = null; image.onerror = null;
      canvas.removeEventListener("webglcontextlost", lost);
      if (renderer && !renderer.gl.isContextLost()) renderer.dispose();
    };
  }, [effectKey, hit, kind, fallback]);
  return <canvas key={fallback ? "canvas" : "webgl"} ref={canvasRef} className="skill-effect-canvas tailwind-arrow-canvas" aria-hidden="true" />;
}
