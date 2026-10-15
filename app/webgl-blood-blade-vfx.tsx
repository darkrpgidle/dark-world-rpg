"use client";

import { useEffect, useRef, useState } from "react";
import { WebGLVfxRenderer } from "./webgl-vfx-renderer";

const SPRITE_SHEET = "/vfx/blood-blade/frame-sheet.webp";
const FRAME_COUNT = 8;
const DURATION = 720;

export function WebGLBloodBladeVfx({ effectKey }: { effectKey: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    if (fallback) return;
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;
    const canvas = canvasElement;
    let renderer: WebGLVfxRenderer;
    try {
      renderer = new WebGLVfxRenderer(canvas);
    } catch {
      window.setTimeout(() => setFallback(true), 0);
      return;
    }

    let frameId = 0;
    let startedAt = 0;
    let disposed = false;
    const image = new Image();
    image.onload = () => { if (!disposed) frameId = requestAnimationFrame(render); };
    image.onerror = () => { if (!disposed) setFallback(true); };
    image.src = SPRITE_SHEET;
    const contextLost = (event: Event) => {
      event.preventDefault();
      setFallback(true);
    };
    const observer = new ResizeObserver(() => {
      if (disposed) return;
      renderer.resize();
      frameId = requestAnimationFrame(render);
    });
    canvas.addEventListener("webglcontextlost", contextLost);
    observer.observe(canvas);

    function render(time: number) {
      if (disposed || renderer.gl.isContextLost()) return;
      if (!image.complete || !image.naturalWidth) return;
      if (!startedAt) startedAt = time;
      const rect = canvas.getBoundingClientRect();
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const progress = reducedMotion ? 0.72 : Math.min(1, (time - startedAt) / DURATION);
      const player = canvas.closest(".battle-stage")
        ?.querySelector<HTMLElement>(".fighter.player .fighter-frame")?.getBoundingClientRect();
      const enemy = canvas.closest(".battle-stage")
        ?.querySelector<HTMLElement>(".fighter.enemy .fighter-frame")?.getBoundingClientRect();
      const centerX = enemy ? enemy.left - rect.left + enemy.width / 2 : rect.width * 0.7;
      const centerY = enemy ? enemy.top - rect.top + enemy.height / 2 : rect.height * 0.43;
      const enemyWidth = enemy?.width ?? rect.width * 0.3;
      const enemyHeight = enemy?.height ?? rect.height * 0.68;
      const playerCenterX = player ? player.left - rect.left + player.width / 2 : rect.width * 0.28;
      const frameIndex = Math.min(FRAME_COUNT - 1, Math.floor(progress * FRAME_COUNT));
      const approach = Math.min(1, progress * 2.8);
      const effectCenterX = playerCenterX + (centerX - playerCenterX) * approach;
      const size = Math.min(enemyWidth * 1.6, enemyHeight * 0.96);

      renderer.resize();
      renderer.clear();
      if (image.complete && image.naturalWidth > 0 && progress < 1) {
        const column = frameIndex % 4;
        const row = Math.floor(frameIndex / 4);
        const frameFade = frameIndex === 7 ? Math.max(0, 1 - (progress * FRAME_COUNT - 7)) : 1;
        const cellWidth = image.naturalWidth / 4;
        const cellHeight = image.naturalHeight / 2;
        renderer.sprite(image, effectCenterX - size / 2, centerY - size / 2, size, size,
          frameFade, true, [(column * cellWidth + 1) / image.naturalWidth,
            (row * cellHeight + 1) / image.naturalHeight,
            (cellWidth - 2) / image.naturalWidth, (cellHeight - 2) / image.naturalHeight]);
      }

      if (!reducedMotion && progress < 1) frameId = requestAnimationFrame(render);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", contextLost);
      image.onload = null;
      image.onerror = null;
      if (!renderer.gl.isContextLost()) renderer.dispose();
    };
  }, [effectKey, fallback]);

  return fallback
    ? <BloodBladeCanvasFallback effectKey={effectKey} />
    : <canvas ref={canvasRef} className="skill-effect-canvas" aria-hidden="true" />;
}

function BloodBladeCanvasFallback({ effectKey }: { effectKey: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;
    const canvas = canvasElement;
    const drawingContext = canvas.getContext("2d");
    if (!drawingContext) return;
    const context = drawingContext;
    const image = new Image();
    let frameId = 0;
    let startedAt = 0;
    let disposed = false;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(rect.width * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    function render(time: number) {
      if (disposed || !image.complete || !image.naturalWidth) return;
      if (!startedAt) startedAt = time;
      const rect = canvas.getBoundingClientRect();
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const elapsed = time - startedAt;
      const progress = reducedMotion ? 0.72 : Math.min(1, elapsed / DURATION);
      const player = canvas.closest(".battle-stage")
        ?.querySelector<HTMLElement>(".fighter.player .fighter-frame")?.getBoundingClientRect();
      const enemy = canvas.closest(".battle-stage")
        ?.querySelector<HTMLElement>(".fighter.enemy .fighter-frame")?.getBoundingClientRect();
      const centerX = enemy ? enemy.left - rect.left + enemy.width / 2 : rect.width * 0.7;
      const centerY = enemy ? enemy.top - rect.top + enemy.height / 2 : rect.height * 0.43;
      const playerCenterX = player ? player.left - rect.left + player.width / 2 : rect.width * 0.28;
      const enemyWidth = enemy?.width ?? rect.width * 0.3;
      const enemyHeight = enemy?.height ?? rect.height * 0.68;
      const frameIndex = Math.min(FRAME_COUNT - 1, Math.floor(progress * FRAME_COUNT));
      const approach = Math.min(1, progress * 2.8);
      const effectCenterX = playerCenterX + (centerX - playerCenterX) * approach;
      const size = Math.min(enemyWidth * 1.6, enemyHeight * 0.96);
      resize();
      context.clearRect(0, 0, rect.width, rect.height);
      if (progress < 1) {
        const column = frameIndex % 4;
        const row = Math.floor(frameIndex / 4);
        const frameFade = frameIndex === 7 ? Math.max(0, 1 - (progress * FRAME_COUNT - 7)) : 1;
        context.globalCompositeOperation = "lighter";
        context.globalAlpha = frameFade;
        const cellWidth = image.naturalWidth / 4;
        const cellHeight = image.naturalHeight / 2;
        context.drawImage(image,
          column * cellWidth + 1, row * cellHeight + 1,
          cellWidth - 2, cellHeight - 2,
          effectCenterX - size / 2, centerY - size / 2, size, size);
        context.globalAlpha = 1;
        context.globalCompositeOperation = "source-over";
      }
      if (!reducedMotion && progress < 1) frameId = requestAnimationFrame(render);
    }
    image.onload = () => { if (!disposed) frameId = requestAnimationFrame(render); };
    image.src = SPRITE_SHEET;
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      image.onload = null;
    };
  }, [effectKey]);

  return <canvas ref={canvasRef} className="skill-effect-canvas" aria-hidden="true" />;
}
