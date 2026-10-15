"use client";

import { useEffect, useRef, useState } from "react";
import NextImage from "next/image";

type Anchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const MARK_FRAMES = 6;
const MARK_INTRO_DURATIONS = [120, 150] as const;
const MARK_LOOP_FRAME_DURATION = 165;
// Frames 6 and 7 contain the charm-spirit face. Give them room to breathe
// while keeping the smoke moving instead of freezing on a single frame.
const EXPLOSION_FRAME_DURATIONS = [120, 120, 110, 120, 130, 300, 360, 220] as const;
const EXPLOSION_DURATION = EXPLOSION_FRAME_DURATIONS.reduce((sum, value) => sum + value, 0);
const VFX_SOURCES = [
  ...Array.from({ length: MARK_FRAMES }, (_, index) => `/vfx/deadly-mark/frame-${String(index).padStart(2, "0")}.webp`),
  ...Array.from({ length: EXPLOSION_FRAME_DURATIONS.length }, (_, index) => `/vfx/deadly-mark-explosion/frame-${String(index).padStart(2, "0")}.webp`),
];

function readEnemyAnchor(element: HTMLDivElement): Anchor {
  const stage = element.closest(".battle-stage");
  const enemy = stage?.querySelector<HTMLElement>(".fighter.enemy .fighter-frame");
  const overlay = element.getBoundingClientRect();
  if (!enemy) return { x: overlay.width * 0.71, y: overlay.height * 0.43, width: overlay.width * 0.3, height: overlay.height * 0.68 };
  const rect = enemy.getBoundingClientRect();
  return {
    x: rect.left - overlay.left + rect.width / 2,
    y: rect.top - overlay.top + rect.height / 2,
    width: rect.width,
    height: rect.height,
  };
}

function frameAt(elapsed: number, durations: readonly number[]) {
  let cursor = 0;
  for (let index = 0; index < durations.length; index += 1) {
    cursor += durations[index];
    if (elapsed < cursor) return index;
  }
  return durations.length - 1;
}

export function RangerDeadlyMarkVfx({
  effectKey,
  detonationKey,
}: {
  effectKey: number;
  detonationKey: number | null;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [frame, setFrame] = useState(0);
  const [exploding, setExploding] = useState(false);
  const [opacity, setOpacity] = useState(1);
  const [phaseElapsed, setPhaseElapsed] = useState(0);
  const [assetsReady, setAssetsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const images = VFX_SOURCES.map((source) => {
      const image = new Image();
      return new Promise<void>((resolve) => {
        image.onload = () => resolve();
        image.onerror = () => resolve();
        image.src = source;
      });
    });
    Promise.all(images).then(() => {
      if (!cancelled) setAssetsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    setAnchor(readEnemyAnchor(overlay));
    setFrame(0);
    setExploding(false);
    setOpacity(1);
    setPhaseElapsed(0);
    const startedAt = performance.now();
    let animationFrame = 0;
    let detonationStartedAt: number | null = null;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const render = (time: number) => {
      const elapsed = reducedMotion ? 0 : time - startedAt;
      if (detonationKey !== null && detonationStartedAt === null) {
        detonationStartedAt = time;
        setExploding(true);
      }
      if (detonationStartedAt !== null) {
        const explosionElapsed = reducedMotion ? EXPLOSION_DURATION : time - detonationStartedAt;
        setFrame(frameAt(explosionElapsed, EXPLOSION_FRAME_DURATIONS));
        setPhaseElapsed(explosionElapsed);
        const fadeStart = EXPLOSION_DURATION - 300;
        const fadeProgress = Math.max(0, explosionElapsed - fadeStart) / 300;
        setOpacity(0.82 * (1 - Math.min(1, fadeProgress)));
        if (!reducedMotion && explosionElapsed < EXPLOSION_DURATION) {
          animationFrame = requestAnimationFrame(render);
        }
        return;
      }
      if (elapsed < MARK_INTRO_DURATIONS[0] + MARK_INTRO_DURATIONS[1]) {
        setFrame(frameAt(elapsed, MARK_INTRO_DURATIONS));
      } else {
        setFrame(2 + Math.floor((elapsed - MARK_INTRO_DURATIONS[0] - MARK_INTRO_DURATIONS[1]) / MARK_LOOP_FRAME_DURATION) % 4);
      }
      if (!reducedMotion) animationFrame = requestAnimationFrame(render);
    };
    animationFrame = requestAnimationFrame(render);
    const updateAnchor = () => setAnchor(readEnemyAnchor(overlay));
    window.addEventListener("resize", updateAnchor);
    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", updateAnchor);
    };
  }, [effectKey, detonationKey]);

  const src = exploding
    ? `/vfx/deadly-mark-explosion/frame-${String(frame).padStart(2, "0")}.webp`
    : `/vfx/deadly-mark/frame-${String(Math.min(MARK_FRAMES - 1, frame)).padStart(2, "0")}.webp`;
  // 標記只作為敵人身上的提示，避免遮住血條與角色；爆炸段才放大到命中範圍。
  const size = anchor ? (exploding ? Math.max(anchor.width, anchor.height) * 1.28 : Math.max(anchor.width, anchor.height) * 0.34) : 0;
  const faceFrame = exploding && (frame === 5 || frame === 6);
  const smokeWave = Math.sin(phaseElapsed / 175) * 0.5 + Math.sin(phaseElapsed / 290) * 0.5;
  const driftX = faceFrame && anchor ? smokeWave * anchor.width * 0.025 : 0;
  const driftY = faceFrame && anchor ? Math.cos(phaseElapsed / 220) * anchor.height * 0.018 : 0;
  const smokeScale = faceFrame ? 1 + smokeWave * 0.018 : 1;
  const smokeOpacity = faceFrame ? opacity * (0.95 + smokeWave * 0.035) : opacity;

  return (
    <div ref={overlayRef} className="ranger-deadly-mark-vfx" aria-hidden="true">
      {anchor && assetsReady && opacity > 0 && (
        <NextImage unoptimized width={512} height={512} loading="eager"
          className="ranger-deadly-mark-frame"
          src={src}
          alt=""
          style={{
            left: anchor.x + driftX,
            top: anchor.y + driftY,
            width: size,
            height: size,
            opacity: smokeOpacity,
            transform: `translate(-50%, -50%) scale(${smokeScale})`,
          }}
        />
      )}
    </div>
  );
}
