"use client";

import { useEffect, useRef } from "react";

const TENTACLE_SOURCES = [
  "/vfx/world-boss/abyss-tentacle-main.png",
  "/vfx/world-boss/abyss-tentacle-sweep.png",
  "/vfx/world-boss/abyss-tentacle-eye.png",
  "/vfx/world-boss/abyss-tentacle-claw.png",
] as const;

type Point = { x: number; y: number };

const clamp = (value: number, minimum = 0, maximum = 1) =>
  Math.min(maximum, Math.max(minimum, value));
const easeOutCubic = (value: number) => 1 - Math.pow(1 - clamp(value), 3);
const easeInCubic = (value: number) => Math.pow(clamp(value), 3);
const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;

function readAnchor(canvas: HTMLCanvasElement, selector: string, fallback: Point) {
  const stage = canvas.closest(".battle-stage");
  const target = stage?.querySelector<HTMLElement>(selector);
  const overlay = canvas.getBoundingClientRect();
  if (!target) return { x: overlay.width * fallback.x, y: overlay.height * fallback.y };
  const rect = target.getBoundingClientRect();
  return {
    x: rect.left - overlay.left + rect.width / 2,
    y: rect.top - overlay.top + rect.height * 0.46,
  };
}

function drawGlow(
  context: CanvasRenderingContext2D,
  point: Point,
  radius: number,
  alpha: number,
  inner = "rgba(224, 179, 255, 1)",
) {
  const gradient = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
  gradient.addColorStop(0, inner.replace(", 1)", `, ${alpha})`));
  gradient.addColorStop(0.2, `rgba(147, 72, 255, ${alpha * 0.72})`);
  gradient.addColorStop(0.58, `rgba(62, 13, 102, ${alpha * 0.35})`);
  gradient.addColorStop(1, "rgba(7, 1, 15, 0)");
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.fill();
}

function drawRift(
  context: CanvasRenderingContext2D,
  point: Point,
  radius: number,
  rotation: number,
  alpha: number,
) {
  context.save();
  context.translate(point.x, point.y);
  context.rotate(rotation);
  context.scale(1, 0.24);
  const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radius);
  gradient.addColorStop(0, `rgba(0, 0, 0, ${alpha})`);
  gradient.addColorStop(0.56, `rgba(25, 2, 45, ${alpha})`);
  gradient.addColorStop(0.76, `rgba(179, 85, 255, ${alpha * 0.86})`);
  gradient.addColorStop(0.87, `rgba(235, 198, 255, ${alpha * 0.46})`);
  gradient.addColorStop(1, "rgba(104, 36, 186, 0)");
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawTentacle(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  origin: Point,
  target: Point,
  size: number,
  rotationOffset: number,
  progress: number,
  alpha: number,
  mirrored: boolean,
) {
  const arrival = easeOutCubic((progress - 0.1) / 0.34);
  const crush = easeInCubic((progress - 0.46) / 0.2);
  const x = lerp(origin.x, target.x, arrival * (0.62 + crush * 0.26));
  const y = lerp(origin.y, target.y, arrival * (0.62 + crush * 0.26));
  const angle = Math.atan2(target.y - origin.y, target.x - origin.x) + rotationOffset;
  const aspect = image.naturalWidth / Math.max(1, image.naturalHeight);
  const height = size * (0.72 + arrival * 0.28);
  const width = height * aspect;
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.scale(mirrored ? -1 : 1, 1);
  context.globalAlpha = alpha;
  context.shadowColor = "rgba(137, 56, 255, .78)";
  context.shadowBlur = Math.max(8, size * 0.06);
  context.drawImage(image, -width * 0.5, -height * 0.5, width, height);
  context.restore();
}

