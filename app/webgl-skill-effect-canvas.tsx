"use client";

import { useEffect, useRef, useState } from "react";
import { SkillEffectCanvas as LegacySkillEffectCanvas } from "./skill-effect-canvas";
import { hexColor, WebGLVfxRenderer } from "./webgl-vfx-renderer";

type Anchors = {
  playerX: number; playerY: number; playerWidth: number; playerHeight: number;
  enemyX: number; enemyY: number; enemyWidth: number; enemyHeight: number; groundY: number;
};

const DURATION: Record<string, number> = {
  鮮血怒吼強化斬擊: 680, 裂地斬: 1395, 鮮血怒吼: 1050,
  處決: 1900, 霜火新星: 1250, 魔力護盾: 1150, 隕星術: 1300, 套裝共鳴: 1100,
};
const BLOOD_FRAMES = Array.from({ length: 4 }, (_, index) => `/vfx/blood-roar-basic/frame-${String(index).padStart(2, "0")}.png`);
const EXECUTION_FRAMES = Array.from({ length: 8 }, (_, index) => `/vfx/execution/frame-${String(index).padStart(2, "0")}.png`);
const GROUND_FRAMES = Array.from({ length: 5 }, (_, index) => `/vfx/ground-split-v2/frame-${String(index).padStart(2, "0")}.png`);
const EXECUTION_LANDING = [45, 35, 55, 75, 140];
const GROUND_SEQUENCE = [110, 100, 140, 190, 260];
const cumulativeFrame = (elapsed: number, durations: number[]) => {
  let end = 0;
  for (let i = 0; i < durations.length; i += 1) {
    end += durations[i];
    if (elapsed < end) return i;
  }
  return durations.length - 1;
};
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const easeOut = (value: number) => 1 - Math.pow(1 - clamp(value), 3);

function readAnchors(canvas: HTMLCanvasElement): Anchors {
  const rect = canvas.getBoundingClientRect();
  const stage = canvas.closest(".battle-stage");
  const player = stage?.querySelector<HTMLElement>(".fighter.player .fighter-frame")?.getBoundingClientRect();
  const enemy = stage?.querySelector<HTMLElement>(".fighter.enemy .fighter-frame")?.getBoundingClientRect();
  if (!player || !enemy) return {
    playerX: rect.width * 0.3, playerY: rect.height * 0.43,
    playerWidth: rect.width * 0.3, playerHeight: rect.height * 0.68,
    enemyX: rect.width * 0.71, enemyY: rect.height * 0.43,
    enemyWidth: rect.width * 0.3, enemyHeight: rect.height * 0.68, groundY: rect.height * 0.72,
  };
  return {
    playerX: player.left - rect.left + player.width / 2,
    playerY: player.top - rect.top + player.height / 2,
    playerWidth: player.width, playerHeight: player.height,
    enemyX: enemy.left - rect.left + enemy.width / 2,
    enemyY: enemy.top - rect.top + enemy.height / 2,
    enemyWidth: enemy.width, enemyHeight: enemy.height,
    groundY: Math.min(rect.height - 8, Math.max(player.bottom, enemy.bottom) - rect.top),
  };
}

type Spark = { angle: number; distance: number; size: number; delay: number; color: string };
function makeSparks(seed: number, count: number, palette: string[]): Spark[] {
  let value = seed >>> 0;
  const random = () => ((value = (value * 1664525 + 1013904223) >>> 0) / 4294967296);
  return Array.from({ length: count }, () => ({
    angle: random() * Math.PI * 2, distance: 150 * (0.35 + random() * 0.65),
    size: 1.5 + random() * 3.5, delay: random() * 0.24,
    color: palette[Math.floor(random() * palette.length)],
  }));
}

