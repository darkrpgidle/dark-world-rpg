"use client";

import { useEffect, useRef, useState } from "react";
import { WebGLVfxRenderer } from "./webgl-vfx-renderer";

const ASSETS = [
  "/vfx/blood-brand/cast.webp",
  "/vfx/blood-brand/mark.webp",
  "/vfx/blood-brand/ascension.webp",
] as const;
const FRAMES = 8;
const CAST_MS = 960;
const BURST_MS = 760;
const FADE_MS = 320;

type BloodBrandProps = {
  castKey: number;
  expiresAt: number;
  burstKey: number;
  onExpired: (castKey: number) => void;
};

type Painter = {
  resize: () => void;
  clear: () => void;
  sprite: (image: HTMLImageElement, x: number, y: number, size: number, opacity: number,
    uv: [number, number, number, number]) => void;
  dispose?: () => void;
};

function frameUv(image: HTMLImageElement, frame: number): [number, number, number, number] {
  const cellWidth = image.naturalWidth / 4;
  const cellHeight = image.naturalHeight / 2;
  const column = frame % 4;
  const row = Math.floor(frame / 4);
  return [(column * cellWidth + 1) / image.naturalWidth,
    (row * cellHeight + 1) / image.naturalHeight,
    (cellWidth - 2) / image.naturalWidth, (cellHeight - 2) / image.naturalHeight];
}

function placement(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const stage = canvas.closest(".battle-stage");
  const player = stage?.querySelector<HTMLElement>(".fighter.player .fighter-frame")?.getBoundingClientRect();
  const enemy = stage?.querySelector<HTMLElement>(".fighter.enemy .fighter-frame")?.getBoundingClientRect();
  const left = enemy ? enemy.left - rect.left : rect.width * 0.67;
  const top = enemy ? enemy.top - rect.top : rect.height * 0.2;
  const width = enemy?.width ?? rect.width * 0.28;
  const height = enemy?.height ?? rect.height * 0.62;
  const enemyX = left + width * 0.5;
  const enemyY = top + height * 0.5;
  const playerX = player ? player.left - rect.left + player.width * 0.72 : rect.width * 0.28;
  return { rect, playerX, enemyX, enemyY, size: Math.min(width * 1.05, height * 0.72) };
}

