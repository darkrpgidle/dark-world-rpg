"use client";

import { useEffect, useRef } from "react";

type Spark = {
  angle: number;
  distance: number;
  size: number;
  delay: number;
  color: string;
};

type CombatAnchors = {
  playerX: number;
  playerY: number;
  playerWidth: number;
  playerHeight: number;
  enemyX: number;
  enemyY: number;
  enemyWidth: number;
  enemyHeight: number;
  groundY: number;
};

// VFX scaling standard: all new combat effects must derive their size from
// these fighter-frame dimensions, never from the battle-stage viewport.

const EFFECT_DURATION: Record<string, number> = {
  鮮血怒吼強化斬擊: 680,
  裂地斬: 1395,
  鮮血怒吼: 1050,
  處決: 1900,
  霜火新星: 1250,
  魔力護盾: 1150,
  隕星術: 1300,
  套裝共鳴: 1100,
};

const PREMIUM_VFX_ASSETS: Record<string, string> = {
};

const BLOOD_ROAR_BASIC_ATTACK_FRAMES = [
  "/vfx/blood-roar-basic/frame-00.png",
  "/vfx/blood-roar-basic/frame-01.png",
  "/vfx/blood-roar-basic/frame-02.png",
  "/vfx/blood-roar-basic/frame-03.png",
];

const EXECUTION_FRAMES = [
  "/vfx/execution/frame-00.png",
  "/vfx/execution/frame-01.png",
  "/vfx/execution/frame-02.png",
  "/vfx/execution/frame-03.png",
  "/vfx/execution/frame-04.png",
  "/vfx/execution/frame-05.png",
  "/vfx/execution/frame-06.png",
  "/vfx/execution/frame-07.png",
];

// The first five frames are the fall-to-impact portion.  Keep the first
// three extremely short so the sword hits with a snap, then give the impact
// and settling frames enough time to read before frame 05 holds at the mark.
const EXECUTION_LANDING_FRAME_DURATIONS = [45, 35, 55, 75, 140] as const;
const EXECUTION_LANDING_DURATION = EXECUTION_LANDING_FRAME_DURATIONS.reduce(
  (total, duration) => total + duration,
  0,
);

function executionLandingFrame(elapsed: number) {
  let elapsedAtFrameStart = 0;
  for (let frameIndex = 0; frameIndex < EXECUTION_LANDING_FRAME_DURATIONS.length; frameIndex += 1) {
    elapsedAtFrameStart += EXECUTION_LANDING_FRAME_DURATIONS[frameIndex];
    if (elapsed < elapsedAtFrameStart) return frameIndex;
  }
  return 5;
}

const GROUND_SPLIT_FRAMES = Array.from(
  { length: 5 },
  (_, index) => `/vfx/ground-split-v2/frame-${String(index).padStart(2, "0")}.png`,
);

// The crack travels in a quick burst, pauses for the first eruption, then
// lands on the final impact frame. The final frame flashes three times before
// its short fade so the hit feels heavy without leaving a static decal behind.
const GROUND_SPLIT_FRAME_DURATIONS = [110, 100, 140, 190, 260];
const GROUND_SPLIT_SEQUENCE_DURATION = GROUND_SPLIT_FRAME_DURATIONS.reduce((sum, duration) => sum + duration, 0);
const GROUND_SPLIT_FLASH_VISIBLE_MS = 70;
const GROUND_SPLIT_FLASH_HIDDEN_MS = 55;
const GROUND_SPLIT_FLASH_COUNT = 3;
const GROUND_SPLIT_FLASH_DURATION = (GROUND_SPLIT_FLASH_VISIBLE_MS + GROUND_SPLIT_FLASH_HIDDEN_MS) * GROUND_SPLIT_FLASH_COUNT;
const GROUND_SPLIT_FADE_DURATION = 220;

function groundSplitFrameAt(elapsed: number) {
  let elapsedInSequence = elapsed;
  for (let index = 0; index < GROUND_SPLIT_FRAME_DURATIONS.length; index += 1) {
    elapsedInSequence -= GROUND_SPLIT_FRAME_DURATIONS[index];
    if (elapsedInSequence < 0) return index;
  }
  return GROUND_SPLIT_FRAME_DURATIONS.length - 1;
}