function burst(gpu: WebGLVfxRenderer, sparks: Spark[], x: number, y: number, progress: number, scale: number) {
  for (const spark of sparks) {
    const local = clamp((progress - spark.delay) / (1 - spark.delay));
    if (local <= 0) continue;
    const travel = spark.distance * scale * easeOut(local);
    const px = x + Math.cos(spark.angle) * travel;
    const py = y + Math.sin(spark.angle) * travel;
    const radius = spark.size * (1 - local * 0.55);
    gpu.glow(px, py, radius * 3, radius * 3, hexColor(spark.color, (1 - local) * 0.5));
    gpu.ellipse(px, py, radius, radius, hexColor(spark.color, (1 - local) * 0.95), true);
  }
}

function shockwave(gpu: WebGLVfxRenderer, x: number, y: number, radius: number, color: string, alpha: number) {
  if (radius <= 0) return;
  gpu.ring(x, y, radius, radius, Math.max(3, radius * 0.035), hexColor(color, alpha));
  gpu.ring(x, y, radius * 0.72, radius * 0.72, Math.max(2, radius * 0.018), hexColor("#fff4d0", alpha * 0.55));
}

function glowLine(gpu: WebGLVfxRenderer, x1: number, y1: number, x2: number, y2: number, color: string, width: number) {
  gpu.line(x1, y1, x2, y2, width * 3, hexColor(color, 0.22));
  gpu.line(x1, y1, x2, y2, width, hexColor(color, 0.86));
}

function drawSpriteEffect(gpu: WebGLVfxRenderer, image: HTMLImageElement, name: string, progress: number, frame: number, alpha: number, a: Anchors, sparks: Spark[]) {
  const bounds = gpu.canvas.getBoundingClientRect();
  const ground = name === "裂地斬";
  const execution = name === "處決";
  const basic = name === "鮮血怒吼強化斬擊";
  const intro = clamp(progress * 4.5);
  const fade = clamp((1 - progress) * 5);
  const split = execution && frame === 6 ? clamp(progress / (120 / 360)) : 0;
  const dissipate = execution && frame === 7 ? clamp((progress - 120 / 360) / (240 / 360)) : 0;
  const scale = basic ? 0.9 + easeOut(intro) * 0.08
    : execution ? (0.9 + easeOut(intro) * 0.06) * (1 + split * 0.04 + dissipate * 0.13)
    : 0.68 + easeOut(intro) * 0.3;
  const groundTravel = ground && frame <= 2;
  const width = (ground
    ? groundTravel ? a.enemyX - a.playerX + a.playerWidth * 0.36 + a.enemyWidth * 0.4 : Math.max(a.enemyWidth * 1.32, a.enemyHeight * 0.94)
    : basic ? Math.min(a.enemyWidth * 1.35, a.enemyHeight * 0.52)
    : execution ? Math.min(a.enemyWidth * 1.7, a.enemyHeight * 0.84) : a.enemyWidth) * scale;
  const height = ground ? a.enemyHeight * (groundTravel ? 0.52 : 0.8) * scale : width * image.naturalHeight / image.naturalWidth;
  const x = ground ? groundTravel ? a.playerX - a.playerWidth * 0.2 : a.enemyX - width / 2
    : basic || execution ? a.enemyX - width / 2 : (bounds.width - width) / 2 - (1 - intro) * a.enemyWidth * 0.18;
  const drop = execution && frame <= 5 ? clamp(Math.pow(progress, 2.35)) : 1;
  const y = ground ? Math.max(-8, Math.min(bounds.height - height + 8, a.groundY - height * 0.82))
    : basic ? a.enemyY - height / 2
    : execution ? a.enemyY - height / 2 - (1 - drop) * a.enemyHeight * 1.18
    : (bounds.height - height) / 2 + bounds.height * 0.035;
  const opacity = alpha * (execution ? frame === 6 ? 1 - split * 0.18 : frame === 7 ? Math.pow(1 - dissipate, 0.8) : 1
    : ground ? 1 : basic ? Math.min(1, intro * 2.5) * Math.max(0.08, fade)
    : Math.min(1, intro * 1.8) * Math.max(0.12, fade));
  if (execution && frame <= 5 && drop > 0.025) {
    for (let i = 0; i < 6; i += 1) {
      const offset = (i - 2.5) * width * 0.055;
      const tail = height * (0.34 + i * 0.075) * (1.1 - drop * 0.45);
      glowLine(gpu, x + width * 0.5 + offset, y - tail, x + width * 0.5 + offset * 0.35,
        y - height * 0.08, i % 2 ? "#ff4b36" : "#ffd29d", Math.max(1.5, width * (0.008 - i * 0.00045)));
    }
  }
  if (execution && frame === 6) {
    const separation = width * 0.075 * easeOut(split);
    gpu.sprite(image, x - separation, y + height * 0.035 * split, width / 2, height, opacity, 0, [0, 0, 0.5, 1], true);
    gpu.sprite(image, x + width / 2 + separation, y - height * 0.025 * split, width / 2, height, opacity, 0, [0.5, 0, 0.5, 1], true);
  } else gpu.sprite(image, x, y, width, height, opacity, 0, undefined, true);
  if (execution && frame >= 6) {
    const breakup = frame === 6 ? split * 0.58 : 0.58 + dissipate * 0.42;
    burst(gpu, sparks, a.enemyX, a.enemyY, breakup, a.enemyHeight / 180);
    if (frame === 6 && split > 0.15) shockwave(gpu, a.enemyX, a.enemyY, a.enemyHeight * 0.14 * split, "#ff6046", (1 - split) * 0.48);
  }
  if (ground && frame >= 3) {
    const impact = clamp((progress - 0.44) / 0.56);
    shockwave(gpu, a.enemyX, a.groundY, a.enemyHeight * 0.3 * easeOut(impact), "#ff6a38", (1 - impact) * 0.9);
    burst(gpu, sparks, a.enemyX, a.groundY, impact, a.enemyHeight / 270);
    gpu.rectangle(0, 0, bounds.width, bounds.height, hexColor("#ffdca0", Math.max(0, 0.16 - impact * 0.16)));
  }
}

