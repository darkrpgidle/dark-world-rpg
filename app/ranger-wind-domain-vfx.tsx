"use client";
import { useEffect, useRef, useState } from "react";
import { WebGLVfxRenderer } from "./webgl-vfx-renderer";
import { windDomainVisiblePieces } from "./wind-domain-depth";
import type { WindDomainVisual } from "./ranger-wind-domain-state";
export const WIND_DOMAIN_ACTIVATE_MS = 400;
export const WIND_DOMAIN_FADE_MS = 250;
type Props = { visual: WindDomainVisual; onComplete: (key: number) => void };
export function RangerWindDomainVfx({ visual, onComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef(visual), callback = useRef(onComplete), wake = useRef<(() => void) | null>(null);
  const clock = useRef({ key: -1, start: 0, pulse: -1, pulseStart: 0, end: null as number | null, completed: false });
  const [fallback, setFallback] = useState(false);
  useEffect(() => { state.current = visual; callback.current = onComplete; wake.current?.(); }, [visual, onComplete]);
  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const canvas = element, stage = canvas.closest<HTMLElement>(".battle-stage");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let disposed = false, raf = 0, fallbackTimer: number | undefined;
    let renderer: WebGLVfxRenderer | null = null, context: CanvasRenderingContext2D | null = null;
    if (!fallback) {
      try { renderer = new WebGLVfxRenderer(canvas); }
      catch { fallbackTimer = window.setTimeout(() => setFallback(true), 0); }
      if (!renderer) return () => window.clearTimeout(fallbackTimer);
    } else context = canvas.getContext("2d");
    const image = new Image();
    let imageStarted = false;
    const schedule = () => { if (!disposed) { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); } };
    wake.current = schedule;
    image.onload = schedule; image.onerror = schedule;
    image.src = "/vfx/wind-domain-v3/aura.webp";
    const observer = new ResizeObserver(schedule); observer.observe(canvas); schedule();
    const lost = (event: Event) => { event.preventDefault(); setFallback(true); };
    canvas.addEventListener("webglcontextlost", lost);
    function draw(now: number) {
      if (disposed || renderer?.gl.isContextLost()) return;
      const v = state.current, c = clock.current;
      if (c.key !== v.castKey) { c.key = v.castKey; c.start = now; c.end = null; c.completed = false; }
      if (c.pulse !== v.pulseKey) { c.pulse = v.pulseKey; c.pulseStart = now; }
      if (v.ending) c.end ??= now;
      else c.end = null;
      const fade = c.end === null ? 1 : Math.max(0, 1 - (now - c.end) / WIND_DOMAIN_FADE_MS);
      if (fade === 0) {
        if (!c.completed) { c.completed = true; callback.current(v.castKey); }
        return;
      }
      if (!image.complete || !image.naturalWidth || !renderer && !context) {
        // An unavailable asset never keeps an expired buff in React state.
        if (v.ending) schedule();
        else c.start = now;
        return;
      }
      if (!imageStarted) { imageStarted = true; c.start = now; }
      const rect = canvas.getBoundingClientRect();
      const width = canvas.clientWidth || rect.width, height = canvas.clientHeight || rect.height;
      const scaleX = width / Math.max(1, rect.width), scaleY = height / Math.max(1, rect.height);
      const player = stage?.querySelector<HTMLElement>(".fighter.player .fighter-frame")?.getBoundingClientRect();
      const cx = player ? (player.left - rect.left + player.width * .5) * scaleX : width * .25;
      const cy = player ? (player.top - rect.top + player.height * .5) * scaleY : height * .43;
      const title = stage?.querySelector<HTMLElement>(".fighter.player .equipped-title")?.getBoundingClientRect();
      const protectedTitle = title ? { x: (title.left - rect.left) * scaleX - 3,
        y: (title.top - rect.top) * scaleY - 3, width: title.width * scaleX + 6, height: title.height * scaleY + 6 } : null;
      const cw = image.naturalWidth / 3, ch = image.naturalHeight / 4;
      const h = Math.min((player ? player.height * scaleY : height * .7) * .98, height * .86, width * .43 * ch / cw);
      const w = h * cw / ch;
      if (renderer) { renderer.resize(width, height); renderer.clear(); }
      if (context) {
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio));
        context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height);
      }
      const age = now - c.start, stacks = Math.min(5, Math.max(0, v.galeStacks));
      const interval = 160 - stacks * 10;
      const pulse = reduced || v.pulseKey <= 0 ? 0 : Math.max(0, 1 - (now - c.pulseStart) / 180);
      const phase = reduced ? 0 : Math.floor(Math.max(0, age - WIND_DOMAIN_ACTIVATE_MS) / interval) % 6;
      const activating = !reduced && age < WIND_DOMAIN_ACTIVATE_MS && !v.ending;
      const sprite = (frame: number, opacity: number) => {
        if (opacity <= 0) return;
        const row = Math.floor(frame / 3), sx = Math.floor(frame % 3 * cw) + 1, sy = Math.floor(row * ch) + 1;
        const sw = Math.floor((frame % 3 + 1) * cw) - sx - 1, sh = Math.floor((row + 1) * ch) - sy - 1;
        const x = Math.max(0, Math.min(width - w, cx - w / 2));
        const y = Math.max(0, Math.min(height - h, cy - h / 2));
        // Overlay airy streams around the silhouette, protecting title text.
        // Do not cut a rectangular hole matching the entire character card.
        for (const part of windDomainVisiblePieces({ x, y, width: w, height: h }, protectedTitle)) {
          const sourceX = sx + (part.x - x) / w * sw, sourceY = sy + (part.y - y) / h * sh;
          const sourceW = part.width / w * sw, sourceH = part.height / h * sh;
          if (renderer) renderer.sprite(image, part.x, part.y, part.width, part.height, opacity, false,
            [sourceX / image.naturalWidth, sourceY / image.naturalHeight,
              sourceW / image.naturalWidth, sourceH / image.naturalHeight]);
          else if (context) {
            context.globalAlpha = opacity;
            context.drawImage(image, sourceX, sourceY, sourceW, sourceH, part.x, part.y, part.width, part.height);
          }
        }
      };
      const alpha = fade * Math.min(.9, .7 + pulse * .2) * (activating ? Math.min(1, age / WIND_DOMAIN_ACTIVATE_MS) : 1);
      const gold = v.ascended ? .3 + stacks * .13 : 0;
      const blend = reduced || activating ? 0 : (Math.max(0, age - WIND_DOMAIN_ACTIVATE_MS) / interval) % 1;
      sprite(phase, alpha * (1 - gold) * (1 - blend));
      if (blend > 0) sprite((phase + 1) % 6, alpha * (1 - gold) * blend);
      if (gold > 0) {
        sprite(6 + phase, alpha * gold * (1 - blend));
        if (blend > 0) sprite(6 + (phase + 1) % 6, alpha * gold * blend);
      }
      if (!reduced || v.ending) schedule();
    }
    return () => {
      disposed = true; wake.current = null; cancelAnimationFrame(raf); observer.disconnect();
      image.onload = null; image.onerror = null; canvas.removeEventListener("webglcontextlost", lost);
      if (renderer && !renderer.gl.isContextLost()) renderer.dispose();
    };
  }, [fallback]);
  return <canvas key={fallback ? "canvas" : "webgl"} ref={canvasRef} className="skill-effect-canvas wind-domain-canvas" aria-hidden="true" />;
}
