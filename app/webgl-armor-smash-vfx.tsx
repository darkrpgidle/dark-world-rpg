"use client";

import { useEffect, useRef, useState } from "react";
import { WebGLVfxRenderer } from "./webgl-vfx-renderer";

const SPRITE_SHEETS = { normal: "/vfx/armor-smash-v2/normal.webp", ascended: "/vfx/armor-smash-v2/ascended.webp" };
const FRAME_MS = 96;
const HIT_DURATION_MS = FRAME_MS * 10;
const MISS_FADE_MS = 180;

type Props = { effectKey: number; hit: boolean; enhanced: boolean; ascended: boolean; onComplete: (effectKey: number) => void };

function frameUv(image: HTMLImageElement, frame: number): [number, number, number, number] {
  const cellWidth = image.naturalWidth / 5;
  const cellHeight = image.naturalHeight / 2;
  const column = frame % 5;
  const row = Math.floor(frame / 5);
  return [(column * cellWidth + 1) / image.naturalWidth, (row * cellHeight + 1) / image.naturalHeight,
    (cellWidth - 2) / image.naturalWidth, (cellHeight - 2) / image.naturalHeight];
}

function getAnchors(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const stage = canvas.closest(".battle-stage");
  const player = stage?.querySelector<HTMLElement>(".fighter.player .fighter-frame")?.getBoundingClientRect();
  const enemy = stage?.querySelector<HTMLElement>(".fighter.enemy .fighter-frame")?.getBoundingClientRect();
  return {
    rect,
    playerX: player ? player.left - rect.left + player.width * 0.72 : rect.width * 0.32,
    playerY: player ? player.top - rect.top + player.height * 0.48 : rect.height * 0.44,
    enemyX: enemy ? enemy.left - rect.left + enemy.width * 0.52 : rect.width * 0.72,
    enemyY: enemy ? enemy.top - rect.top + enemy.height * 0.5 : rect.height * 0.44,
    enemyWidth: enemy?.width ?? rect.width * 0.28,
    enemyHeight: enemy?.height ?? rect.height * 0.68,
  };
}

export function WebGLArmorSmashVfx({ effectKey, hit, enhanced, ascended, onComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onCompleteRef = useRef(onComplete);
  const [fallback, setFallback] = useState(false);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;
    const canvas = canvasElement;
    let renderer: WebGLVfxRenderer | null = null;
    let context: CanvasRenderingContext2D | null = null;
    if (!fallback) {
      try { renderer = new WebGLVfxRenderer(canvas); }
      catch { window.setTimeout(() => setFallback(true), 0); return; }
    } else {
      context = canvas.getContext("2d");
      if (!context) return;
    }
    const image = new Image();
    let frameId = 0;
    let startedAt = 0;
    let disposed = false;
    let completed = false;
    const finish = () => {
      if (completed) return;
      completed = true;
      onCompleteRef.current(effectKey);
    };
    image.onload = () => { if (!disposed) frameId = requestAnimationFrame(draw); };
    image.onerror = finish;
    image.src = ascended ? SPRITE_SHEETS.ascended : SPRITE_SHEETS.normal;
    const contextLost = (event: Event) => { event.preventDefault(); setFallback(true); };
    canvas.addEventListener("webglcontextlost", contextLost);
    const observer = new ResizeObserver(() => { if (!disposed) frameId = requestAnimationFrame(draw); });
    observer.observe(canvas);

    function draw(time: number) {
      if (disposed || renderer?.gl.isContextLost() || !image.complete || !image.naturalWidth) return;
      if (!startedAt) startedAt = time;
      const elapsed = time - startedAt;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const totalDuration = hit ? (reducedMotion ? 360 : HIT_DURATION_MS) : 610;
      if (elapsed >= totalDuration) { finish(); return; }
      const rawFrame = reducedMotion ? (hit ? 6 : 3) : Math.floor(elapsed / FRAME_MS);
      const frame = hit ? Math.min(9, rawFrame) : Math.min(3, rawFrame);
      const opacity = hit || elapsed <= FRAME_MS * 4 ? 1 : Math.max(0, 1 - (elapsed - FRAME_MS * 4) / MISS_FADE_MS);
      const { rect, playerX, playerY, enemyX, enemyY, enemyWidth, enemyHeight } = getAnchors(canvas);
      const size = Math.min(enemyWidth * 1.68, enemyHeight * 1.04, rect.height * 0.92);
      const travel = Math.min(1, elapsed / (FRAME_MS * 3.15));
      const x = playerX + (enemyX - playerX) * travel;
      const y = playerY + (enemyY - playerY) * travel - Math.sin(travel * Math.PI) * enemyHeight * 0.12;
      const drawX = x - size / 2;
      const drawY = y - size / 2;

      if (renderer) {
        renderer.resize();
        renderer.clear();
        if (opacity > 0) renderer.sprite(image, drawX, drawY, size, size, opacity, true, frameUv(image, frame));
        if (hit && enhanced && frame >= 4 && frame <= 7) {
          const pulse = 1 - Math.abs(frame - 5.5) / 2.5;
          renderer.ring(enemyX, enemyY, size * (0.25 + pulse * 0.16), size * 0.075,
            [1, 0.39, 0.08, 0.68 * pulse], true);
          if (frame === 5 || frame === 6)
            renderer.sprite(image, drawX - size * 0.035, drawY - size * 0.035, size * 1.07, size * 1.07,
              0.26 * pulse, true, frameUv(image, frame));
        }
      } else if (context) {
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.max(1, Math.round(rect.width * ratio));
        canvas.height = Math.max(1, Math.round(rect.height * ratio));
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, rect.width, rect.height);
        const cellWidth = image.naturalWidth / 5;
        const cellHeight = image.naturalHeight / 2;
        const drawSprite = (frameNumber: number, dx: number, dy: number, width: number, height: number, alpha: number) => {
          context!.globalAlpha = alpha;
          context!.globalCompositeOperation = "lighter";
          context!.drawImage(image, (frameNumber % 5) * cellWidth, Math.floor(frameNumber / 5) * cellHeight,
            cellWidth, cellHeight, dx, dy, width, height);
        };
        if (opacity > 0) drawSprite(frame, drawX, drawY, size, size, opacity);
        if (hit && enhanced && frame >= 4 && frame <= 7) {
          context.globalAlpha = 0.7;
          context.globalCompositeOperation = "lighter";
          context.strokeStyle = "rgba(255,151,43,.9)";
          context.lineWidth = Math.max(2, size * 0.045);
          context.beginPath();
          context.arc(enemyX, enemyY, size * 0.37, 0, Math.PI * 2);
          context.stroke();
        }
        context.globalAlpha = 1;
        context.globalCompositeOperation = "source-over";
      }
      frameId = requestAnimationFrame(draw);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", contextLost);
      image.onload = null;
      image.onerror = null;
      if (renderer && !renderer.gl.isContextLost()) renderer.dispose();
    };
  }, [effectKey, hit, enhanced, ascended, fallback]);

  return fallback
    ? <ArmorSmashCanvasFallback key={`fallback-${effectKey}`} {...{ effectKey, hit, enhanced, ascended, onComplete }} />
    : <canvas key={`webgl-${effectKey}`} ref={canvasRef} className="skill-effect-canvas" aria-hidden="true" />;
}