function groundSplitFinalOpacity(elapsed: number) {
  if (elapsed < GROUND_SPLIT_SEQUENCE_DURATION) return 1;
  const flashElapsed = elapsed - GROUND_SPLIT_SEQUENCE_DURATION;
  if (flashElapsed < GROUND_SPLIT_FLASH_DURATION) {
    return flashElapsed % (GROUND_SPLIT_FLASH_VISIBLE_MS + GROUND_SPLIT_FLASH_HIDDEN_MS) < GROUND_SPLIT_FLASH_VISIBLE_MS
      ? 1
      : 0;
  }
  const fadeElapsed = flashElapsed - GROUND_SPLIT_FLASH_DURATION;
  return Math.max(0, 1 - fadeElapsed / GROUND_SPLIT_FADE_DURATION);
}

function baseEffectName(name: string) {
  if (name === "鮮血怒吼・強化斬擊") return "鮮血怒吼強化斬擊";
  return name.endsWith("・回響") ? name.slice(0, -3) : name;
}

function resolveCombatAnchors(canvas: HTMLCanvasElement, rect: DOMRect): CombatAnchors {
  const stage = canvas.closest(".battle-stage");
  const playerFrame = stage?.querySelector<HTMLElement>(".fighter.player .fighter-frame");
  const enemyFrame = stage?.querySelector<HTMLElement>(".fighter.enemy .fighter-frame");

  if (!playerFrame || !enemyFrame) {
    return {
      playerX: rect.width * 0.3,
      playerY: rect.height * 0.43,
      playerWidth: rect.width * 0.3,
      playerHeight: rect.height * 0.68,
      enemyX: rect.width * 0.71,
      enemyY: rect.height * 0.43,
      enemyWidth: rect.width * 0.3,
      enemyHeight: rect.height * 0.68,
      groundY: rect.height * 0.72,
    };
  }

  const playerRect = playerFrame.getBoundingClientRect();
  const enemyRect = enemyFrame.getBoundingClientRect();
  return {
    playerX: playerRect.left - rect.left + playerRect.width / 2,
    playerY: playerRect.top - rect.top + playerRect.height / 2,
    playerWidth: playerRect.width,
    playerHeight: playerRect.height,
    enemyX: enemyRect.left - rect.left + enemyRect.width / 2,
    enemyY: enemyRect.top - rect.top + enemyRect.height / 2,
    enemyWidth: enemyRect.width,
    enemyHeight: enemyRect.height,
    groundY: Math.min(rect.height - 8, Math.max(playerRect.bottom, enemyRect.bottom) - rect.top),
  };
}