function drawProcedural(gpu: WebGLVfxRenderer, name: string, progress: number, a: Anchors, sparks: Spark[]) {
  const { playerX: px, playerY: py, playerWidth: pw, playerHeight: ph,
    enemyX: ex, enemyY: ey, enemyWidth: ew, enemyHeight: eh } = a;
  const fade = 1 - progress;
  if (name === "套裝共鳴") {
    const impact = easeOut(progress * 1.35);
    const radius = eh * (0.12 + impact * 0.58);
    const alpha = clamp(1 - progress * 0.92);
    for (let arc = 0; arc < 3; arc += 1) {
      const rotation = progress * Math.PI * 2.4 + arc * Math.PI * 2 / 3;
      for (let segment = 0; segment < 12; segment += 1) {
        const start = rotation - 0.8 + segment * 1.6 / 12;
        const end = rotation - 0.8 + (segment + 1) * 1.6 / 12;
        const color = ["#a7fff0", "#6fc8ff", "#c8a1ff"][arc];
        glowLine(gpu, ex + Math.cos(start) * radius, ey + Math.sin(start) * radius,
          ex + Math.cos(end) * radius, ey + Math.sin(end) * radius, color, Math.max(3, ew * 0.035));
      }
    }
    gpu.glow(ex, ey, eh * 0.2, eh * 0.2, hexColor("#8bffe7", alpha));
    shockwave(gpu, ex, ey, radius, "#83f5dc", alpha);
    burst(gpu, sparks, ex, ey, progress, eh / 270);
  }
  if (name === "鮮血怒吼") {
    const pulse = easeOut(progress * 1.55);
    const expansion = Math.min(pw * 0.17, ph * 0.12);
    for (let wave = 0; wave < 3; wave += 1) {
      const local = clamp((pulse - wave * 0.14) / 0.86);
      if (!local) continue;
      const rx = pw * 0.5 + expansion * easeOut(local);
      const ry = ph * 0.5 + expansion * easeOut(local);
      const color = ["#ffb05b", "#e63c38", "#8d071a"][wave];
      const alpha = (1 - local) * (0.74 - wave * 0.12) * fade;
      const width = wave === 0 ? 3.4 : 2.4;
      gpu.rectangle(px - rx, py - ry, rx * 2, width, hexColor(color, alpha), true);
      gpu.rectangle(px - rx, py + ry - width, rx * 2, width, hexColor(color, alpha), true);
      gpu.rectangle(px - rx, py - ry, width, ry * 2, hexColor(color, alpha), true);
      gpu.rectangle(px + rx - width, py - ry, width, ry * 2, hexColor(color, alpha), true);
    }
    for (let i = 0; i < 20; i += 1) {
      const side = i % 4, along = ((i * 37 + 19) % 100) / 100 - 0.5;
      const local = clamp((pulse - (i % 5) * 0.055) / 0.82);
      if (!local) continue;
      const travel = expansion * (0.18 + 0.82 * easeOut(local));
      const length = 7 + 16 * (1 - local);
      const edgeX = side === 1 ? pw / 2 : side === 3 ? -pw / 2 : along * pw * 0.875;
      const edgeY = side === 0 ? -ph / 2 : side === 2 ? ph / 2 : along * ph * 0.875;
      const nx = side === 1 ? 1 : side === 3 ? -1 : 0;
      const ny = side === 2 ? 1 : side === 0 ? -1 : 0;
      glowLine(gpu, px + edgeX + nx * travel, py + edgeY + ny * travel,
        px + edgeX + nx * (travel + length), py + edgeY + ny * (travel + length),
        i % 3 === 0 ? "#ffd37d" : "#d31d32", i % 3 === 0 ? 2.4 : 1.6);
    }
    shockwave(gpu, px, py, expansion * 1.8 * pulse, "#e32b36", (1 - pulse) * 0.9);
    burst(gpu, sparks, px, py, pulse, ph / 270);
  }
  if (name === "霜火新星") {
    const travel = easeOut(progress * 1.35);
    const x = px + (ex - px) * travel;
    const y = py + (ey - py) * travel + eh * 0.12 - Math.sin(travel * Math.PI) * Math.max(ph, eh) * 0.3;
    gpu.glow(x, y, eh * 0.08, eh * 0.08, hexColor("#61d9ff", 0.9));
    gpu.ellipse(x, y, eh * 0.018, eh * 0.018, hexColor("#fffbd2", 1), true);
    if (progress > 0.58) {
      const impact = (progress - 0.58) / 0.42;
      gpu.ring(ex, ey, impact * eh * 0.38, impact * eh * 0.38, 6, hexColor("#ff7344", 1 - impact));
      gpu.ring(ex, ey, impact * eh * 0.28, impact * eh * 0.28, 4, hexColor("#6de2ff", 1 - impact));
      burst(gpu, sparks, ex, ey, impact, eh / 270);
    }
  }
  if (name === "魔力護盾") {
    const pulse = 0.92 + Math.sin(progress * Math.PI * 3) * 0.05;
    gpu.ellipse(px, py, pw * 0.68 * pulse, ph * 0.58 * pulse, hexColor("#40b9ff", fade * 0.09));
    gpu.ring(px, py, pw * 0.68 * pulse, ph * 0.58 * pulse, 4, hexColor("#8deaff", fade * 0.85));
    burst(gpu, sparks, px, py, progress * 0.7, ph / 270);
  }
  if (name === "隕星術") {
    const fall = easeOut(progress * 1.5);
    const x = ex + ew * 0.7 * (1 - fall);
    const y = ey - eh * 1.05 + eh * 1.13 * fall;
    glowLine(gpu, x + ew * 0.4, y - eh * 0.58, x, y, "#ff6a39", Math.max(3, ew * 0.1));
    gpu.ring(ex, ey + eh * 0.08, Math.max(0, progress - 0.52) * eh * 0.78,
      Math.max(0, progress - 0.52) * eh * 0.78, 7, hexColor("#ff9b43", fade));
    if (progress > 0.48) burst(gpu, sparks, ex, ey + eh * 0.08, (progress - 0.48) / 0.52, eh / 270);
  }
}

