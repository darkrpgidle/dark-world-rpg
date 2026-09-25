"use client";

import { useEffect, useRef, useState } from "react";
import { DeepAbyssBossVfx as LegacyDeepAbyssBossVfx } from "./deep-abyss-boss-vfx";
import { hexColor, WebGLVfxRenderer } from "./webgl-vfx-renderer";

const SOURCES = [
  "/vfx/world-boss/abyss-tentacle-main.png",
  "/vfx/world-boss/abyss-tentacle-sweep.png",
  "/vfx/world-boss/abyss-tentacle-eye.png",
  "/vfx/world-boss/abyss-tentacle-claw.png",
] as const;
type Point = { x: number; y: number };
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const easeOut = (value: number) => 1 - Math.pow(1 - clamp(value), 3);
const easeIn = (value: number) => Math.pow(clamp(value), 3);
const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;

function anchor(canvas: HTMLCanvasElement, selector: string, fallback: Point): Point {
  const stage = canvas.closest(".battle-stage");
  const target = stage?.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
  const rect = canvas.getBoundingClientRect();
  return target ? { x: target.left - rect.left + target.width / 2, y: target.top - rect.top + target.height * 0.46 }
    : { x: rect.width * fallback.x, y: rect.height * fallback.y };
}

export function WebGLDeepAbyssBossVfx({ effectKey }: { effectKey: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => {
    if (unsupported) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let gpu: WebGLVfxRenderer;
    try { gpu = new WebGLVfxRenderer(canvas); } catch { setUnsupported(true); return; }
    const images = SOURCES.map((source) => { const image = new Image(); image.src = source; return image; });
    const duration = 2200;
    const start = performance.now();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let animationFrame = 0;
    const resize = () => gpu.resize();
    const contextLost = (event: Event) => { event.preventDefault(); setUnsupported(true); };
    canvas.addEventListener("webglcontextlost", contextLost);
    window.addEventListener("resize", resize);
    resize();

    const render = (time: number) => {
      if (gpu.gl.isContextLost()) return;
      const rect = canvas.getBoundingClientRect();
      const elapsed = reduced ? duration * 0.62 : time - start;
      const progress = clamp(elapsed / duration);
      const target = anchor(canvas, ".fighter.player .fighter-frame", { x: 0.28, y: 0.46 });
      const caster = anchor(canvas, ".fighter.enemy .fighter-frame", { x: 0.72, y: 0.43 });
      const scale = Math.max(0.62, Math.min(rect.width, rect.height) / 390);
      const telegraph = easeOut(progress / 0.3);
      const impact = clamp((progress - 0.43) / 0.16);
      const fade = 1 - easeOut((progress - 0.78) / 0.22);
      const pulse = Math.sin(elapsed / 82) * 0.5 + 0.5;
      gpu.clear();
      gpu.rectangle(0, 0, rect.width, rect.height, [3 / 255, 0, 9 / 255, 0.12 + telegraph * 0.48 * fade]);
      gpu.glow(caster.x, caster.y, 82 * scale, 82 * scale, hexColor("#e0b3ff", (0.3 + pulse * 0.18) * telegraph * fade));
      gpu.glow(target.x, target.y, (58 + impact * 72) * scale, (58 + impact * 72) * scale,
        hexColor("#9348ff", (0.12 + impact * 0.72) * fade));

      const origins: Point[] = [
        { x: -rect.width * 0.08, y: rect.height * 0.06 },
        { x: -rect.width * 0.12, y: rect.height * 0.48 },
        { x: -rect.width * 0.06, y: rect.height * 0.94 },
        { x: rect.width * 1.08, y: rect.height * 0.05 },
        { x: rect.width * 1.1, y: rect.height * 0.46 },
        { x: rect.width * 1.05, y: rect.height * 0.96 },
        { x: rect.width * 0.18, y: -rect.height * 0.18 },
        { x: rect.width * 0.52, y: -rect.height * 0.22 },
        { x: rect.width * 0.25, y: rect.height * 1.2 },
        { x: rect.width * 0.68, y: rect.height * 1.18 },
      ];
      const maxTentacles = rect.width < 520 ? 7 : origins.length;
      const tentacleAlpha = clamp((progress - 0.08) / 0.2) * fade;
      for (let index = 0; index < maxTentacles; index += 1) {
        const origin = origins[index];
        const image = images[index % images.length];
        const riftPoint = { x: lerp(origin.x, target.x, 0.08), y: lerp(origin.y, target.y, 0.08) };
        const riftScale = (36 + (index % 3) * 9) * scale * easeOut((progress - index * 0.008) / 0.3);
        gpu.glow(riftPoint.x, riftPoint.y, riftScale, riftScale * 0.24, hexColor("#b355ff", tentacleAlpha * 0.7));
        gpu.ellipse(riftPoint.x, riftPoint.y, riftScale * 0.56, riftScale * 0.12, hexColor("#19022d", tentacleAlpha));
        if (!image.complete || !image.naturalWidth) continue;
        const local = progress - index * 0.006;
        const arrival = easeOut((local - 0.1) / 0.34);
        const crush = easeIn((local - 0.46) / 0.2);
        const amount = arrival * (0.62 + crush * 0.26);
        const x = lerp(origin.x, target.x, amount);
        const y = lerp(origin.y, target.y, amount);
        const angle = Math.atan2(target.y - origin.y, target.x - origin.x) + ((index % 3) - 1) * 0.22;
        const height = (128 + (index % 4) * 22) * scale * (0.72 + arrival * 0.28);
        const width = height * image.naturalWidth / image.naturalHeight;
        const opacity = tentacleAlpha * (0.76 + (index % 3) * 0.1);
        gpu.sprite(image, x - width / 2, y - height / 2, width, height, opacity,
          angle + (index % 2 ? 0 : Math.PI));
      }

      const holeRadius = (18 + impact * 54) * scale;
      gpu.glow(target.x, target.y, holeRadius * 1.6, holeRadius * 1.6, hexColor("#752bff", (0.45 + pulse * 0.3) * fade));
      gpu.ellipse(target.x, target.y, holeRadius * 0.55, holeRadius * 0.55, hexColor("#0f0118", 0.98 * fade));
      gpu.ellipse(target.x, target.y, holeRadius * 0.22, holeRadius * 0.22, hexColor("#000000", 0.98 * fade));
      for (let ring = 0; ring < 3; ring += 1) {
        gpu.ring(target.x, target.y, holeRadius * (1.15 + ring * 0.34),
          holeRadius * (0.33 + ring * 0.12), Math.max(1.2, 2.4 * scale), hexColor("#dfb3ff", 0.82 * impact * fade));
      }
      for (let index = 0; index < 46; index += 1) {
        const angle = index * 2.399 + elapsed / (680 + (index % 5) * 80);
        const distance = (32 + ((index * 31) % 105)) * scale * (1 - impact * 0.82);
        const drift = Math.sin(elapsed / 210 + index) * 8 * scale;
        const x = target.x + Math.cos(angle) * distance + drift;
        const y = target.y + Math.sin(angle) * distance;
        const radius = Math.max(0.8, (1 + (index % 3)) * scale);
        const color = index % 4 === 0 ? "#f0c8ff" : index % 2 ? "#a84cff" : "#5b2a9d";
        gpu.ellipse(x, y, radius, radius, hexColor(color, (0.2 + ((index * 7) % 10) / 14) * telegraph * fade), true);
      }
      if (progress > 0.47 && progress < 0.64) {
        const flash = Math.sin(clamp((progress - 0.47) / 0.17) * Math.PI);
        gpu.rectangle(0, 0, rect.width, rect.height, hexColor("#e2beff", flash * 0.3));
      }
      if (!reduced && progress < 1) animationFrame = requestAnimationFrame(render);
    };
    if (reduced) for (const image of images) image.onload = () => render(performance.now());
    animationFrame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animationFrame);
      for (const image of images) image.onload = null;
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("webglcontextlost", contextLost);
      if (!gpu.gl.isContextLost()) gpu.dispose();
    };
  }, [effectKey, unsupported]);

  if (unsupported) return <LegacyDeepAbyssBossVfx effectKey={effectKey} />;
  return <div className="deep-abyss-boss-vfx" aria-hidden="true">
    <canvas ref={canvasRef} />
    <div className="deep-abyss-skill-title"><small>深淵王・界滅奧義</small><strong>萬觸葬界</strong></div>
  </div>;
}
