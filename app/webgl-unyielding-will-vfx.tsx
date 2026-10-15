"use client";

import { useEffect, useRef, useState } from "react";
import { WebGLVfxRenderer } from "./webgl-vfx-renderer";

const SPRITE_SHEET = "/vfx/unyielding-will/frame-sheet.webp";
const ACTIVATION_MS = 360;
const IMPACT_MS = 220;
const FADE_MS = 240;

type UnyieldingVfxProps = {
  eventKey: number;
  active: boolean;
  activated: boolean;
  blocked: boolean;
  countered: boolean;
  ascendedCounterStacks: number;
  onFadeComplete: () => void;
};

function frameAt(props: Pick<UnyieldingVfxProps, "active" | "blocked" | "countered" | "activated">, elapsed: number, reducedMotion: boolean) {
  if (!props.active) {
    if (reducedMotion || elapsed >= FADE_MS) return { frame: 7, opacity: 0, animate: false, done: true };
    return { frame: 7, opacity: 1 - elapsed / FADE_MS, animate: true, done: false };
  }
  if (reducedMotion) return { frame: props.blocked || props.countered ? 5 : 6, opacity: 1, animate: false, done: false };
  if (props.activated && elapsed < ACTIVATION_MS) {
    return { frame: Math.min(3, Math.floor(elapsed / (ACTIVATION_MS / 4))), opacity: 1, animate: true, done: false };
  }
  const impactStart = props.activated ? ACTIVATION_MS : 0;
  if ((props.blocked || props.countered) && elapsed < impactStart + IMPACT_MS) {
    return { frame: 4 + Math.min(1, Math.floor((elapsed - impactStart) / (IMPACT_MS / 2))), opacity: 1, animate: true, done: false };
  }
  const shouldAnimate = props.activated && elapsed < ACTIVATION_MS
    || (props.blocked || props.countered) && elapsed < impactStart + IMPACT_MS;
  return { frame: 6, opacity: 1, animate: shouldAnimate, done: false };
}

// Flip within the selected cell only; never swap atlas rows.
function frameUv(image: HTMLImageElement, frame: number): [number, number, number, number] {
  const cellWidth = image.naturalWidth / 4;
  const cellHeight = image.naturalHeight / 2;
  const column = frame % 4;
  const row = Math.floor(frame / 4);
  return [
    (column * cellWidth + 1) / image.naturalWidth,
    ((row + 1) * cellHeight - 1) / image.naturalHeight,
    (cellWidth - 2) / image.naturalWidth,
    -(cellHeight - 2) / image.naturalHeight,
  ];
}

function drawPlacement(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const player = canvas.closest(".battle-stage")
    ?.querySelector<HTMLElement>(".fighter.player .fighter-frame")?.getBoundingClientRect();
  const playerLeft = player ? player.left - rect.left : rect.width * 0.18;
  const playerWidth = player?.width ?? rect.width * 0.22;
  const playerHeight = player?.height ?? rect.height * 0.62;
  const size = Math.min(playerWidth * 1.05, playerHeight * 0.76);
  const centerX = playerLeft + playerWidth * 0.78;
  const centerY = player ? player.top - rect.top + player.height * 0.52 : rect.height * 0.46;
  return { rect, x: centerX - size / 2, y: centerY - size / 2, size };
}

