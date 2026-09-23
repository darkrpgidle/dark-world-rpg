"use client";

import { useEffect, useRef, useState } from "react";

type Anchor = {
  playerX: number;
  playerY: number;
  playerWidth: number;
  enemyX: number;
  enemyY: number;
  enemyWidth: number;
  enemyHeight: number;
};

const VARIANTS = ["a", "b", "c"] as const;
const FRAME_DURATIONS = [55, 85, 115, 220] as const;
const TOTAL_DURATION = FRAME_DURATIONS.reduce((sum, duration) => sum + duration, 0);
const FADE_DURATION = 180;
const TOTAL_EFFECT_DURATION = TOTAL_DURATION + FADE_DURATION;

function readAnchors(element: HTMLDivElement): Anchor {
  const stage = element.closest(".battle-stage");
  const player = stage?.querySelector<HTMLElement>(".fighter.player .fighter-frame");
  const enemy = stage?.querySelector<HTMLElement>(".fighter.enemy .fighter-frame");
  const overlayRect = element.getBoundingClientRect();
  if (!player || !enemy) {
    return {
      playerX: overlayRect.width * 0.3,
      playerY: overlayRect.height * 0.43,
      playerWidth: overlayRect.width * 0.3,
      enemyX: overlayRect.width * 0.71,
      enemyY: overlayRect.height * 0.43,
      enemyWidth: overlayRect.width * 0.3,
      enemyHeight: overlayRect.height * 0.68,
    };
  }
  const playerRect = player.getBoundingClientRect();
  const enemyRect = enemy.getBoundingClientRect();
  return {
    playerX: playerRect.left - overlayRect.left + playerRect.width / 2,
    playerY: playerRect.top - overlayRect.top + playerRect.height / 2,
    playerWidth: playerRect.width,
    enemyX: enemyRect.left - overlayRect.left + enemyRect.width / 2,
    enemyY: enemyRect.top - overlayRect.top + enemyRect.height / 2,
    enemyWidth: enemyRect.width,
    enemyHeight: enemyRect.height,
  };
}

export function RangerPiercingArrowVfx({ effectKey }: { effectKey: number }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [variant, setVariant] = useState(0);
  const [frame, setFrame] = useState(0);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    setVariant(Math.floor(Math.random() * VARIANTS.length));
    setFrame(0);
    setOpacity(1);
    setAnchor(readAnchors(overlay));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const startedAt = performance.now();
    let animationFrame = 0;
    const render = (time: number) => {
      const elapsed = reducedMotion ? TOTAL_EFFECT_DURATION : time - startedAt;
      let frameIndex = FRAME_DURATIONS.length - 1;
      let frameEnd = 0;
      for (let index = 0; index < FRAME_DURATIONS.length; index += 1) {
        frameEnd += FRAME_DURATIONS[index];
        if (elapsed < frameEnd) {
          frameIndex = index;
          break;
        }
      }
      setFrame(frameIndex);
      setOpacity(elapsed < TOTAL_DURATION ? 1 : Math.max(0, 1 - (elapsed - TOTAL_DURATION) / FADE_DURATION));
      if (!reducedMotion && elapsed < TOTAL_EFFECT_DURATION) animationFrame = requestAnimationFrame(render);
    };
    animationFrame = requestAnimationFrame(render);
    const updateAnchors = () => setAnchor(readAnchors(overlay));
    window.addEventListener("resize", updateAnchors);
    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", updateAnchors);
    };
  }, [effectKey]);

  let left = 0;
  let top = 0;
  let size = 0;
  if (anchor) {
    const distance = Math.max(1, anchor.enemyX - anchor.playerX);
    if (frame < 2) {
      const travel = frame === 0 ? 0.12 : 0.68;
      left = anchor.playerX + distance * travel;
      top = anchor.playerY + (anchor.enemyY - anchor.playerY) * travel;
      size = Math.max(anchor.playerWidth * 0.95, distance * (frame === 0 ? 0.52 : 0.82));
    } else {
      left = anchor.enemyX;
      top = anchor.enemyY;
      size = Math.max(anchor.enemyWidth, anchor.enemyHeight) * (frame === 2 ? 1.12 : 1.38);
    }
  }
  const src = `/vfx/piercing-arrow/variant-${VARIANTS[variant]}/frame-${String(frame).padStart(2, "0")}.png`;
  return (
    <div ref={overlayRef} className="ranger-piercing-arrow-vfx" aria-hidden="true">
      {anchor && opacity > 0 && <img key={`${effectKey}-${variant}-${frame}`} className="ranger-piercing-arrow-frame" src={src} alt="" style={{ left, top, width: size, height: size, opacity }} />}
    </div>
  );
}
