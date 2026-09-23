"use client";

import { useEffect, useRef, useState } from "react";

type Anchor = {
  playerX: number;
  playerY: number;
  playerWidth: number;
  playerHeight: number;
  enemyX: number;
  enemyY: number;
  enemyWidth: number;
  enemyHeight: number;
};

const CHARGE_FRAMES = [0, 1, 2, 3] as const;
const SHOT_FRAME_DURATIONS = [55, 85, 105, 175] as const;
const SHOT_DURATION = SHOT_FRAME_DURATIONS.reduce((sum, duration) => sum + duration, 0);

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
      playerHeight: overlayRect.height * 0.68,
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
    playerHeight: playerRect.height,
    enemyX: enemyRect.left - overlayRect.left + enemyRect.width / 2,
    enemyY: enemyRect.top - overlayRect.top + enemyRect.height / 2,
    enemyWidth: enemyRect.width,
    enemyHeight: enemyRect.height,
  };
}

function frameAt(elapsed: number) {
  let end = 0;
  for (let index = 0; index < SHOT_FRAME_DURATIONS.length; index += 1) {
    end += SHOT_FRAME_DURATIONS[index];
    if (elapsed < end) return index;
  }
  return SHOT_FRAME_DURATIONS.length - 1;
}

function chargeFrameAt(elapsed: number) {
  if (elapsed < 250) {
    if (elapsed < 55) return CHARGE_FRAMES[0];
    if (elapsed < 120) return CHARGE_FRAMES[1];
    if (elapsed < 185) return CHARGE_FRAMES[2];
    return CHARGE_FRAMES[3];
  }
  const pulseElapsed = (elapsed - 250) % 220;
  return pulseElapsed < 105 ? CHARGE_FRAMES[2] : CHARGE_FRAMES[3];
}

function shotOpacity(elapsed: number) {
  if (elapsed < 0 || elapsed >= SHOT_DURATION) return 0;
  if (elapsed < 55) return elapsed / 55;
  if (elapsed < 240) return 1;
  return Math.max(0, 1 - (elapsed - 240) / (SHOT_DURATION - 240));
}

export function RangerWindVolleyVfx({ effectKey, shotCount = 5 }: { effectKey: number; shotCount?: number }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [elapsed, setElapsed] = useState(0);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const shotStarts = Array.from({ length: Math.max(1, shotCount) }, (_, index) => 250 + index * 250);
  const totalDuration = (shotStarts[shotStarts.length - 1] ?? 250) + SHOT_DURATION;

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    setElapsed(0);
    setAnchor(readAnchors(overlay));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const startedAt = performance.now();
    let animationFrame = 0;
    const render = (time: number) => {
      const nextElapsed = reducedMotion ? totalDuration : time - startedAt;
      setElapsed(nextElapsed);
      if (!reducedMotion && nextElapsed < totalDuration) animationFrame = requestAnimationFrame(render);
    };
    animationFrame = requestAnimationFrame(render);
    const updateAnchors = () => setAnchor(readAnchors(overlay));
    window.addEventListener("resize", updateAnchors);
    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", updateAnchors);
    };
  }, [effectKey, totalDuration]);

  const chargeFrame = chargeFrameAt(elapsed);
  const chargeOpacity = elapsed < 1470 ? 1 : Math.max(0, 1 - (elapsed - 1470) / 310);
  const srcForCharge = `/vfx/wind-volley/charge/frame-${String(chargeFrame).padStart(2, "0")}.png`;
  const distance = anchor ? Math.max(1, anchor.enemyX - anchor.playerX) : 1;
  const chargeSize = anchor ? Math.max(anchor.playerWidth * 0.9, anchor.playerHeight * 0.48) : 0;

  return (
    <div ref={overlayRef} className="ranger-wind-volley-vfx" aria-hidden="true">
      {anchor && (
        <img
          className="ranger-wind-volley-charge"
          src={srcForCharge}
          alt=""
          style={{ left: anchor.playerX, top: anchor.playerY - anchor.playerHeight * 0.06, width: chargeSize, height: chargeSize, opacity: chargeOpacity }}
        />
      )}
      {anchor && shotStarts.map((shotStart, shotIndex) => {
        const shotElapsed = elapsed - shotStart;
        const shotFrame = frameAt(Math.max(0, shotElapsed));
        const progress = Math.min(1, Math.max(0, shotElapsed / 240));
        const travel = 1 - Math.pow(1 - progress, 3);
        const targetY = anchor.enemyY + anchor.enemyHeight * (0.3 - (shotIndex / Math.max(1, shotCount - 1)) * 0.6);
        const x = anchor.playerX + distance * (shotFrame < 2 ? Math.max(0.05, travel) : 1);
        const y = anchor.playerY + (targetY - anchor.playerY) * Math.min(1, travel);
        const impact = shotFrame >= 2;
        const size = shotFrame < 2
          ? Math.max(anchor.playerWidth * 0.46, distance * (shotFrame === 0 ? 0.34 : 0.62))
          : Math.max(anchor.enemyWidth, anchor.enemyHeight) * (shotFrame === 2 ? 0.55 : 0.72);
        return shotElapsed >= 0 && shotElapsed < SHOT_DURATION ? (
          <img
            key={`${effectKey}-shot-${shotIndex}`}
            className={`ranger-wind-volley-arrow frame-${shotFrame} ${impact ? "impact" : ""}`}
            src={`/vfx/wind-volley/arrow/frame-${String(shotFrame).padStart(2, "0")}.png`}
            alt=""
            style={{ left: x, top: y, width: size, height: size, opacity: shotOpacity(shotElapsed) }}
          />
        ) : null;
      })}
    </div>
  );
}
