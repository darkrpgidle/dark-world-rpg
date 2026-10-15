"use client";
import { useEffect, useRef, useState } from "react";
import { WebGLVfxRenderer } from "./webgl-vfx-renderer";
export const PIERCING_ARROW_IMPACT_MS = 180;
export const PIERCING_ARROW_DURATION_MS = 960;
const WAKE_LIFETIME = 700;
const ARMOR_FRAME_MS = 85;
type Props = { ascended?: boolean; effectKey: number; hit: boolean; onImpact: (key: number) => void; onComplete: (key: number) => void };

export function RangerPiercingArrowVfx({ ascended = false, effectKey, hit, onImpact, onComplete }: Props) {
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
    const config = { impact: PIERCING_ARROW_IMPACT_MS, duration: PIERCING_ARROW_DURATION_MS };
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
    image.src = ascended ? "/vfx/piercing-arrow-v3/ascended.webp" : "/vfx/piercing-arrow-v3/frames.webp";
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
      const distance = Math.hypot(dx, dy), angle = Math.atan2(dy, dx);
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
        const columns = 4, rows = 3;
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
      const travel = reduced ? 1 : Math.min(hit ? 1 : 1.3, elapsed / config.impact);
      // Deposit wake segments at their own flight timestamps. Older launch-end
      // segments fade first; none of them follow the arrow after deposition.
      if (!reduced && distance > 0) {
        const segments = 24, end = hit ? 1 : 1.3;
        for (let i = 0; i < segments; i++) {
          const q = (i + .5) / segments * end, born = q * config.impact;
          if (elapsed < born) continue;
          const age = elapsed - born, alpha = Math.pow(Math.max(0, 1 - age / WAKE_LIFETIME), 1.35);
          sprite(2 + i % 2, fromX + dx * q, fromY + dy * q,
            distance * end / segments * 2.4, Math.min(ascended ? 34 : 40, height * .13), alpha * (ascended ? .7 : .6), angle);
        }
      }
      if ((!hit || elapsed < config.impact) && !reduced) {
        const w = Math.min(ascended ? 130 : 150, width * .34);
        const opacity = hit ? 1 : Math.max(0, 1 - Math.max(0, elapsed - config.impact) / 180);
        // Painted tip is at 94% of the cell; rotate the anchor offset too.
        sprite(ascended ? 1 : 0, fromX + dx * travel - Math.cos(angle) * w * .44,
          fromY + dy * travel - Math.sin(angle) * w * .44, w, w, opacity, angle);
      }
      const age = elapsed - config.impact;
      const armorFrames = 8, firstArmorFrame = 4;
      if (hit && (reduced || (age >= 0 && age < ARMOR_FRAME_MS * armorFrames))) {
        const frame = reduced ? 6 : firstArmorFrame + Math.min(armorFrames - 1, Math.floor(age / ARMOR_FRAME_MS));
        const enemyWidth = enemy ? enemy.width * scaleX : width * .22;
        const w = Math.min(enemyWidth * (ascended ? 1.9 : 1.7), 260, width * .4, height * .7);
        // Fixed enemy chest anchor throughout the split, including resizing.
        sprite(frame, toX, toY, w, w, reduced ? .85 : Math.min(1, (ARMOR_FRAME_MS * armorFrames - age) / 110));
      }
      schedule();
    }
    return () => {
      disposed = true; cancelAnimationFrame(raf); window.clearTimeout(watchdog);
      observer.disconnect(); image.onload = null; image.onerror = null;
      canvas.removeEventListener("webglcontextlost", lost);
      if (renderer && !renderer.gl.isContextLost()) renderer.dispose();
    };
  }, [effectKey, hit, ascended, fallback]);
  return <canvas key={fallback ? "canvas" : "webgl"} ref={canvasRef} className="skill-effect-canvas piercing-arrow-canvas" aria-hidden="true" />;
}
