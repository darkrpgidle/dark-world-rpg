"use client";
import { useEffect, useRef, useState } from "react";
import { WebGLVfxRenderer } from "./webgl-vfx-renderer";
import { ELEMENT_SIGIL_ART, elementSigilUv, type ElementSigilVisual } from "./element-sigil-frames";

export function MageElementSigilVfx({ visual }: { visual: ElementSigilVisual }) {
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
    let expiryTimer: number | undefined;
    if (!fallback) {
      try { renderer = new WebGLVfxRenderer(canvas); }
      catch { const timer = window.setTimeout(() => setFallback(true), 0); return () => window.clearTimeout(timer); }
    } else { context = canvas.getContext("2d"); if (!context) return; }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const image = new Image();
    const schedule = () => { if (!disposed) { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); } };
    wake.current = schedule; image.onload = schedule; image.src = ELEMENT_SIGIL_ART;
    const observer = new ResizeObserver(schedule); observer.observe(canvas);
    const lost = (event: Event) => { event.preventDefault(); setFallback(true); };
    canvas.addEventListener("webglcontextlost", lost);
    function draw() {
      if (disposed || !image.complete || !image.naturalWidth) return;
      const rect = canvas!.getBoundingClientRect(), width = canvas!.clientWidth, height = canvas!.clientHeight;
      if (!width || !height) return;
      if (renderer) { renderer.resize(width, height); renderer.clear(); }
      else if (context) {
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        if (canvas!.width !== Math.round(width * ratio) || canvas!.height !== Math.round(height * ratio)) {
          canvas!.width = Math.round(width * ratio); canvas!.height = Math.round(height * ratio);
        }
        context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height);
      }
      const stage = canvas!.closest(".battle-stage");
      const player = stage?.querySelector(".fighter.player .fighter-frame")?.getBoundingClientRect();
      const enemy = stage?.querySelector(".fighter.enemy .fighter-frame")?.getBoundingClientRect();
      if (!player || !enemy) return;
      const sx = width / Math.max(1, rect.width), sy = height / Math.max(1, rect.height);
      const from = { x: (player.left - rect.left + player.width * .78) * sx, y: (player.top - rect.top + player.height * .45) * sy };
      const to = { x: (enemy.left - rect.left + enemy.width * .5) * sx, y: (enemy.top - rect.top + enemy.height * .46) * sy };
      const size = Math.min(enemy.width * sx * .8, enemy.height * sy * .45);
      const sprite = (frame: number, x: number, y: number, w: number, h: number, alpha = 1, angle = 0) => {
        const uv = elementSigilUv(frame);
        if (renderer) renderer.sprite(image, x - w / 2, y - h / 2, w, h, alpha, false, uv, angle);
        else if (context) {
          context.save(); context.globalAlpha = alpha; context.translate(x, y); context.rotate(angle);
          context.drawImage(image, uv[0] * image.naturalWidth, uv[1] * image.naturalHeight,
            uv[2] * image.naturalWidth, uv[3] * image.naturalHeight, -w / 2, -h / 2, w, h); context.restore();
        }
      };
      const state = input.current, now = Date.now();
      let animating = false;
      const castAge = state.castAt ? now - state.castAt : Infinity;
      if (!reduced && castAge >= 0 && castAge < 450) {
        if (castAge < 120) sprite(Math.min(1, Math.floor(castAge / 60)), from.x, from.y, size * .65, size * .65);
        else {
          const progress = Math.min(1.2, (castAge - 120) / 180);
          const dy = to.y - from.y, dx = to.x - from.x;
          sprite(2 + Math.min(3, Math.floor((castAge - 120) / 80)), from.x + dx * progress,
            from.y + dy * progress + (state.castHit ? 0 : size * .5 * progress), size * .9, size * .45,
            Math.min(1, (450 - castAge) / 120), Math.atan2(dy, dx));
        }
        animating = true;
      }
      const attachAge = state.attachedAt ? now - state.attachedAt : Infinity;
      const remaining = state.expiresAt - now;
      // Shared phase keeps the seal and its elemental/chaos overlays aligned,
      // including during mark refreshes. Reduced motion retains a static seal.
      const sealRotation = reduced ? 0 : (now % 4000) / 4000 * Math.PI * 2;
      if (state.expiresAt && remaining > 0 && attachAge >= 0) {
        const forming = attachAge < 360;
        const frame = forming && !reduced ? 6 + Math.min(5, Math.floor(attachAge / 60))
          : 12 + (reduced ? 0 : Math.floor(now / 180) % 6);
        sprite(frame, to.x, to.y, size, size, forming ? .9 : .85, sealRotation);
        animating = !reduced || forming;
        for (const [kind, at] of Object.entries(state.pulses)) {
          const age = now - at!;
          if (age >= 0 && age < 320 && !reduced) {
            sprite(kind === "burn" ? 18 : kind === "freeze" ? 19 : 20,
              to.x, to.y, size * (1 + age / 320 * .12), size * (1 + age / 320 * .12), 1 - age / 320, sealRotation);
            animating = true;
          } else if (age < 0) animating = true;
        }
        const chaosAge = state.chaosAt ? now - state.chaosAt : Infinity;
        if (chaosAge >= 0 && chaosAge < 480 && !reduced) {
          sprite(21, to.x, to.y, size * (1.05 + chaosAge / 480 * .2), size * (1.05 + chaosAge / 480 * .2), 1 - chaosAge / 480, sealRotation);
          animating = true;
        } else if (chaosAge < 0) animating = true;
      } else if (state.expiresAt && remaining <= 0 && remaining > -300) {
        sprite(remaining > -150 ? 22 : 23, to.x, to.y, size, size, 1 + remaining / 300, sealRotation); animating = true;
      } else if (attachAge < 0) animating = true;
      window.clearTimeout(expiryTimer);
      if (animating) schedule();
      else if (remaining > 0) expiryTimer = window.setTimeout(schedule, remaining + 1);
    }
    schedule();
    return () => {
      disposed = true; cancelAnimationFrame(raf); window.clearTimeout(expiryTimer); observer.disconnect(); wake.current = null; image.onload = null;
      canvas.removeEventListener("webglcontextlost", lost);
      if (renderer && !renderer.gl.isContextLost()) renderer.dispose();
    };
  }, [fallback]);
  return <canvas key={fallback ? "2d" : "webgl"} ref={canvasRef}
    className="skill-effect-canvas element-sigil-canvas" aria-hidden="true" />;
}
