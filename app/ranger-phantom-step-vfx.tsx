"use client";
import { useEffect, useRef, useState } from "react";
import { WebGLVfxRenderer } from "./webgl-vfx-renderer";
import type { PhantomStepVisual } from "./ranger-phantom-state";

type Props = { visual: PhantomStepVisual; portraitSrc: string; onComplete: (key: number) => void };

export function RangerPhantomStepVfx({ visual, portraitSrc, onComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef(visual), callback = useRef(onComplete);
  const burstStart = useRef<number | null>(null), completedKey = useRef<number | null>(null);
  const wake = useRef<(() => void) | null>(null);
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    if (state.current.eventKey !== visual.eventKey) burstStart.current = null;
    state.current = visual; callback.current = onComplete; wake.current?.();
  }, [visual, onComplete]);
  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const canvas = element;
    const stage = canvas.closest<HTMLElement>(".battle-stage");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let disposed = false, raf = 0;
    let renderer: WebGLVfxRenderer | null = null, context: CanvasRenderingContext2D | null = null;
    let fallbackTimer: number | undefined;
    if (!fallback) {
      try { renderer = new WebGLVfxRenderer(canvas); }
      catch { fallbackTimer = window.setTimeout(() => setFallback(true), 0); }
      if (!renderer) return () => { window.clearTimeout(fallbackTimer); };
    } else context = canvas.getContext("2d");
    const portrait = new Image(), wind = new Image();
    const schedule = () => {
      if (disposed) return;
      cancelAnimationFrame(raf); raf = requestAnimationFrame(draw);
    };
    wake.current = schedule;
    portrait.onload = schedule; wind.onload = schedule;
    // A missing image must not leave a burst mounted forever. Portrait and wind
    // load independently, so either can still provide the remaining feedback.
    portrait.onerror = schedule; wind.onerror = schedule;
    portrait.src = portraitSrc; wind.src = "/vfx/phantom-step/wind.webp";
    schedule();
    const observer = new ResizeObserver(schedule); observer.observe(canvas);
    const lost = (event: Event) => { event.preventDefault(); setFallback(true); };
    canvas.addEventListener("webglcontextlost", lost);
    function draw(now: number) {
      if (disposed || renderer?.gl.isContextLost()) return;
      const v = state.current;
      burstStart.current ??= now;
      const elapsed = now - burstStart.current;
      const duration = reduced ? 240 : v.burst === "activate" ? 450 : 550;
      const bursting = Boolean(v.burst) && elapsed < duration;
      if (v.burst && !bursting && completedKey.current !== v.eventKey) {
        completedKey.current = v.eventKey; callback.current(v.eventKey);
      }
      const rect = canvas.getBoundingClientRect();
      const width = canvas.clientWidth || rect.width, height = canvas.clientHeight || rect.height;
      const scaleX = width / Math.max(1, rect.width), scaleY = height / Math.max(1, rect.height);
      const frame = stage?.querySelector<HTMLElement>(".fighter.player .fighter-frame")?.getBoundingClientRect();
      const boxW = frame ? frame.width * scaleX : width * .22;
      const boxH = frame ? frame.height * scaleY : height * .7;
      const boxX = frame ? (frame.left - rect.left) * scaleX : width * .14;
      const boxY = frame ? (frame.top - rect.top) * scaleY : height * .1;
      if (renderer) { renderer.resize(width, height); renderer.clear(); }
      if (context) {
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio));
        context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height);
      }
      const sprite = (image: HTMLImageElement, x: number, y: number, w: number, h: number,
        alpha: number, uv: [number, number, number, number] = [0, 0, 1, 1]) => {
        if (!image.complete || !image.naturalWidth || alpha <= 0) return;
        if (renderer) renderer.sprite(image, x, y, w, h, alpha, false, uv);
        else if (context) {
          context.globalAlpha = alpha;
          context.drawImage(image, uv[0] * image.naturalWidth, uv[1] * image.naturalHeight,
            uv[2] * image.naturalWidth, uv[3] * image.naturalHeight, x, y, w, h);
        }
      };
      const dodgeBurst = bursting && v.burst !== "activate";
      if (v.active || bursting) {
        const factor = portrait.naturalWidth ? Math.min(boxW / portrait.naturalWidth, boxH / portrait.naturalHeight) : 1;
        const pw = portrait.naturalWidth * factor, ph = portrait.naturalHeight * factor;
        const px = boxX + (boxW - pw) / 2, py = boxY + boxH - ph;
        const progress = Math.min(1, elapsed / duration);
        const alpha = (v.ascended ? .27 : .18) * (dodgeBurst ? 1 - progress : 1);
        const amplitude = reduced ? 0 : Math.min(9, boxW * .045) * (dodgeBurst ? 2 : .65);
        for (const side of [-1, 1]) {
          const offset = reduced ? side * 3 : side * boxW * (dodgeBurst ? .04 + progress * .16 : .04);
          // Thin UV strips deform only the copied portrait, keeping the real
          // player and stage fixed. Canvas uses the identical source strips.
          for (let strip = 0; strip < 20; strip++) {
            if (dodgeBurst && v.burst === "shatter" && progress > .25
              && (strip * 7 % 20) / 20 < progress - .25) continue;
            const shift = reduced ? 0 : Math.sin(strip * .65 + now * (dodgeBurst ? .065 : .025) + side) * amplitude;
            const x = Math.max(0, Math.min(width - pw, px + offset + shift));
            sprite(portrait, x, py + ph * strip / 20, pw, ph / 20 + .35, alpha, [0, strip / 20, 1, 1 / 20]);
          }
        }
        const windFrame = reduced ? 2 : dodgeBurst ? (progress < .45 ? 3 : progress < .8 ? 4 : 5)
          : bursting ? Math.min(2, Math.floor(progress * 3)) : 1 + Math.floor(now / 180) % 2;
        const cw = wind.naturalWidth / 3, ch = wind.naturalHeight / 2;
        const ww = Math.min(boxW * 1.35, width * .4), wh = ww * ch / Math.max(1, cw);
        sprite(wind, Math.max(0, boxX + boxW / 2 - ww / 2), boxY + boxH - wh, ww, wh,
          dodgeBurst ? 1 - progress * .6 : .65,
          [(windFrame % 3 * cw + 1) / Math.max(1, wind.naturalWidth),
            (Math.floor(windFrame / 3) * ch + 1) / Math.max(1, wind.naturalHeight),
            Math.max(0, cw - 2) / Math.max(1, wind.naturalWidth), Math.max(0, ch - 2) / Math.max(1, wind.naturalHeight)]);
      }
      if (v.nextHitReady || v.nextSkillReady) {
        const x = boxX + boxW * .8, y = boxY + boxH * .52;
        const radius = Math.min(13, boxW * .07);
        const alpha = reduced ? .65 : .55 + Math.sin(now * .007) * .15;
        if (renderer) {
          renderer.glow(x, y, radius * 1.7, [.35, .85, 1, alpha]);
          if (v.nextSkillReady) renderer.ring(x, y, radius * 1.4, 1.5, [.8, .95, 1, alpha]);
        } else if (context) {
          context.globalAlpha = alpha; context.strokeStyle = v.nextSkillReady ? "#dcfaff" : "#68dfff";
          context.lineWidth = 2; context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.stroke();
        }
      }
      if (!reduced || bursting) schedule();
    }
    return () => {
      disposed = true; wake.current = null; cancelAnimationFrame(raf); observer.disconnect();
      portrait.onload = null; portrait.onerror = null; wind.onload = null; wind.onerror = null;
      canvas.removeEventListener("webglcontextlost", lost);
      if (renderer && !renderer.gl.isContextLost()) renderer.dispose();
    };
  }, [fallback, portraitSrc]);
  return <canvas key={fallback ? "canvas" : "webgl"} ref={canvasRef} className="skill-effect-canvas phantom-step-canvas" aria-hidden="true" />;
}
