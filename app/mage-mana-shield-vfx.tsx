"use client";
import { useEffect, useRef, useState } from "react";
import { WebGLVfxRenderer } from "./webgl-vfx-renderer";
import { MANA_SHIELD_ART, manaShieldUv, type ManaShieldVisual } from "./mana-shield-frames";

export function MageManaShieldVfx({ visual }: { visual: ManaShieldVisual }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const input = useRef(visual);
  const wake = useRef<(() => void) | null>(null);
  const [fallback, setFallback] = useState(false);
  useEffect(() => { input.current = visual; wake.current?.(); }, [visual]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: WebGLVfxRenderer | null = null;
    let context: CanvasRenderingContext2D | null = null;
    let disposed = false, raf = 0;
    if (!fallback) {
      try { renderer = new WebGLVfxRenderer(canvas); }
      catch {
        const timer = window.setTimeout(() => setFallback(true), 0);
        return () => window.clearTimeout(timer);
      }
    } else { context = canvas.getContext("2d"); if (!context) return; }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const image = new Image();
    const schedule = () => { if (!disposed) { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); } };
    wake.current = schedule;
    image.onload = schedule;
    image.src = MANA_SHIELD_ART;
    const observer = new ResizeObserver(schedule); observer.observe(canvas);
    const lost = (event: Event) => { event.preventDefault(); setFallback(true); };
    canvas.addEventListener("webglcontextlost", lost);
    function draw() {
      if (disposed || !image.complete || !image.naturalWidth) return;
      const rect = canvas!.getBoundingClientRect();
      const width = canvas!.clientWidth, height = canvas!.clientHeight;
      if (!width || !height) return;
      if (renderer) { renderer.resize(width, height); renderer.clear(); }
      else if (context) {
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        if (canvas!.width !== Math.round(width * ratio) || canvas!.height !== Math.round(height * ratio)) {
          canvas!.width = Math.round(width * ratio); canvas!.height = Math.round(height * ratio);
        }
        context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height);
      }
      const player = canvas!.closest(".battle-stage")?.querySelector(".fighter.player .fighter-frame")?.getBoundingClientRect();
      if (!player) return;
      const sx = width / Math.max(1, rect.width), sy = height / Math.max(1, rect.height);
      const x = (player.left - rect.left + player.width / 2) * sx;
      const y = (player.top - rect.top + player.height / 2) * sy;
      // A square atlas contains a tall oval: widen its cell to wrap the portrait.
      const w = player.width * sx * 1.55, h = player.height * sy * 1.18;
      const state = input.current, now = Date.now();
      const age = (at: number) => at ? now - at : Infinity;
      const sprite = (frame: number, alpha: number, offset = 0) => {
        const uv = manaShieldUv(frame);
        if (renderer) renderer.sprite(image, x - w / 2 + offset, y - h / 2, w, h, alpha, false, uv);
        else if (context) {
          context.globalAlpha = alpha;
          context.drawImage(image, uv[0] * image.naturalWidth, uv[1] * image.naturalHeight,
            uv[2] * image.naturalWidth, uv[3] * image.naturalHeight, x - w / 2 + offset, y - h / 2, w, h);
        }
      };
      let animating = false;
      if (state.value > 0) {
        const forming = age(state.formedAt) < 480;
        const pulse = age(state.stackedAt) < 320;
        const frame = forming && !reduced ? Math.min(7, Math.floor(age(state.formedAt) / 60))
          : 6 + (reduced ? 0 : Math.floor(now / 160) % 6);
        sprite(frame, forming ? .85 : pulse ? .85 : state.ascended ? .65 : .5);
        animating = !reduced || forming || pulse;
      }
      if (age(state.brokenAt) < 480 && !reduced) {
        sprite(18 + Math.min(5, Math.floor(age(state.brokenAt) / 80)), 1 - age(state.brokenAt) / 480);
        animating = true;
      } else if (state.value <= 0 && age(state.resetAt) < 250) {
        sprite(6, .5 * (1 - age(state.resetAt) / 250)); animating = true;
      }
      if (age(state.hitAt) < 240 && !reduced && age(state.brokenAt) >= 480) {
        sprite([12, 13, 15, 17][Math.min(3, Math.floor(age(state.hitAt) / 60))], .8 * (1 - age(state.hitAt) / 240),
          Math.sin(age(state.hitAt) / 20) * Math.min(2, player.width * sx * .01));
        animating = true;
      }
      if (animating) schedule();
    }
    schedule();
    return () => {
      disposed = true; cancelAnimationFrame(raf); observer.disconnect(); wake.current = null;
      image.onload = null; canvas.removeEventListener("webglcontextlost", lost);
      if (renderer && !renderer.gl.isContextLost()) renderer.dispose();
    };
  }, [fallback]);
  return <canvas key={fallback ? "2d" : "webgl"} ref={canvasRef}
    className="skill-effect-canvas mana-shield-canvas" aria-hidden="true" />;
}
