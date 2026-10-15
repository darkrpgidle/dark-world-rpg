"use client";
import { useEffect, useRef, useState } from "react";
import { WebGLVfxRenderer } from "./webgl-vfx-renderer";
import { BLOOD_ROAR_DURATION, bloodRoarFrame, bloodRoarUv } from "./blood-roar-frames";

export function WebGLBloodRoarVfx({ ascended = false, aura = false }: { ascended?: boolean; aura?: boolean }) {
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
      const size = aura ? rect.width : (player?.width ?? rect.width * 0.25) * (ascended ? 1.65 : 1.4);
      const cx = aura ? rect.width / 2 : player ? player.left - rect.left + player.width / 2 : rect.width * 0.3;
      const cy = aura ? rect.height / 2 : player ? player.top - rect.top + player.height * 0.45 : rect.height * 0.45;
      const opacity = aura ? 0.7 : Math.min(1, elapsed / 120, Math.max(0, (BLOOD_ROAR_DURATION - elapsed) / 240));
      const uv = bloodRoarUv(bloodRoarFrame(elapsed, aura, reduced));
      if (renderer) {
        renderer.resize(); renderer.clear();
        renderer.sprite(image, cx - size / 2, cy - size / 2, size, size, opacity, false, uv);
      } else if (ctx) {
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        canvas!.width = Math.max(1, Math.round(rect.width * ratio));
        canvas!.height = Math.max(1, Math.round(rect.height * ratio));
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, rect.width, rect.height); ctx.globalAlpha = opacity;
        ctx.drawImage(image, uv[0] * image.naturalWidth, uv[1] * image.naturalHeight,
          uv[2] * image.naturalWidth, uv[3] * image.naturalHeight, cx-size/2, cy-size/2, size, size);
      }
      if (aura && !reduced || !aura && elapsed < BLOOD_ROAR_DURATION) raf = requestAnimationFrame(render);
    }
    image.onload = () => { if (!disposed) raf = requestAnimationFrame(render); };
    // Persistent aura uses the open-center flames, never repeats the phantom.
    image.src = `/vfx/blood-roar-v2/${ascended && !aura ? "ascended" : "normal"}.webp`;
    return () => { disposed = true; cancelAnimationFrame(raf); image.onload = null;
      canvas.removeEventListener("webglcontextlost", lost); renderer?.dispose(); };
  }, [ascended, aura, fallback]);
  return <canvas key={fallback ? "2d" : "gl"} ref={ref} aria-hidden="true"
    className={aura ? "blood-roar-buff-vfx" : "skill-effect-canvas"}
    style={aura ? { width: "140%", height: "100%", left: "50%", top: "50%" } : undefined} />;
}
