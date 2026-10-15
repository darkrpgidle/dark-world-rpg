"use client";
import { useEffect, useRef, useState } from "react";
import { WebGLVfxRenderer } from "./webgl-vfx-renderer";
import type { LiveCombatAction } from "./skill-live-combat";

export type HunterMarkVisual = NonNullable<LiveCombatAction["hunterMark"]> & { castKey: number; pulseKey: number };
export type HunterBurstVisual = { key: number; hit: boolean };
type Props = { mark: HunterMarkVisual | null; bursts: HunterBurstVisual[];
  onImpact: (key: number) => void; onComplete: (key: number) => void; onExpire: (key: number) => void };
export const HUNTER_BURST_IMPACT_MS = 200;
export const HUNTER_BURST_DURATION_MS = 650;

export function RangerHunterMarkVfx({ mark, bursts, onImpact, onComplete, onExpire }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef({ mark, bursts }), callbacks = useRef({ onImpact, onComplete, onExpire });
  const starts = useRef(new Map<number, number>()), impacts = useRef(new Set<number>()), completed = useRef(new Set<number>());
  const markClock = useRef({ key: -1, start: 0, pulse: -1, pulseStart: 0 });
  const expired = useRef<number | null>(null), wake = useRef<(() => void) | null>(null);
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    state.current = { mark, bursts }; callbacks.current = { onImpact, onComplete, onExpire }; wake.current?.();
  }, [mark, bursts, onImpact, onComplete, onExpire]);
  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const canvas = element, stage = canvas.closest<HTMLElement>(".battle-stage");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let disposed = false, raf = 0, timer: number | undefined, fallbackTimer: number | undefined;
    let renderer: WebGLVfxRenderer | null = null, context: CanvasRenderingContext2D | null = null;
    if (!fallback) {
      try { renderer = new WebGLVfxRenderer(canvas); }
      catch { fallbackTimer = window.setTimeout(() => setFallback(true), 0); }
      if (!renderer) return () => { window.clearTimeout(fallbackTimer); };
    } else context = canvas.getContext("2d");
    const sigil = new Image(), explosion = new Image();
    let explosionFailed = false;
    const schedule = () => {
      if (disposed) return;
      window.clearTimeout(timer); cancelAnimationFrame(raf); raf = requestAnimationFrame(draw);
    };
    wake.current = schedule;
    sigil.onload = schedule; sigil.onerror = schedule;
    explosion.onload = schedule; explosion.onerror = () => { explosionFailed = true; schedule(); };
    sigil.src = "/vfx/hunter-mark-v2/frames.webp"; explosion.src = "/vfx/hunter-mark-v2/frames.webp";
    const watchdog = window.setTimeout(() => { explosionFailed = true; schedule(); }, 5000);
    const observer = new ResizeObserver(schedule); observer.observe(canvas); schedule();
    const lost = (event: Event) => { event.preventDefault(); setFallback(true); };
    canvas.addEventListener("webglcontextlost", lost);
    const impact = (key: number) => {
      if (impacts.current.has(key)) return;
      impacts.current.add(key); callbacks.current.onImpact(key);
    };
    function draw(now: number) {
      if (disposed || renderer?.gl.isContextLost()) return;
      const rect = canvas.getBoundingClientRect();
      const width = canvas.clientWidth || rect.width, height = canvas.clientHeight || rect.height;
      const sx = width / Math.max(1, rect.width), sy = height / Math.max(1, rect.height);
      const actor = stage?.querySelector<HTMLElement>(".fighter.enemy .fighter-frame")?.getBoundingClientRect();
      const cx = actor ? (actor.left - rect.left + actor.width * .5) * sx : width * .73;
      const cy = actor ? (actor.top - rect.top + actor.height * .44) * sy : height * .4;
      const size = Math.min(150, (actor ? actor.width * sx : width * .22) * .8, width * .3);
      if (renderer) { renderer.resize(width, height); renderer.clear(); }
      if (context) {
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio));
        context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height);
      }
      const sprite = (image: HTMLImageElement, frame: number, w: number, alpha: number, px = cx, py = cy, rotation = 0) => {
        if (!image.complete || !image.naturalWidth) return;
        const cw = image.naturalWidth / 4, ch = image.naturalHeight / 4;
        const x = Math.floor(frame % 4 * cw) + 1, y = Math.floor(Math.floor(frame / 4) * ch) + 1;
        const sw = Math.floor((frame % 4 + 1) * cw) - x - 1, sh = Math.floor((Math.floor(frame / 4) + 1) * ch) - y - 1;
        const h = w * sh / sw, dx = Math.max(0, Math.min(width - w, px - w / 2));
        const dy = Math.max(0, Math.min(height - h, py - h / 2));
        if (renderer) renderer.sprite(image, dx, dy, w, h, alpha, false,
          [x / image.naturalWidth, y / image.naturalHeight, sw / image.naturalWidth, sh / image.naturalHeight], rotation);
        else if (context) {
          context.save(); context.globalAlpha = alpha; context.translate(dx + w / 2, dy + h / 2); context.rotate(rotation);
          context.drawImage(image, x, y, sw, sh, -w / 2, -h / 2, w, h); context.restore();
        }
      };
      const m = state.current.mark;
      if (m && (m.expiresAt > Date.now() || m.pending)) {
        const clock = markClock.current;
        if (clock.key !== m.castKey) { clock.key = m.castKey; clock.start = now; }
        if (clock.pulse !== m.pulseKey) { clock.pulse = m.pulseKey; clock.pulseStart = now; }
        const age = now - clock.start, pulse = m.pulseKey > 0 ? Math.max(0, 1 - (now - clock.pulseStart) / 180) : 0;
        const remaining = m.expiresAt - Date.now(), fading = !m.pending && remaining < 300;
        const fade = fading ? Math.max(0, remaining / 300) : 1;
        const locked = m.ascended && (m.pending || m.criticals >= 3);
        const frame = locked ? 7 : reduced ? 2 : age < 320 ? Math.min(2, Math.floor(age / 110))
          : Math.floor(age / 1800) % 2 ? 3 : 2;
        sprite(sigil, frame, size * (reduced ? 1 : 1 - pulse * .12), fade * .85);
        if (pulse > 0 && !reduced) sprite(sigil, 6, size * .95, fade * pulse * .8);
        // Three painted blade glyphs converge during casting, orbit until ready,
        // and light only from the combat engine's actual critical count.
        for (let index = 0; index < 3; index++) {
          const angle = -Math.PI / 2 + index * Math.PI * 2 / 3 + (locked || reduced ? 0 : age * .0006);
          const radius = size * (reduced ? .58 : .58 + Math.max(0, 1 - age / 400) * .65);
          const x = cx + Math.cos(angle) * radius, y = cy + Math.sin(angle) * radius;
          const lit = m.ascended && index < m.criticals;
          sprite(sigil, lit ? 5 : 4, size * .5, fade * (lit ? 1 : .6), x, y, angle + Math.PI * 1.5);
        }
      } else if (m && expired.current !== m.castKey) {
        expired.current = m.castKey; callbacks.current.onExpire(m.castKey);
      }
      let animating = false;
      const keys = new Set(state.current.bursts.map((b) => b.key));
      for (const key of starts.current.keys()) if (!keys.has(key)) {
        starts.current.delete(key); impacts.current.delete(key); completed.current.delete(key);
      }
      for (const burst of state.current.bursts) {
        if (completed.current.has(burst.key)) continue;
        animating = true;
        if ((!explosion.complete || !explosion.naturalWidth) && !explosionFailed) continue;
        if (!starts.current.has(burst.key)) starts.current.set(burst.key, now);
        const elapsed = now - starts.current.get(burst.key)!;
        const duration = reduced ? 240 : HUNTER_BURST_DURATION_MS;
        if (reduced || elapsed >= HUNTER_BURST_IMPACT_MS) impact(burst.key);
        if (elapsed >= duration) {
          impact(burst.key); completed.current.add(burst.key); callbacks.current.onComplete(burst.key); continue;
        }
        const burstFrames = [0, 100, 200, 275, 350, 425, 500, 575];
        const frame = reduced ? (burst.hit ? 10 : 9) : 8 + Math.min(burst.hit ? 7 : 1,
          Math.max(0, burstFrames.findLastIndex(at => elapsed >= at)));
        sprite(explosion, frame, size * (burst.hit ? 1.65 : .75), Math.min(1, (duration - elapsed) / 150));
      }
      if (!reduced || animating) schedule();
      else if (m && !m.pending) timer = window.setTimeout(schedule, Math.max(1, m.expiresAt - Date.now()));
    }
    return () => {
      disposed = true; wake.current = null; cancelAnimationFrame(raf); window.clearTimeout(timer); window.clearTimeout(watchdog);
      observer.disconnect(); sigil.onload = null; sigil.onerror = null; explosion.onload = null; explosion.onerror = null;
      canvas.removeEventListener("webglcontextlost", lost);
      if (renderer && !renderer.gl.isContextLost()) renderer.dispose();
    };
  }, [fallback]);
  return <canvas key={fallback ? "canvas" : "webgl"} ref={canvasRef} className="skill-effect-canvas hunter-mark-canvas" aria-hidden="true" />;
}