export function WebGLSkillEffectCanvas({ name, effectKey, targetKey }: { name: string; effectKey: number; targetKey?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetKeyRef = useRef(targetKey);
  const [unsupported, setUnsupported] = useState(false);
  useEffect(() => { targetKeyRef.current = targetKey; }, [targetKey]);

  useEffect(() => {
    if (unsupported) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let gpu: WebGLVfxRenderer;
    try { gpu = new WebGLVfxRenderer(canvas); } catch { setUnsupported(true); return; }
    const effect = name === "鮮血怒吼・強化斬擊" ? "鮮血怒吼強化斬擊" : name.endsWith("・回響") ? name.slice(0, -3) : name;
    const duration = DURATION[effect] ?? 950;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const palette = effect.includes("致命") || effect === "處決" || effect === "鮮血怒吼"
      ? ["#ff273d", "#ff7452", "#8f001d"] : effect.includes("箭") || effect === "疾風連射"
        ? ["#78f79b", "#d9ffd5", "#45aa65"] : effect === "魔力護盾"
          ? ["#72dcff", "#d8fbff", "#477dff"] : ["#ff753e", "#ffe29a", "#6ddfff"];
    const seed = effectKey + [...effect].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const sparks = makeSparks(seed, reduced ? 10 : 42, palette);
    const sources = effect === "鮮血怒吼強化斬擊" ? BLOOD_FRAMES
      : effect === "處決" ? EXECUTION_FRAMES : effect === "裂地斬" ? GROUND_FRAMES : [];
    const images = sources.map((source) => { const image = new Image(); image.src = source; return image; });
    let animationFrame = 0, startedAt = 0, releaseAt = 0;
    const initialTarget = targetKeyRef.current;
    const resize = () => gpu.resize();
    const contextLost = (event: Event) => { event.preventDefault(); setUnsupported(true); };
    canvas.addEventListener("webglcontextlost", contextLost);
    window.addEventListener("resize", resize);
    resize();
    const render = (time: number) => {
      if (gpu.gl.isContextLost()) return;
      if (!startedAt) startedAt = time;
      const elapsed = time - startedAt;
      let progress = reduced ? 0.72 : clamp(elapsed / duration);
      let keepAnimating = !reduced && progress < 1;
      let frame = effect === "鮮血怒吼強化斬擊" ? Math.min(3, Math.floor(progress * 4))
        : effect === "裂地斬" ? reduced ? 4 : cumulativeFrame(elapsed, GROUND_SEQUENCE) : 0;
      let opacity = 1;
      if (effect === "裂地斬" && !reduced && elapsed >= 800) {
        const after = elapsed - 800;
        opacity = after < 375 ? after % 125 < 70 ? 1 : 0 : clamp(1 - (after - 375) / 220);
      }
      if (effect === "處決") {
        if (reduced) { frame = 5; keepAnimating = false; }
        else if (elapsed < 350) {
          frame = cumulativeFrame(elapsed, EXECUTION_LANDING);
          progress = clamp(elapsed / 350);
          keepAnimating = true;
        } else {
          if (!releaseAt && targetKeyRef.current !== initialTarget) releaseAt = time;
          if (!releaseAt && elapsed >= 2600) releaseAt = time;
          if (!releaseAt) { frame = 5; progress = 1; keepAnimating = true; }
          else {
            const releaseElapsed = time - releaseAt;
            frame = releaseElapsed < 120 ? 6 : 7;
            progress = clamp(releaseElapsed / 360);
            keepAnimating = releaseElapsed < 360;
          }
        }
      }
      gpu.clear();
      const anchors = readAnchors(canvas);
      const image = images[frame];
      if (image?.complete && image.naturalWidth) drawSpriteEffect(gpu, image, effect, progress, frame, opacity, anchors, sparks);
      else if (!sources.length) drawProcedural(gpu, effect, progress, anchors, sparks);
      if (keepAnimating) animationFrame = requestAnimationFrame(render);
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
  }, [effectKey, name, unsupported]);

  return unsupported
    ? <LegacySkillEffectCanvas name={name} effectKey={effectKey} targetKey={targetKey} />
    : <canvas ref={canvasRef} className="skill-effect-canvas" aria-hidden="true" />;
}