function ArmorSmashCanvasFallback({ effectKey, hit, enhanced, ascended, onComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;
    const canvas = canvasElement;
    const contextValue = canvas.getContext("2d");
    if (!contextValue) return;
    const context = contextValue;
    const image = new Image();
    let frameId = 0;
    let startedAt = 0;
    let disposed = false;
    let completed = false;
    const finish = () => { if (!completed) { completed = true; onCompleteRef.current(effectKey); } };
    image.onload = () => { if (!disposed) frameId = requestAnimationFrame(draw); };
    image.onerror = finish;
    image.src = ascended ? SPRITE_SHEETS.ascended : SPRITE_SHEETS.normal;
    const observer = new ResizeObserver(() => { if (!disposed) frameId = requestAnimationFrame(draw); });
    observer.observe(canvas);
    function draw(time: number) {
      if (disposed || !image.complete || !image.naturalWidth) return;
      if (!startedAt) startedAt = time;
      const elapsed = time - startedAt;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const duration = hit ? (reducedMotion ? 360 : HIT_DURATION_MS) : 610;
      if (elapsed >= duration) { finish(); return; }
      const frame = hit ? Math.min(9, reducedMotion ? 6 : Math.floor(elapsed / FRAME_MS))
        : Math.min(3, reducedMotion ? 3 : Math.floor(elapsed / FRAME_MS));
      const opacity = hit || elapsed <= FRAME_MS * 4 ? 1 : Math.max(0, 1 - (elapsed - FRAME_MS * 4) / MISS_FADE_MS);
      const { rect, playerX, playerY, enemyX, enemyY, enemyWidth, enemyHeight } = getAnchors(canvas);
      const size = Math.min(enemyWidth * 1.68, enemyHeight * 1.04, rect.height * 0.92);
      const travel = Math.min(1, elapsed / (FRAME_MS * 3.15));
      const x = playerX + (enemyX - playerX) * travel;
      const y = playerY + (enemyY - playerY) * travel - Math.sin(travel * Math.PI) * enemyHeight * 0.12;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(rect.width * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, rect.width, rect.height);
      const cellWidth = image.naturalWidth / 5;
      const cellHeight = image.naturalHeight / 2;
      context.globalAlpha = opacity;
      context.globalCompositeOperation = "lighter";
      context.drawImage(image, (frame % 5) * cellWidth, Math.floor(frame / 5) * cellHeight,
        cellWidth, cellHeight, x - size / 2, y - size / 2, size, size);
      if (hit && enhanced && frame >= 4 && frame <= 7) {
        context.globalAlpha = 0.7;
        context.strokeStyle = "rgba(255,151,43,.9)";
        context.lineWidth = Math.max(2, size * 0.045);
        context.beginPath();
        context.arc(enemyX, enemyY, size * 0.37, 0, Math.PI * 2);
        context.stroke();
      }
      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
      frameId = requestAnimationFrame(draw);
    }
    return () => { disposed = true; cancelAnimationFrame(frameId); observer.disconnect(); image.onload = null; image.onerror = null; };
  }, [effectKey, hit, enhanced, ascended]);
  return <canvas ref={canvasRef} className="skill-effect-canvas" aria-hidden="true" />;
}
