"use client";
import { useEffect, useRef, useState } from "react";
import { WebGLVfxRenderer } from "./webgl-vfx-renderer";
const DURATION = 540;

export function WebGLBloodRoarHitVfx({ kind }: { kind: "slash" | "return" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let renderer: WebGLVfxRenderer | undefined;
    let ctx: CanvasRenderingContext2D | null = null;
    if (fallback) ctx = canvas.getContext("2d");
    else {
      try { renderer = new WebGLVfxRenderer(canvas); }
      catch { setFallback(true); return; }
    }
    const image = new Image();
    let raf = 0, start = 0, disposed = false;
    const lost = (e: Event) => { e.preventDefault(); setFallback(true); };
    canvas.addEventListener("webglcontextlost", lost);
    function render(time: number) {
      if (disposed || !image.naturalWidth) return;
      if (!start) start = time;
      const elapsed = time - start;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const rect = canvas!.getBoundingClientRect();
      const player = canvas!.closest(".battle-stage")?.querySelector(".fighter.player .fighter-frame")?.getBoundingClientRect();
      const enemy = canvas!.closest(".battle-stage")?.querySelector(".fighter.enemy .fighter-frame")?.getBoundingClientRect();
      const p = Math.min(1, elapsed / DURATION);
      const px = player ? player.left - rect.left + player.width * 0.5 : rect.width * 0.3;
      const py = player ? player.top - rect.top + player.height * 0.4 : rect.height * 0.45;
      const ex = enemy ? enemy.left - rect.left + enemy.width * 0.5 : rect.width * 0.7;
      const ey = enemy ? enemy.top - rect.top + enemy.height * 0.45 : rect.height * 0.45;
      const returning = kind === "return";
      const size = (enemy?.width ?? rect.width * 0.25) * (returning ? 0.42 : 0.95);
      const cx = returning ? ex + (px - ex) * p : ex;
      const cy = returning ? ey + (py - ey) * p - Math.sin(p * Math.PI) * size * 0.3 : ey;
      const opacity = Math.min(1, elapsed / 50, Math.max(0, (DURATION-elapsed)/140));
      const frame = reduced ? 3 : Math.min(7, Math.floor(p*8));
      const uv: [number, number, number, number] = [(frame%4+0.002)/4,(Math.floor(frame/4)+0.002)/2,0.996/4,0.996/2];
      const drawY = cy - size * (returning ? 0.5 : [251,268,272,268,219,222,226,231][frame] / 448);
      if (renderer) {
        renderer.resize(); renderer.clear();
        renderer.sprite(image, cx - size / 2, drawY, size, size, opacity, false, uv);
      } else if (ctx) {
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        canvas!.width = Math.max(1, Math.round(rect.width * ratio));
        canvas!.height = Math.max(1, Math.round(rect.height * ratio));
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, rect.width, rect.height); ctx.globalAlpha = opacity;
        ctx.drawImage(image, uv[0] * image.naturalWidth, uv[1] * image.naturalHeight,
          uv[2] * image.naturalWidth, uv[3] * image.naturalHeight, cx-size/2, drawY, size, size);
      }
      if (elapsed < DURATION) raf = requestAnimationFrame(render);
    }
    image.onload = () => { if (!disposed) raf = requestAnimationFrame(render); };
    image.src = `/vfx/blood-roar-v2/${kind}.webp`;
    return () => { disposed = true; cancelAnimationFrame(raf); image.onload = null;
      canvas.removeEventListener("webglcontextlost", lost); renderer?.dispose(); };
  }, [kind, fallback]);
  return <canvas key={fallback ? "2d" : "gl"} ref={ref} aria-hidden="true"
    className="skill-effect-canvas" />;
}