export function WebGLUnyieldingWillVfx(props: UnyieldingVfxProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);
  const fadeCompleteRef = useRef(props.onFadeComplete);

  useEffect(() => { fadeCompleteRef.current = props.onFadeComplete; }, [props.onFadeComplete]);

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
    const image = new Image();
    let frameId = 0;
    let startedAt = 0;
    let disposed = false;
    let completed = false;
    const contextLost = (event: Event) => {
      event.preventDefault();
      setFallback(true);
    };
    function render(time: number) {
      if (disposed || renderer.gl.isContextLost() || !image.complete || !image.naturalWidth) return;
      if (!startedAt) startedAt = time;
      const elapsed = time - startedAt;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const frame = frameAt({ active: props.active, blocked: props.blocked,
        countered: props.countered, activated: props.activated }, elapsed, reducedMotion);
      const placement = drawPlacement(canvas);
      renderer.resize();
      renderer.clear();
      if (frame.opacity > 0) {
        if (props.active && props.ascendedCounterStacks > 0) {
          for (let stack = 0; stack < Math.min(3, props.ascendedCounterStacks); stack += 1) {
            renderer.sprite(image, placement.x - (stack + 1) * placement.size * 0.035, placement.y,
              placement.size, placement.size, 0.12, true, frameUv(image, frame.frame));
          }
        }
        renderer.sprite(image, placement.x, placement.y, placement.size, placement.size,
          frame.opacity, true, frameUv(image, frame.frame));
      }
      if (frame.animate) frameId = requestAnimationFrame(render);
      else if (frame.done && !completed) {
        completed = true;
        fadeCompleteRef.current();
      }
    }
    image.onload = () => { if (!disposed) frameId = requestAnimationFrame(render); };
    image.onerror = () => { if (!disposed) setFallback(true); };
    image.src = SPRITE_SHEET;
    canvas.addEventListener("webglcontextlost", contextLost);
    const observer = new ResizeObserver(() => { if (!disposed) frameId = requestAnimationFrame(render); });
    observer.observe(canvas);
    frameId = requestAnimationFrame(render);
    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", contextLost);
      image.onload = null;
      image.onerror = null;
      if (!renderer.gl.isContextLost()) renderer.dispose();
    };
  }, [props.eventKey, props.active, props.activated, props.blocked, props.countered, props.ascendedCounterStacks, fallback]);

  return fallback
    ? <UnyieldingWillCanvasFallback {...props} />
    : <canvas ref={canvasRef} className="skill-effect-canvas" aria-hidden="true" />;
}

function UnyieldingWillCanvasFallback(props: UnyieldingVfxProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fadeCompleteRef = useRef(props.onFadeComplete);

  useEffect(() => { fadeCompleteRef.current = props.onFadeComplete; }, [props.onFadeComplete]);

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
    let completed = false;
    function resize() {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(rect.width * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    function render(time: number) {
      if (disposed || !image.complete || !image.naturalWidth) return;
      if (!startedAt) startedAt = time;
      const elapsed = time - startedAt;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const frame = frameAt({ active: props.active, blocked: props.blocked,
        countered: props.countered, activated: props.activated }, elapsed, reducedMotion);
      const placement = drawPlacement(canvas);
      resize();
      context.clearRect(0, 0, placement.rect.width, placement.rect.height);
      if (frame.opacity > 0) {
        const cellWidth = image.naturalWidth / 4;
        const cellHeight = image.naturalHeight / 2;
        const column = frame.frame % 4;
        const row = Math.floor(frame.frame / 4);
        // Mirror this skill around its own center, matching the reversed WebGL V range.
        context.save();
        context.translate(0, placement.y * 2 + placement.size);
        context.scale(1, -1);
        if (props.active && props.ascendedCounterStacks > 0) {
          context.globalCompositeOperation = "lighter";
          context.globalAlpha = 0.12;
          for (let stack = 0; stack < Math.min(3, props.ascendedCounterStacks); stack += 1) {
            context.drawImage(image, column * cellWidth + 1, row * cellHeight + 1,
              cellWidth - 2, cellHeight - 2, placement.x - (stack + 1) * placement.size * 0.035,
              placement.y, placement.size, placement.size);
          }
        }
        context.globalAlpha = frame.opacity;
        context.globalCompositeOperation = "lighter";
        context.drawImage(image, column * cellWidth + 1, row * cellHeight + 1,
          cellWidth - 2, cellHeight - 2, placement.x, placement.y, placement.size, placement.size);
        context.globalAlpha = 1;
        context.globalCompositeOperation = "source-over";
        context.restore();
      }
      if (frame.animate) frameId = requestAnimationFrame(render);
      else if (frame.done && !completed) {
        completed = true;
        fadeCompleteRef.current();
      }
    }
    image.onload = () => { if (!disposed) frameId = requestAnimationFrame(render); };
    image.onerror = () => { if (!disposed) fadeCompleteRef.current(); };
    image.src = SPRITE_SHEET;
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    frameId = requestAnimationFrame(render);
    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      image.onload = null;
      image.onerror = null;
    };
  }, [props.eventKey, props.active, props.activated, props.blocked, props.countered, props.ascendedCounterStacks]);

  return <canvas ref={canvasRef} className="skill-effect-canvas" aria-hidden="true" />;
}
