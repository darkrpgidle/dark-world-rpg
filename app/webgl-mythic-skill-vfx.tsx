"use client";

import { useEffect, useRef, useState } from "react";
import { MythicSkillVfx as LegacyMythicSkillVfx, type MythicVfxPhase } from "./mythic-skill-vfx";
import { hexColor, WebGLVfxRenderer } from "./webgl-vfx-renderer";

const SOURCES = {
  echo: "/vfx/arcane-echo/arcane-echo-16.png",
  meteorFlight: "/vfx/mage-meteor-flight-6.png",
  meteorRing: "/vfx/mage-meteor-impact-ring-4.png",
  meteorBlast: "/vfx/mage-meteor-ground-blast-8.png",
  frostfireFlight: "/vfx/mage-double-fire-nova-flight-6.png",
  frostfireImpact: "/vfx/mage-double-fire-nova-impact-6.png",
} as const;
type Source = keyof typeof SOURCES;
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const between = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const easeOut = (value: number) => 1 - Math.pow(1 - clamp(value), 3);

function frame(gpu: WebGLVfxRenderer, image: HTMLImageElement, index: number, columns: number,
  x: number, y: number, width: number, height: number, opacity: number, rows = 1, rotation = 0) {
  if (opacity <= 0) return;
  const cellX = index % columns;
  const cellY = Math.floor(index / columns);
  gpu.sprite(image, x - width / 2, y - height / 2, width, height, opacity, rotation,
    [cellX / columns, cellY / rows, 1 / columns, 1 / rows], true);
}

function target(canvas: HTMLCanvasElement, selector: string, xFallback: number, yFallback: number) {
  const rect = canvas.getBoundingClientRect();
  const fighter = canvas.closest(".battle-stage")?.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
  return fighter ? { x: fighter.left - rect.left + fighter.width / 2,
    y: fighter.top - rect.top + fighter.height / 2, width: fighter.width, height: fighter.height }
    : { x: rect.width * xFallback, y: rect.height * yFallback,
      width: rect.width * 0.3, height: rect.height * 0.68 };
}