function useBloodBrandAnimation(
  canvasRef: React.RefObject<HTMLCanvasElement | null>, props: BloodBrandProps,
  mode: "webgl" | "canvas", onFallback: () => void,
) {
  const propsRef = useRef(props);
  const fallbackRef = useRef(onFallback);
  const expiredRef = useRef(props.onExpired);
  useEffect(() => { propsRef.current = props; fallbackRef.current = onFallback; expiredRef.current = props.onExpired; });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let painter: Painter;
    let context: CanvasRenderingContext2D | null = null;
    let renderer: WebGLVfxRenderer | null = null;
    try {
      if (mode === "webgl") {
        renderer = new WebGLVfxRenderer(canvas);
        painter = {
          resize: () => renderer?.resize(), clear: () => renderer?.clear(),
          sprite: (image, x, y, size, opacity, uv) => renderer?.sprite(image,
            x - size / 2, y - size / 2, size, size, opacity, true, uv),
          dispose: () => renderer?.dispose(),
        };
      } else {
        context = canvas.getContext("2d");
        if (!context) return;
        const ctx = context;
        painter = {
          resize() {
            const rect = canvas.getBoundingClientRect();
            const ratio = Math.min(2, window.devicePixelRatio || 1);
            canvas.width = Math.max(1, Math.round(rect.width * ratio));
            canvas.height = Math.max(1, Math.round(rect.height * ratio));
            ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
          },
          clear() { ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight); },
          sprite(image, x, y, size, opacity, uv) {
            const sx = uv[0] * image.naturalWidth;
            const sy = uv[1] * image.naturalHeight;
            const sw = uv[2] * image.naturalWidth;
            const sh = uv[3] * image.naturalHeight;
            ctx.globalAlpha = opacity;
            ctx.globalCompositeOperation = "lighter";
            ctx.drawImage(image, sx, sy, sw, sh, x - size / 2, y - size / 2, size, size);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = "source-over";
          },
        };
      }
    } catch {
      if (mode === "webgl") window.setTimeout(() => fallbackRef.current(), 0);
      return;
    }
    let disposed = false;
    let frameId = 0;
    let timerId = 0;
    let lastCastKey = 0;
    let castStartedAt = 0;
    let markStartedAt = 0;
    let knownExpiry = 0;
    let lastBurstKey = 0;
    let burstStartedAt = 0;
    let finished = false;
    const images = ASSETS.map(() => new Image());
    let loaded = 0;
    const schedule = () => { if (!disposed) frameId = requestAnimationFrame(render); };
    const contextLost = (event: Event) => {
      event.preventDefault();
      if (mode === "webgl") fallbackRef.current();
    };
    function render(time: number) {
      if (disposed || images.some((image) => !image.complete || !image.naturalWidth)) return;
      const p = propsRef.current;
      const now = Date.now();
      if (p.castKey !== lastCastKey) {
        lastCastKey = p.castKey;
        castStartedAt = time;
        markStartedAt = time + CAST_MS * 0.72;
      }
      if (p.expiresAt !== knownExpiry) {
        knownExpiry = p.expiresAt;
        if (!castStartedAt) markStartedAt = time;
      }
      if (p.burstKey !== lastBurstKey) {
        lastBurstKey = p.burstKey;
        burstStartedAt = time;
      }
      painter.resize();
      painter.clear();
      const point = placement(canvas as HTMLCanvasElement);
      const castElapsed = time - castStartedAt;
      if (p.castKey > 0 && castElapsed >= 0 && castElapsed < CAST_MS) {
        const progress = castElapsed / CAST_MS;
        const frame = Math.min(FRAMES - 1, Math.floor(progress * FRAMES));
        const x = point.playerX + (point.enemyX - point.playerX) * Math.min(1, progress * 1.12);
        const alpha = frame >= 7 ? Math.max(0, 1 - (progress - 7 / FRAMES) * FRAMES) : 1;
        painter.sprite(images[0], x, point.enemyY, point.size * 0.92, alpha, frameUv(images[0], frame));
      }
      if (p.expiresAt > 0 && time >= markStartedAt && now <= p.expiresAt + FADE_MS) {
        const fade = now > p.expiresAt ? Math.max(0, 1 - (now - p.expiresAt) / FADE_MS) : 1;
        const frame = now > p.expiresAt ? 7
          : Math.floor(Math.max(0, time - markStartedAt) / 150) % FRAMES;
        painter.sprite(images[1], point.enemyX, point.enemyY, point.size * 0.88, fade, frameUv(images[1], frame));
      }
      const burstElapsed = time - burstStartedAt;
      if (p.burstKey > 0 && burstElapsed >= 0 && burstElapsed < BURST_MS) {
        const progress = burstElapsed / BURST_MS;
        const frame = Math.min(FRAMES - 1, Math.floor(progress * FRAMES));
        painter.sprite(images[2], point.enemyX, point.enemyY, point.size * (0.9 + progress * 0.4),
          Math.max(0.1, 1 - progress * 0.45), frameUv(images[2], frame));
      }
      const shouldContinue = (p.castKey > 0 && time < castStartedAt + CAST_MS)
        || (p.expiresAt > 0 && now <= p.expiresAt + FADE_MS)
        || (p.burstKey > 0 && time < burstStartedAt + BURST_MS);
      if (shouldContinue) timerId = window.setTimeout(() => schedule(), 32);
      else if (!finished) {
        finished = true;
        expiredRef.current(p.castKey);
      }
    }
    images.forEach((image) => {
      image.onload = () => { loaded += 1; if (loaded === images.length) schedule(); };
      image.onerror = () => { if (!disposed && mode === "webgl") fallbackRef.current(); };
    });
    images.forEach((image, index) => { image.src = ASSETS[index]; });
    canvas.addEventListener("webglcontextlost", contextLost);
    const observer = new ResizeObserver(() => schedule());
    observer.observe(canvas);
    frameId = requestAnimationFrame(render);
    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      window.clearTimeout(timerId);
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", contextLost);
      images.forEach((image) => { image.onload = null; image.onerror = null; });
      painter.dispose?.();
    };
  }, [canvasRef, mode]);
}

export function WebGLBloodBrandVfx(props: BloodBrandProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);
  useBloodBrandAnimation(canvasRef, props, fallback ? "canvas" : "webgl", () => setFallback(true));
  return <canvas key={fallback ? "canvas-fallback" : "webgl"} ref={canvasRef}
    className="skill-effect-canvas" aria-hidden="true" />;
}