function drawPremiumVfx(
  ctx: CanvasRenderingContext2D,
  asset: HTMLImageElement,
  effect: string,
  progress: number,
  width: number,
  height: number,
  frameIndex: number,
  anchors: CombatAnchors,
  sparks: Spark[],
  opacity = 1,
) {
  const intro = Math.min(1, progress * 4.5);
  const fade = Math.max(0, Math.min(1, (1 - progress) * 5));
  const compactBloodRoar = effect === "鮮血怒吼強化斬擊";
  const execution = effect === "處決";
  const groundSplit = effect === "裂地斬";
  // Keep the 750ms beat, but accelerate sharply into the impact so the blade
  // feels like it is being driven down rather than sliding at constant speed.
  const executionDropProgress = execution && frameIndex <= 5 ? Math.min(1, Math.pow(progress, 2.35)) : 1;
  const groundSplitFade = groundSplit ? opacity : 1;
  const executionSplitProgress = execution && frameIndex === 6
    ? Math.min(1, progress / (120 / 360))
    : 0;
  const executionDissipateProgress = execution && frameIndex === 7
    ? Math.min(1, Math.max(0, (progress - 120 / 360) / (240 / 360)))
    : 0;
  const scale = compactBloodRoar
      ? 0.9 + easeOut(intro) * 0.08
      : execution
        ? (0.9 + easeOut(intro) * 0.06) * (1 + executionSplitProgress * 0.04 + executionDissipateProgress * 0.13)
      : 0.68 + easeOut(intro) * 0.3;
  const drift = compactBloodRoar || execution ? 0 : (1 - intro) * anchors.enemyWidth * 0.18;
  const assetRatio = asset.naturalWidth / asset.naturalHeight;
  const groundSplitTravel = groundSplit && frameIndex <= 2;
  const groundSplitWidth = groundSplitTravel
    ? anchors.enemyX - anchors.playerX + anchors.playerWidth * 0.36 + anchors.enemyWidth * 0.4
    : Math.max(anchors.enemyWidth * 1.32, anchors.enemyHeight * 0.94);
  const targetWidth = groundSplit
      ? groundSplitWidth * scale
    : compactBloodRoar
      ? Math.min(anchors.enemyWidth * 1.35, anchors.enemyHeight * 0.52) * scale
      : execution
        ? Math.min(anchors.enemyWidth * 1.7, anchors.enemyHeight * 0.84) * scale
        : anchors.enemyWidth * scale;
  // The five frames have deliberately varied silhouettes. Their visual
  // footprint is frame-relative, not asset-aspect-ratio-relative, so the
  // ground path keeps the same low profile on mobile and desktop.
  const targetHeight = groundSplit
    ? (groundSplitTravel ? anchors.enemyHeight * 0.52 : anchors.enemyHeight * 0.8) * scale
    : targetWidth / assetRatio;
  const x = compactBloodRoar
      ? anchors.enemyX - targetWidth / 2
    : execution
        ? anchors.enemyX - targetWidth / 2
      : groundSplit
        ? groundSplitTravel
          ? anchors.playerX - anchors.playerWidth * 0.2
          : anchors.enemyX - targetWidth / 2
      : (width - targetWidth) / 2 - drift;
  const y = groundSplit
    ? Math.max(-8, Math.min(height - targetHeight + 8, anchors.groundY - targetHeight * 0.82))
    : compactBloodRoar
    ? anchors.enemyY - targetHeight / 2
    : execution
      ? anchors.enemyY - targetHeight / 2 - (1 - executionDropProgress) * anchors.enemyHeight * 1.18
    : (height - targetHeight) / 2 + height * 0.035;

  const executionOpacity = frameIndex === 6
    ? 1 - executionSplitProgress * 0.18
    : frameIndex === 7
      ? Math.max(0, 1 - executionDissipateProgress) ** 0.8
      : 1;
  ctx.save();
  ctx.globalAlpha = (execution
    ? executionOpacity
    : groundSplit
      ? groundSplitFade
    : compactBloodRoar
      ? Math.min(1, intro * 2.5) * Math.max(0.08, fade)
      : Math.min(1, intro * 1.8) * Math.max(0.12, fade)) * opacity;
  ctx.globalCompositeOperation = "lighter";
  ctx.filter = compactBloodRoar
      ? "drop-shadow(0 0 8px rgba(188, 19, 35, .8))"
      : execution
        ? "drop-shadow(0 0 16px rgba(255, 47, 47, .92)) drop-shadow(0 0 6px rgba(255, 224, 166, .78))"
        : "drop-shadow(0 0 16px rgba(175, 24, 38, .72))";
  if (execution && frameIndex <= 5 && executionDropProgress > 0.025) {
    const trailFade = Math.min(1, executionDropProgress * 1.8);
    ctx.save();
    ctx.globalAlpha = (1 - executionDropProgress) * 0.72 + 0.12;
    for (let index = 0; index < 6; index += 1) {
      const offset = (index - 2.5) * targetWidth * 0.055;
      const tail = targetHeight * (0.34 + index * 0.075) * (1.1 - executionDropProgress * 0.45);
      glowLine(
        ctx,
        x + targetWidth * 0.5 + offset,
        y - tail,
        x + targetWidth * 0.5 + offset * 0.35,
        y - targetHeight * 0.08,
        index % 2 ? "#ff4b36" : "#ffd29d",
        Math.max(1.5, targetWidth * (0.008 - index * 0.00045)),
        10 + trailFade * 10,
      );
    }
    ctx.restore();
  }
  if (execution && frameIndex === 6) {
    // Split the supplied VFX image into two halves before it breaks apart.
    const separation = targetWidth * 0.075 * easeOut(executionSplitProgress);
    const halfWidth = targetWidth / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - separation, y - 2, halfWidth + separation, targetHeight + 4);
    ctx.clip();
    ctx.drawImage(asset, x - separation, y + targetHeight * 0.035 * executionSplitProgress, targetWidth, targetHeight);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + halfWidth, y - 2, halfWidth + separation, targetHeight + 4);
    ctx.clip();
    ctx.drawImage(asset, x + separation, y - targetHeight * 0.025 * executionSplitProgress, targetWidth, targetHeight);
    ctx.restore();
  } else {
    ctx.drawImage(asset, x, y, targetWidth, targetHeight);
  }
  ctx.restore();

  if (execution && (frameIndex === 6 || frameIndex === 7)) {
    const breakup = frameIndex === 6 ? executionSplitProgress * 0.58 : 0.58 + executionDissipateProgress * 0.42;
    burst(ctx, sparks, anchors.enemyX, anchors.enemyY, breakup, anchors.enemyHeight / 180);
    if (frameIndex === 6 && executionSplitProgress > 0.15) {
      shockwave(ctx, anchors.enemyX, anchors.enemyY, anchors.enemyHeight * 0.14 * executionSplitProgress, "#ff6046", (1 - executionSplitProgress) * 0.48);
    }
  }

  if (groundSplit) {
    const impactProgress = frameIndex < 3 ? 0 : Math.max(0, Math.min(1, (progress - 0.44) / 0.56));
    if (impactProgress > 0) {
      const impactX = anchors.enemyX;
      const impactY = anchors.groundY;
      shockwave(ctx, impactX, impactY, anchors.enemyHeight * 0.3 * easeOut(impactProgress), "#ff6a38", (1 - impactProgress) * 0.9);
      burst(ctx, sparks, impactX, impactY, impactProgress, anchors.enemyHeight / 270);
      flash(ctx, width, height, Math.max(0, 0.16 - impactProgress * 0.16), "#ffdca0");
    }
  }
}

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function easeOut(value: number) {
  return 1 - (1 - value) ** 3;
}

function glowLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width: number,
  blur = 14,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function ring(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  alpha: number,
  width = 3,
) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.shadowColor = color;
  ctx.shadowBlur = 15;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, radius), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function burst(
  ctx: CanvasRenderingContext2D,
  sparks: Spark[],
  x: number,
  y: number,
  progress: number,
  scale = 1,
) {
  for (const spark of sparks) {
    const local = Math.max(0, Math.min(1, (progress - spark.delay) / (1 - spark.delay)));
    if (local <= 0) continue;
    const distance = spark.distance * scale * easeOut(local);
    const px = x + Math.cos(spark.angle) * distance;
    const py = y + Math.sin(spark.angle) * distance;
    ctx.save();
    ctx.globalAlpha = (1 - local) * 0.95;
    ctx.fillStyle = spark.color;
    ctx.shadowColor = spark.color;
    ctx.shadowBlur = 9;
    ctx.beginPath();
    ctx.arc(px, py, spark.size * (1 - local * 0.55), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function flash(ctx: CanvasRenderingContext2D, width: number, height: number, alpha: number, color = "#fff4d6") {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function shockwave(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, alpha: number) {
  ring(ctx, x, y, radius, color, alpha, Math.max(3, radius * 0.035));
  ring(ctx, x, y, radius * 0.72, "#fff4d0", alpha * 0.55, Math.max(2, radius * 0.018));
}

function makeSparks(seed: number, count: number, colors: string[], maxDistance: number) {
  const random = seeded(seed);
  return Array.from({ length: count }, () => ({
    angle: random() * Math.PI * 2,
    distance: maxDistance * (0.35 + random() * 0.65),
    size: 1.5 + random() * 3.5,
    delay: random() * 0.24,
    color: colors[Math.floor(random() * colors.length)],
  }));
}

function drawEffect(
  ctx: CanvasRenderingContext2D,
  name: string,
  progress: number,
  width: number,
  height: number,
  sparks: Spark[],
  anchors: CombatAnchors,
) {
  const left = anchors.playerX;
  const right = anchors.enemyX;
  const playerW = anchors.playerWidth;
  const playerY = anchors.playerY;
  const playerH = anchors.playerHeight;
  const enemyW = anchors.enemyWidth;
  const centerY = anchors.enemyY;
  const enemyH = anchors.enemyHeight;
  const playerScale = playerH / 270;
  const enemyScale = enemyH / 270;
  const fade = Math.max(0, 1 - progress);

  if (name === "套裝共鳴") {
    const impact = easeOut(Math.min(1, progress * 1.35));
    const radius = enemyH * (0.12 + impact * 0.58);
    const alpha = Math.max(0, 1 - progress * 0.92);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.translate(right, centerY);
    ctx.rotate(progress * Math.PI * 2.4);
    for (let index = 0; index < 3; index += 1) {
      ctx.save();
      ctx.rotate(index * (Math.PI * 2 / 3));
      ctx.globalAlpha = alpha * (0.85 - index * 0.12);
      const color = index === 0 ? "#a7fff0" : index === 1 ? "#6fc8ff" : "#c8a1ff";
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(3, enemyW * 0.035);
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(0, 0, radius, -0.8, 0.8);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    const core = ctx.createRadialGradient(right, centerY, 0, right, centerY, enemyH * 0.2);
    core.addColorStop(0, `rgba(255,255,235,${Math.min(1, alpha)})`);
    core.addColorStop(0.25, `rgba(139,255,231,${alpha * 0.82})`);
    core.addColorStop(1, "rgba(84,153,255,0)");
    ctx.fillStyle = core;
    ctx.fillRect(right - enemyH * 0.2, centerY - enemyH * 0.2, enemyH * 0.4, enemyH * 0.4);
    shockwave(ctx, right, centerY, radius, "#83f5dc", alpha);
    burst(ctx, sparks, right, centerY, progress, enemyScale);
    if (progress < 0.22) flash(ctx, width, height, (0.22 - progress) * 0.7, "#d9fff2");
  }

  if (name === "鮮血怒吼") {
    // Buff VFX: the portrait remains untouched. The roar begins tight on the
    // player's card edge, then sends fiery contours and embers outward.
    const pulse = easeOut(Math.min(1, progress * 1.55));
    const cardHalfWidth = playerW * 0.5;
    const cardHalfHeight = playerH * 0.5;
    const maxExpansion = Math.min(playerW * 0.17, playerH * 0.12);
    ctx.save();
    ctx.translate(left, playerY);
    ctx.globalCompositeOperation = "lighter";
    for (let wave = 0; wave < 3; wave += 1) {
      const local = Math.max(0, Math.min(1, (pulse - wave * 0.14) / 0.86));
      if (local <= 0) continue;
      const expansion = maxExpansion * easeOut(local);
      const alpha = Math.max(0, 1 - local) * (0.74 - wave * 0.12) * fade;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = wave === 0 ? "#ffb05b" : wave === 1 ? "#e63c38" : "#8d071a";
      ctx.lineWidth = wave === 0 ? 3.4 : 2.4;
      ctx.shadowColor = wave === 0 ? "#ff5a37" : "#a3071d";
      ctx.shadowBlur = 17 - wave * 3;
      ctx.beginPath();
      ctx.roundRect(
        -cardHalfWidth - expansion,
        -cardHalfHeight - expansion,
        (cardHalfWidth + expansion) * 2,
        (cardHalfHeight + expansion) * 2,
        18 + expansion * 0.22,
      );
      ctx.stroke();
      ctx.restore();
    }

    // Four edge-bound flame currents: all motion starts on the card rim and
    // travels away from it, keeping the illustration area clear.
    for (let i = 0; i < 20; i += 1) {
      const side = i % 4;
      const along = ((i * 37 + 19) % 100) / 100 - 0.5;
      const local = Math.max(0, Math.min(1, (pulse - (i % 5) * 0.055) / 0.82));
      if (local <= 0) continue;
      const travel = maxExpansion * (0.18 + 0.82 * easeOut(local));
      const length = 7 + 16 * (1 - local);
      let startX = 0;
      let startY = 0;
      let nx = 0;
      let ny = 0;
      if (side === 0) {
        startX = along * cardHalfWidth * 1.75;
        startY = -cardHalfHeight;
        ny = -1;
      } else if (side === 1) {
        startX = cardHalfWidth;
        startY = along * cardHalfHeight * 1.75;
        nx = 1;
      } else if (side === 2) {
        startX = along * cardHalfWidth * 1.75;
        startY = cardHalfHeight;
        ny = 1;
      } else {
        startX = -cardHalfWidth;
        startY = along * cardHalfHeight * 1.75;
        nx = -1;
      }
      const endX = startX + nx * (travel + length);
      const endY = startY + ny * (travel + length);
      glowLine(
        ctx,
        startX + nx * travel,
        startY + ny * travel,
        endX,
        endY,
        i % 3 === 0 ? "#ffd37d" : "#d31d32",
        i % 3 === 0 ? 2.4 : 1.6,
        10,
      );
    }
    ctx.restore();
    shockwave(ctx, left, playerY, maxExpansion * 1.8 * pulse, "#e32b36", (1 - pulse) * 0.9);
    burst(ctx, sparks, left, playerY, pulse, playerScale);
  }

  if (name === "處決") {
    const cut = easeOut(Math.min(1, progress * 1.7));
    const slashStart = left + (right - left) * 0.14;
    const slashEnd = slashStart + (right - slashStart) * cut;
    glowLine(ctx, slashStart, playerY + playerH * 0.16, slashEnd, centerY - enemyH * 0.16, "#ffede4", Math.max(2, enemyW * 0.03), 22);
    glowLine(ctx, slashStart, playerY + playerH * 0.19, slashEnd, centerY - enemyH * 0.13, "#e3182d", Math.max(4, enemyW * 0.08), 18);
    glowLine(ctx, slashStart, playerY - playerH * 0.16, slashEnd, centerY + enemyH * 0.16, "#ff4a3d", Math.max(2, enemyW * 0.04), 20);
    burst(ctx, sparks, right, centerY, progress, enemyScale);
    if (progress > 0.36) {
      const impact = (progress - 0.36) / 0.64;
      shockwave(ctx, right, centerY, enemyH * 0.52 * easeOut(impact), "#ff2437", 1 - impact);
      flash(ctx, width, height, Math.max(0, 0.28 - impact * 0.28), "#ffe4d5");
    }
  }

  if (name === "霜火新星") {
    const travel = easeOut(Math.min(1, progress * 1.35));
    const x = left + (right - left) * travel;
    const y = playerY + (centerY - playerY) * travel + enemyH * 0.12 - Math.sin(travel * Math.PI) * Math.max(playerH, enemyH) * 0.3;
    const fire = ctx.createRadialGradient(x, y, 0, x, y, enemyH * 0.075);
    fire.addColorStop(0, "#fffbd2");
    fire.addColorStop(0.28, "#61d9ff");
    fire.addColorStop(0.58, "#ff813d");
    fire.addColorStop(1, "rgba(185,18,48,0)");
    ctx.fillStyle = fire;
    ctx.fillRect(x - enemyH * 0.08, y - enemyH * 0.08, enemyH * 0.16, enemyH * 0.16);
    if (progress > 0.58) {
      const impact = (progress - 0.58) / 0.42;
      ring(ctx, right, centerY, impact * enemyH * 0.38, "#ff7344", 1 - impact, 6);
      ring(ctx, right, centerY, impact * enemyH * 0.28, "#6de2ff", 1 - impact, 4);
      burst(ctx, sparks, right, centerY, impact, enemyScale);
    }
  }

  if (name === "魔力護盾") {
    const pulse = 0.92 + Math.sin(progress * Math.PI * 3) * 0.05;
    ctx.save();
    ctx.globalAlpha = fade * 0.85;
    ctx.strokeStyle = "#8deaff";
    ctx.fillStyle = "rgba(64,185,255,0.09)";
    ctx.lineWidth = 4;
    ctx.shadowColor = "#47cfff";
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.ellipse(left, playerY, playerW * 0.68 * pulse, playerH * 0.58 * pulse, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    burst(ctx, sparks, left, playerY, progress * 0.7, playerScale);
  }

  if (name === "隕星術") {
    const fall = easeOut(Math.min(1, progress * 1.5));
    const x = right + enemyW * 0.7 * (1 - fall);
    const y = centerY - enemyH * 1.05 + enemyH * 1.13 * fall;
    glowLine(ctx, x + enemyW * 0.4, y - enemyH * 0.58, x, y, "#ff6a39", Math.max(3, enemyW * 0.1), 25);
    ring(ctx, right, centerY + enemyH * 0.08, Math.max(0, progress - 0.52) * enemyH * 0.78, "#ff9b43", fade * 1.8, 7);
    if (progress > 0.48) burst(ctx, sparks, right, centerY + enemyH * 0.08, (progress - 0.48) / 0.52, enemyScale);
  }
}

export function SkillEffectCanvas({
  name,
  effectKey,
  targetKey,
}: {
  name: string;
  effectKey: number;
  targetKey?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetKeyRef = useRef(targetKey);

  useEffect(() => {
    targetKeyRef.current = targetKey;
  }, [targetKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const effect = baseEffectName(name);
    const duration = EFFECT_DURATION[effect] ?? 950;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const seed = effectKey + [...effect].reduce((sum, letter) => sum + letter.charCodeAt(0), 0);
    const palette = effect.includes("致命") || effect === "處決" || effect === "鮮血怒吼"
      ? ["#ff273d", "#ff7452", "#8f001d"]
      : effect.includes("箭") || effect === "疾風連射"
        ? ["#78f79b", "#d9ffd5", "#45aa65"]
        : effect === "魔力護盾"
          ? ["#72dcff", "#d8fbff", "#477dff"]
          : ["#ff753e", "#ffe29a", "#6ddfff"];
    const sparks = makeSparks(seed, reducedMotion ? 10 : 42, palette, 150);
    const assetSources = effect === "鮮血怒吼強化斬擊"
        ? BLOOD_ROAR_BASIC_ATTACK_FRAMES
        : effect === "處決"
          ? EXECUTION_FRAMES
          : effect === "裂地斬"
            ? GROUND_SPLIT_FRAMES
      : PREMIUM_VFX_ASSETS[effect]
        ? [PREMIUM_VFX_ASSETS[effect]]
        : [];
    const premiumAssets = assetSources.map((source) => {
      const image = new Image();
      image.src = source;
      return image;
    });
    let animationFrame = 0;
    let startedAt = 0;
    let executionReleaseAt = 0;
    const executionTargetKey = targetKeyRef.current;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(rect.width * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();

    const render = (time: number) => {
      if (!startedAt) startedAt = time;
      const rect = canvas.getBoundingClientRect();
      const elapsed = time - startedAt;
      let progress = reducedMotion ? 0.72 : Math.min(1, elapsed / duration);
      let keepAnimating = !reducedMotion && progress < 1;
      context.clearRect(0, 0, rect.width, rect.height);
      const anchors = resolveCombatAnchors(canvas, rect);
      let frameIndex = effect === "鮮血怒吼強化斬擊"
          ? Math.min(BLOOD_ROAR_BASIC_ATTACK_FRAMES.length - 1, Math.floor(progress * BLOOD_ROAR_BASIC_ATTACK_FRAMES.length))
        : effect === "裂地斬"
          ? reducedMotion
            ? GROUND_SPLIT_FRAMES.length - 1
            : groundSplitFrameAt(elapsed)
        : 0;
      let groundSplitOpacity = 1;
      if (effect === "裂地斬") {
        groundSplitOpacity = reducedMotion ? 1 : groundSplitFinalOpacity(elapsed);
      }
      if (effect === "處決") {
        if (reducedMotion) {
          frameIndex = 5;
          keepAnimating = false;
        } else if (elapsed < EXECUTION_LANDING_DURATION) {
          frameIndex = executionLandingFrame(elapsed);
          progress = Math.min(1, elapsed / EXECUTION_LANDING_DURATION);
          keepAnimating = true;
        } else {
          if (!executionReleaseAt && targetKeyRef.current !== executionTargetKey) {
            executionReleaseAt = time;
          }
          if (!executionReleaseAt && elapsed >= 2600) executionReleaseAt = time;
          if (!executionReleaseAt) {
            frameIndex = 5;
            progress = 1;
            keepAnimating = true;
          } else {
            const releaseElapsed = time - executionReleaseAt;
            // Frames 7-8 are deliberately brief: split, scatter, vanish.
            frameIndex = releaseElapsed < 120 ? 6 : 7;
            progress = Math.min(1, releaseElapsed / 360);
            keepAnimating = releaseElapsed < 360;
          }
        }
      }
      const premiumAsset = premiumAssets[frameIndex];
      if (premiumAsset?.complete && premiumAsset.naturalWidth > 0) {
        // Each supplied frame already contains the previous ground break.
        // Rendering only the active frame prevents the old path from stacking
        // beneath the final explosion or remaining after its flash-out.
        drawPremiumVfx(context, premiumAsset, effect, progress, rect.width, rect.height, frameIndex, anchors, sparks, groundSplitOpacity);
      } else if (!["處決", "裂地斬", "鮮血怒吼強化斬擊"].includes(effect)) {
        // Frame-based warrior VFX must never fall back to the old procedural
        // renderer while an image is still loading; that fallback was the
        // intermittent Pixi-like effect seen during execution.
        context.globalCompositeOperation = "lighter";
        drawEffect(context, effect, progress, rect.width, rect.height, sparks, anchors);
      }
      context.globalCompositeOperation = "source-over";
      if (keepAnimating) animationFrame = requestAnimationFrame(render);
    };
    animationFrame = requestAnimationFrame(render);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
    };
  }, [effectKey, name]);

  return <canvas ref={canvasRef} className="skill-effect-canvas" aria-hidden="true" />;
}