export function WebGLMythicSkillVfx({ skill, effectKey, phase = "impact", variant = "normal" }: {
  skill: string; effectKey: number; phase?: MythicVfxPhase; variant?: "normal" | "detonation";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [unsupported, setUnsupported] = useState(false);
  const supported = skill === "奧術回響" || skill === "隕星術" || skill === "霜火新星";

  useEffect(() => {
    if (unsupported || !supported) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let gpu: WebGLVfxRenderer;
    try { gpu = new WebGLVfxRenderer(canvas); } catch { setUnsupported(true); return; }
    const images = Object.fromEntries(Object.entries(SOURCES).map(([key, source]) => {
      const image = new Image(); image.src = source; return [key, image];
    })) as Record<Source, HTMLImageElement>;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let animationFrame = 0;
    const resize = () => gpu.resize();
    const contextLost = (event: Event) => { event.preventDefault(); setUnsupported(true); };
    canvas.addEventListener("webglcontextlost", contextLost);
    window.addEventListener("resize", resize);
    resize();

    const render = (time: number) => {
      if (gpu.gl.isContextLost()) return;
      const elapsed = reduced ? skill === "奧術回響" ? 900 : skill === "隕星術" ? 880 : variant === "detonation" ? 180 : 1500 : time - start;
      const rect = canvas.getBoundingClientRect();
      const enemy = target(canvas, ".fighter.enemy .enemy-frame", 0.72, 0.43);
      const player = target(canvas, ".fighter.player .fighter-frame", 0.28, 0.5);
      gpu.clear();
      let duration = 1000;

      if (skill === "奧術回響") {
        duration = 1472;
        const current = Math.min(15, Math.floor(elapsed / 92));
        const size = Math.max(enemy.width, enemy.height) * 1.35 * 0.72;
        frame(gpu, images.echo, current, 4, enemy.x, enemy.y, size, size, 1, 4);
        const aura = clamp((elapsed - 828) / 420);
        if (aura > 0 && aura < 1) {
          const radius = size * (0.55 + aura * 0.8) * 0.5;
          gpu.glow(enemy.x, enemy.y, radius, radius, hexColor("#9b4bff", Math.sin(aura * Math.PI) * 0.5));
        }
      } else if (skill === "隕星術") {
        duration = 1250;
        const impactX = enemy.x;
        const impactY = enemy.y;
        if (elapsed < 650) {
          const move = easeOut(elapsed / 650);
          const width = between(rect.width * 0.32, 120, 210) * (0.6 + move * 0.4);
          const x = rect.width * 0.92 + (impactX - rect.width * 0.92) * move;
          const y = rect.height * 0.08 + (impactY - rect.height * 0.08) * move;
          frame(gpu, images.meteorFlight, Math.min(5, Math.floor(elapsed / 100)), 6,
            x, y, width, width * 2, clamp((650 - elapsed) / 84));
        }
        if (elapsed >= 650 && elapsed < 890) {
          const local = (elapsed - 650) / 240;
          const width = between(rect.width * 0.36, 130, 250) * (0.45 + local * 0.7);
          frame(gpu, images.meteorRing, Math.min(3, Math.floor((elapsed - 650) / 50)), 4,
            impactX, impactY, width, width * 4 / 3, clamp(local * 5));
        }
        if (elapsed >= 650 && elapsed < 1250) {
          const local = (elapsed - 650) / 600;
          const width = between(rect.width * 0.42, 150, 300) * (0.45 + local * 0.75);
          frame(gpu, images.meteorBlast, Math.min(7, Math.floor((elapsed - 650) / 75)), 8,
            impactX, impactY, width, width * 8 / 3, Math.sin(local * Math.PI));
          const radius = between(rect.width * 0.16, 80, 160) * local;
          gpu.ring(impactX, impactY, radius, radius, 5, hexColor("#ff9b3b", (1 - local) * 0.9));
          for (let i = 0; i < 20; i += 1) {
            const angle = i * 2.399;
            const travel = (35 + i % 6 * 10) * local;
            gpu.ellipse(impactX + Math.cos(angle) * travel, impactY + Math.sin(angle) * travel,
              2.4, 2.4, hexColor("#ffd46b", (1 - local) * 0.7), true);
          }
        }
      } else if (skill === "霜火新星") {
        duration = variant === "detonation" ? 890 : 2280;
        const width = between(rect.width * 0.32, 118, 220);
        const draw = (source: Source, index: number, x: number, y: number, opacity: number, scale: number, rotation = 0) =>
          frame(gpu, images[source], index, 6, x, y, width * scale, width * 2 * scale, opacity, 1, rotation);
        if (variant !== "detonation") {
          if (elapsed < 380) {
            const local = elapsed / 380;
            draw("frostfireFlight", Math.min(1, Math.floor(elapsed / 190)), player.x, player.y,
              Math.min(1, local * 8) * clamp((380 - elapsed) / 68), 0.64 + 0.36 * local);
          }
          if (elapsed >= 340 && elapsed < 1320) {
            const local = (elapsed - 340) / 980;
            draw("frostfireFlight", 2 + Math.min(1, Math.floor((elapsed - 340) / 490)),
              player.x + (enemy.x - player.x) * easeOut(local),
              player.y + (enemy.y - player.y) * local - Math.sin(local * Math.PI) * enemy.height * 0.24,
              Math.min(1, local * 20) * clamp((1320 - elapsed) / 118), 0.72 + 0.34 * local,
              (-12 + 30 * local) * Math.PI / 180);
          }
          if (elapsed >= 1240 && elapsed < 1420) {
            const local = (elapsed - 1240) / 180;
            draw("frostfireFlight", 4 + Math.min(1, Math.floor((elapsed - 1240) / 90)), enemy.x, enemy.y,
              clamp(local * 7), 0.9 + 0.18 * local);
          }
        }
        const burstStart = variant === "detonation" ? 0 : 1390;
        const fadeStart = variant === "detonation" ? 270 : 1660;
        if (elapsed >= burstStart && elapsed < burstStart + 320) {
          const local = (elapsed - burstStart) / 320;
          draw("frostfireImpact", 2 + Math.min(1, Math.floor((elapsed - burstStart) / 160)),
            enemy.x, enemy.y, clamp(local * 8), 0.78 * (0.5 + local * 0.68));
        }
        if (elapsed >= fadeStart && elapsed < fadeStart + 620) {
          const local = (elapsed - fadeStart) / 620;
          draw("frostfireImpact", 4 + Math.min(1, Math.floor((elapsed - fadeStart) / 310)),
            enemy.x, enemy.y, Math.min(0.9, local * 8) * (1 - local), 0.78 * (1.14 + local * 0.14));
        }
      }
      if (!reduced && elapsed < duration) animationFrame = requestAnimationFrame(render);
    };
    if (reduced) for (const image of Object.values(images)) image.onload = () => render(performance.now());
    animationFrame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animationFrame);
      for (const image of Object.values(images)) image.onload = null;
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("webglcontextlost", contextLost);
      if (!gpu.gl.isContextLost()) gpu.dispose();
    };
  }, [effectKey, phase, skill, variant, supported, unsupported]);

  if (unsupported || !supported) return <LegacyMythicSkillVfx skill={skill} effectKey={effectKey} phase={phase} variant={variant} />;
  return <canvas ref={canvasRef} className="mythic-skill-vfx webgl-mythic-vfx" aria-hidden="true" />;
}
