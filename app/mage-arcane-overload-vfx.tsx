"use client";
import { useEffect, useRef, useState } from "react";
import { WebGLVfxRenderer } from "./webgl-vfx-renderer";
import { OVERLOAD_ART, overloadUv, overloadGeometry, type OverloadVisual } from "./arcane-overload-frames";
export function MageArcaneOverloadVfx({ visual }: { visual: OverloadVisual }) {
  const canvasRef = useRef<HTMLCanvasElement>(null), input = useRef(visual), wake = useRef<(() => void) | null>(null);
  const [fallback, setFallback] = useState(false);
  useEffect(() => { input.current = visual; wake.current?.(); }, [visual]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: WebGLVfxRenderer | null = null, context: CanvasRenderingContext2D | null = null;
    let disposed = false, raf = 0, expiryTimer: number | undefined;
    if (!fallback) {
      try { renderer = new WebGLVfxRenderer(canvas); }
      catch { const timer = window.setTimeout(() => setFallback(true), 0); return () => window.clearTimeout(timer); }
    } else { context = canvas.getContext("2d"); if (!context) return; }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const image = new Image();
    const schedule = () => { if (!disposed) { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); } };
    wake.current = schedule; image.onload = schedule; image.src = OVERLOAD_ART;
    const observer = new ResizeObserver(schedule); observer.observe(canvas);
    const playerElement = canvas.closest(".battle-stage")?.querySelector(".fighter.player .fighter-frame");
    if (playerElement) observer.observe(playerElement);
    const lost = (event: Event) => { event.preventDefault(); setFallback(true); };
    canvas.addEventListener("webglcontextlost", lost);
    function draw() {
      if (disposed || !image.complete || !image.naturalWidth) return;
      const rect = canvas!.getBoundingClientRect(), width = canvas!.clientWidth, height = canvas!.clientHeight;
      if (!width || !height) return;
      if (renderer) { renderer.resize(width, height); renderer.clear(); }
      else if (context) {
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        const pw = Math.round(width * ratio), ph = Math.round(height * ratio);
        if (canvas!.width !== pw || canvas!.height !== ph) { canvas!.width = pw; canvas!.height = ph; }
        context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height);
      }
      const player = canvas!.closest(".battle-stage")?.querySelector(".fighter.player .fighter-frame")?.getBoundingClientRect();
      if (!player) return;
      const { x, y, pw, ph, w, h } = overloadGeometry(player, rect, width, height);
      const state = input.current, now = Date.now();
      if (!state.enabled) return;
      const sprite = (frame: number, dx: number, dy: number, dw: number, dh: number, alpha: number, part?: "left" | "right") => {
        const uv = overloadUv(frame);
        // Protect the entire portrait center, including its clipped border. Only outer flames draw.
        if (part) { if (part === "right") uv[0] += uv[2] * .72; uv[2] *= .28; }
        if (renderer) renderer.sprite(image, dx, dy, dw, dh, alpha, false, uv);
        else if (context) {
          context.globalAlpha = alpha;
          context.drawImage(image, uv[0] * image.naturalWidth, uv[1] * image.naturalHeight,
            uv[2] * image.naturalWidth, uv[3] * image.naturalHeight, dx, dy, dw, dh);
        }
      };
      const age = (at: number) => at ? now - at : Infinity;
      let frame = 0, alpha = 0, animating = false;
      const activating = state.phase === "overloaded" && age(state.activatedAt) < 480;
      if (state.phase === "overloaded") {
        frame = activating && !reduced ? 6 + Math.min(5, Math.floor(age(state.activatedAt) / 80))
          : (state.ascended ? 18 : 12) + (reduced ? 0 : Math.floor(now / 120) % 6);
        alpha = activating ? .95 : state.ascended ? .8 : .65; animating = !reduced;
      } else if (state.phase === "exhausted" && (!state.expiresAt || now < state.expiresAt)) {
        frame = 24 + (reduced ? 0 : Math.min(2, Math.floor(age(state.exhaustedAt) / 140)));
        alpha = .35 * (state.expiresAt ? Math.min(1, (state.expiresAt - now) / 350) : 1); animating = !reduced;
      } else if (age(state.clearedAt) < 300) {
        frame = 26; alpha = .3 * (1 - age(state.clearedAt) / 300); animating = true;
      } else if (state.phase === "idle" && state.charge > 0) {
        frame = state.charge * 2 - 2 + (reduced ? 0 : Math.floor(now / 160) % 2); alpha = .22 + state.charge * .08; animating = !reduced;
      }
      if (alpha > 0) {
        sprite(frame, x - w / 2, y - h / 2, w * .28, h, alpha, "left");
        sprite(frame, x + w * .22, y - h / 2, w * .28, h, alpha, "right");
      }
      const glyphSize = Math.max(12, pw * .17);
      const slots = [{ x: x - pw * .62, y: y - ph * .25 }, { x, y: y - ph * .47 }, { x: x + pw * .62, y: y - ph * .25 }];
      const count = state.phase === "overloaded" ? state.remaining : state.phase === "idle" ? state.charge : 0;
      for (let i = 0; i < count; i++) sprite(27, slots[i].x - glyphSize / 2, slots[i].y - glyphSize / 2, glyphSize, glyphSize, .9);
      if (!reduced && age(state.consumedAt) < 260) {
        const slot = slots[Math.min(2, state.consumedSlot)], size = glyphSize * (1 + age(state.consumedAt) / 260 * .35);
        sprite(29, slot.x - size / 2, slot.y - size / 2, size, size, 1 - age(state.consumedAt) / 260); animating = true;
      }
      if (state.phase === "overloaded" && state.ascended) {
        for (let i = 0; i < state.stability; i++) {
          const dx = x + (i < 3 ? -1 : 1) * pw * .66, dy = y + (i % 3 - 1) * ph * .19;
          sprite(28, dx - glyphSize * .35, dy - glyphSize * .35, glyphSize * .7, glyphSize * .7, .8);
        }
      }
      window.clearTimeout(expiryTimer);
      if (animating) schedule();
      else if (state.phase === "exhausted" && state.expiresAt > now) expiryTimer = window.setTimeout(schedule, state.expiresAt - now + 1);
    }
    schedule();
    return () => {
      disposed = true; cancelAnimationFrame(raf); window.clearTimeout(expiryTimer); observer.disconnect(); wake.current = null;
      image.onload = null; canvas.removeEventListener("webglcontextlost", lost);
      if (renderer && !renderer.gl.isContextLost()) renderer.dispose();
    };
  }, [fallback]);
  return <canvas key={fallback ? "2d" : "webgl"} ref={canvasRef} className="skill-effect-canvas arcane-overload-canvas" aria-hidden="true" />;
}