export function DeepAbyssBossVfx({ effectKey }: { effectKey: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const images = TENTACLE_SOURCES.map((source) => {
      const image = new Image();
      image.src = source;
      return image;
    });
    const duration = 2_200;
    const startedAt = performance.now();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let animationFrame = 0;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(bounds.width * ratio));
      canvas.height = Math.max(1, Math.round(bounds.height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const render = (time: number) => {
      const bounds = canvas.getBoundingClientRect();
      const elapsed = reducedMotion ? duration * 0.62 : time - startedAt;
      const progress = clamp(elapsed / duration);
      const target = readAnchor(canvas, ".fighter.player .fighter-frame", { x: 0.28, y: 0.46 });
      const caster = readAnchor(canvas, ".fighter.enemy .fighter-frame", { x: 0.72, y: 0.43 });
      const scale = Math.max(0.62, Math.min(bounds.width, bounds.height) / 390);
      const telegraph = easeOutCubic(progress / 0.3);
      const impact = clamp((progress - 0.43) / 0.16);
      const fade = 1 - easeOutCubic((progress - 0.78) / 0.22);
      const pulse = Math.sin(elapsed / 82) * 0.5 + 0.5;

      context.clearRect(0, 0, bounds.width, bounds.height);
      context.fillStyle = `rgba(3, 0, 9, ${0.12 + telegraph * 0.48 * fade})`;
      context.fillRect(0, 0, bounds.width, bounds.height);

      context.globalCompositeOperation = "lighter";
      drawGlow(context, caster, 82 * scale, (0.3 + pulse * 0.18) * telegraph * fade);
      drawGlow(context, target, (58 + impact * 72) * scale, (0.12 + impact * 0.72) * fade);

      const origins: Point[] = [
        { x: -bounds.width * 0.08, y: bounds.height * 0.06 },
        { x: -bounds.width * 0.12, y: bounds.height * 0.48 },
        { x: -bounds.width * 0.06, y: bounds.height * 0.94 },
        { x: bounds.width * 1.08, y: bounds.height * 0.05 },
        { x: bounds.width * 1.1, y: bounds.height * 0.46 },
        { x: bounds.width * 1.05, y: bounds.height * 0.96 },
        { x: bounds.width * 0.18, y: -bounds.height * 0.18 },
        { x: bounds.width * 0.52, y: -bounds.height * 0.22 },
        { x: bounds.width * 0.25, y: bounds.height * 1.2 },
        { x: bounds.width * 0.68, y: bounds.height * 1.18 },
      ];
      const mobileLimit = bounds.width < 520 ? 7 : origins.length;
      const tentacleAlpha = clamp((progress - 0.08) / 0.2) * fade;
      context.globalCompositeOperation = "source-over";
      origins.slice(0, mobileLimit).forEach((origin, index) => {
        const image = images[index % images.length];
        const riftProgress = clamp((progress - index * 0.008) / 0.3);
        const riftPoint = {
          x: lerp(origin.x, target.x, 0.08),
          y: lerp(origin.y, target.y, 0.08),
        };
        drawRift(
          context,
          riftPoint,
          (36 + (index % 3) * 9) * scale * easeOutCubic(riftProgress),
          Math.atan2(target.y - origin.y, target.x - origin.x),
          tentacleAlpha,
        );
        if (!image.complete || image.naturalWidth === 0) return;
        drawTentacle(
          context,
          image,
          origin,
          target,
          (128 + (index % 4) * 22) * scale,
          ((index % 3) - 1) * 0.22,
          progress - index * 0.006,
          tentacleAlpha * (0.76 + (index % 3) * 0.1),
          index % 2 === 0,
        );
      });

      context.globalCompositeOperation = "lighter";
      const blackHoleRadius = (18 + impact * 54) * scale;
      const holeGradient = context.createRadialGradient(
        target.x,
        target.y,
        blackHoleRadius * 0.08,
        target.x,
        target.y,
        blackHoleRadius,
      );
      holeGradient.addColorStop(0, `rgba(0, 0, 0, ${0.98 * fade})`);
      holeGradient.addColorStop(0.38, `rgba(15, 1, 24, ${0.98 * fade})`);
      holeGradient.addColorStop(0.58, `rgba(204, 133, 255, ${(0.45 + pulse * 0.3) * fade})`);
      holeGradient.addColorStop(0.72, `rgba(117, 43, 255, ${0.54 * fade})`);
      holeGradient.addColorStop(1, "rgba(77, 18, 142, 0)");
      context.fillStyle = holeGradient;
      context.beginPath();
      context.arc(target.x, target.y, blackHoleRadius, 0, Math.PI * 2);
      context.fill();

      context.save();
      context.translate(target.x, target.y);
      context.rotate(elapsed / 320);
      context.strokeStyle = `rgba(223, 179, 255, ${0.82 * impact * fade})`;
      context.lineWidth = Math.max(1.2, 2.4 * scale);
      for (let ring = 0; ring < 3; ring += 1) {
        context.beginPath();
        context.ellipse(0, 0, blackHoleRadius * (1.15 + ring * 0.34), blackHoleRadius * (0.33 + ring * 0.12), ring * 0.9, 0.2, 5.7);
        context.stroke();
      }
      context.restore();

      for (let index = 0; index < 46; index += 1) {
        const angle = index * 2.399 + elapsed / (680 + (index % 5) * 80);
        const inward = 1 - impact * 0.82;
        const distance = (32 + ((index * 31) % 105)) * scale * inward;
        const drift = Math.sin(elapsed / 210 + index) * 8 * scale;
        context.globalAlpha = (0.2 + ((index * 7) % 10) / 14) * telegraph * fade;
        context.fillStyle = index % 4 === 0 ? "#f0c8ff" : index % 2 ? "#a84cff" : "#5b2a9d";
        context.beginPath();
        context.arc(
          target.x + Math.cos(angle) * distance + drift,
          target.y + Math.sin(angle) * distance,
          Math.max(0.8, (1 + (index % 3)) * scale),
          0,
          Math.PI * 2,
        );
        context.fill();
      }

      if (progress > 0.47 && progress < 0.64) {
        const flash = Math.sin(clamp((progress - 0.47) / 0.17) * Math.PI);
        context.fillStyle = `rgba(226, 190, 255, ${flash * 0.3})`;
        context.fillRect(0, 0, bounds.width, bounds.height);
      }

      if (!reducedMotion && progress < 1) animationFrame = requestAnimationFrame(render);
    };

    animationFrame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
    };
  }, [effectKey]);

  return (
    <div className="deep-abyss-boss-vfx" aria-hidden="true">
      <canvas ref={canvasRef} />
      <div className="deep-abyss-skill-title">
        <small>深淵王・界滅奧義</small>
        <strong>萬觸葬界</strong>
      </div>
    </div>
  );
}
