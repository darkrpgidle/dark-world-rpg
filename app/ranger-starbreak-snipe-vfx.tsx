"use client";
import { useEffect, useRef, useState } from "react";
import { WebGLVfxRenderer } from "./webgl-vfx-renderer";
export const STARBREAK_IMPACT_MS = 410;
export const STARBREAK_DURATION_MS = 820;
// Preserve the established contact cue; two 40ms braking holds precede it.
export const STARBREAK_FLIGHT = [50, 145, 185, 275, 315, STARBREAK_IMPACT_MS];
export function starbreakTravel(age: number) {
  if (age < 50) return { segment: 0, progress: 0, braking: false };
  if (age < 145) return { segment: 0, progress: 1 - Math.pow(1 - (age - 50) / 95, 2), braking: false };
  if (age < 185) return { segment: 0, progress: 1, braking: true };
  if (age < 275) return { segment: 1, progress: Math.pow((age - 185) / 90, .65), braking: false };
  if (age < 315) return { segment: 1, progress: 1, braking: true };
  return { segment: 2, progress: Math.min(1, Math.pow(Math.max(0, age - 315) / 95, .7)), braking: false };
}
type Props = { effectKey: number; hit: boolean; ascended?: boolean; chargeRecovered?: boolean; onImpact: (key: number) => void; onComplete: (key: number) => void };

export function RangerStarbreakSnipeVfx({ effectKey, hit, ascended = false, chargeRecovered = false, onImpact, onComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const callbacks = useRef({ onImpact, onComplete });
  const startedAt = useRef<number | null>(null);
  const impacted = useRef(false);
  const recoveryStart = useRef<number | null>(null);
  const [fallback, setFallback] = useState(false);
  useEffect(() => { callbacks.current = { onImpact, onComplete }; }, [onImpact, onComplete]);
  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const canvas = element, stage = canvas.closest<HTMLElement>(".battle-stage");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let disposed = false, completed = false, raf = 0;
    let shake: Animation | null = null;
    let renderer: WebGLVfxRenderer | null = null, context: CanvasRenderingContext2D | null = null;
    const impact = (animate = false) => {
      if (impacted.current) return;
      impacted.current = true;
      callbacks.current.onImpact(effectKey);
      if (animate && hit && !reduced && stage?.animate) {
        const power = canvas.clientWidth < 600 ? 3 : 6;
        shake = stage.animate([{ transform: "translate(0,0)" },
          { transform: `translate(${-power}px,${power*.5}px)` },
          { transform: `translate(${power}px,${-power*.4}px)` },
          { transform: `translate(${-power*.5}px,0)` }, { transform: "translate(0,0)" }],
          { duration: 220, easing: "ease-out" });
      }
    };
    const finish = () => {
      if (disposed || completed) return;
      completed = true; impact(); callbacks.current.onComplete(effectKey);
    };
    let fallbackTimer: number | undefined;
    if (!fallback) {
      try { renderer = new WebGLVfxRenderer(canvas); }
      catch { fallbackTimer = window.setTimeout(() => setFallback(true), 0); }
      if (!renderer) return () => { window.clearTimeout(fallbackTimer); };
    } else {
      context = canvas.getContext("2d");
      if (!context) { finish(); return; }
    }
    const image = new Image(), recovery = new Image();
    const needsRecovery = ascended && hit && chargeRecovered;
    let recoveryFailed = false;
    const schedule = () => {
      if (disposed || completed) return;
      cancelAnimationFrame(raf); raf = requestAnimationFrame(draw);
    };
    const watchdog = window.setTimeout(finish, 5000);
    image.onload = () => { window.clearTimeout(watchdog); schedule(); };
    image.onerror = finish;
    image.src = "/vfx/starbreak-snipe-v3/atlas.webp";
    const recoveryWatchdog = needsRecovery ? window.setTimeout(() => {
      recoveryFailed = true; schedule();
    }, 5000) : undefined;
    if (needsRecovery) {
      recovery.onload = () => { window.clearTimeout(recoveryWatchdog); schedule(); };
      recovery.onerror = () => { recoveryFailed = true; window.clearTimeout(recoveryWatchdog); schedule(); };
      recovery.src = "/vfx/starbreak-snipe/recovery.webp";
    }
    const observer = new ResizeObserver(schedule);
    observer.observe(canvas);
    const lost = (event: Event) => { event.preventDefault(); setFallback(true); };
    canvas.addEventListener("webglcontextlost", lost);
    function draw(now: number) {
      if (disposed || completed || !image.complete || !image.naturalWidth || renderer?.gl.isContextLost()) return;
      startedAt.current ??= now;
      const elapsed = now - startedAt.current;
      const recoveryReady = recovery.complete && recovery.naturalWidth > 0;
      if (needsRecovery && recoveryReady && (reduced || elapsed >= 570)) recoveryStart.current ??= now;
      const recoveryAge = recoveryStart.current === null ? -1 : now - recoveryStart.current;
      const recoveryDone = !needsRecovery || recoveryFailed || recoveryAge >= (reduced ? 240 : 360);
      if (elapsed >= (reduced ? 240 : STARBREAK_DURATION_MS) && recoveryDone) { finish(); return; }
      if (reduced || elapsed >= STARBREAK_IMPACT_MS) impact(!reduced);
      const rect = canvas.getBoundingClientRect();
      const width = canvas.clientWidth || rect.width, height = canvas.clientHeight || rect.height;
      const scaleX = width / Math.max(1, rect.width), scaleY = height / Math.max(1, rect.height);
      const player = stage?.querySelector<HTMLElement>(".fighter.player .fighter-frame")?.getBoundingClientRect();
      const enemy = stage?.querySelector<HTMLElement>(".fighter.enemy .fighter-frame")?.getBoundingClientRect();
      const fromX = player ? (player.left - rect.left + player.width * .72) * scaleX : width * .27;
      const fromY = player ? (player.top - rect.top + player.height * .48) * scaleY : height * .43;
      const toX = enemy ? (enemy.left - rect.left + enemy.width * .5) * scaleX : width * .73;
      const toY = enemy ? (enemy.top - rect.top + enemy.height * .48) * scaleY : height * .43;
      const portraitH = player ? player.height * scaleY : height * .65;
      const upperY = Math.max(22, Math.min(fromY, toY) - portraitH * .22);
      const points = [[fromX, upperY], [fromX + (toX - fromX) * .80, upperY],
        [fromX + (toX - fromX) * .16, toY], [toX, toY]];
      const cellW = image.naturalWidth / 4, cellH = image.naturalHeight / 4;
      const artSize = Math.min(190, portraitH * .72, width * .29);
      const opacity = reduced ? .75 : Math.max(0, Math.min(1, (STARBREAK_DURATION_MS - elapsed) / 110));
      if (renderer) { renderer.resize(width, height); renderer.clear(); }
      else if (context) {
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio));
        context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height);
      }
      const sprite = (sx: number, sy: number, sw: number, sh: number, x: number, y: number,
        w: number, h: number, alpha: number, rotation = 0, sourceImage = image) => {
        if (w <= 0 || h <= 0 || alpha <= 0) return;
        if (renderer) renderer.sprite(sourceImage, x, y, w, h, alpha, false,
          [sx / sourceImage.naturalWidth, sy / sourceImage.naturalHeight, sw / sourceImage.naturalWidth, sh / sourceImage.naturalHeight], rotation);
        else if (context) {
          context.save(); context.globalAlpha = alpha; context.translate(x + w / 2, y + h / 2); context.rotate(rotation);
          context.drawImage(sourceImage, sx, sy, sw, sh, -w / 2, -h / 2, w, h); context.restore();
        }
      };
      const part = (frame: number, x: number, y: number, size: number, alpha = 1, angle = 0) => {
        const index = frame + (ascended ? 8 : 0);
        const anchorX = frame === 0 ? .85 : frame === 2 ? .79 : frame === 3 ? .76
          : frame === 6 ? (ascended ? .16 : .10) : frame === 7 ? (ascended ? .11 : .13) : .5;
        const anchorY = frame >= 6 ? (ascended ? (frame === 6 ? .43 : .45) : .53) : .5;
        const h = size * (cellH - 4) / (cellW - 4);
        // Renderer rotates around the rectangle centre: offset that centre so the
        // painted arrow tip (or braking star) stays exactly on the motion anchor.
        const dx = (.5 - anchorX) * size, dy = (.5 - anchorY) * h;
        const centerX = x + dx * Math.cos(angle) - dy * Math.sin(angle);
        const centerY = y + dx * Math.sin(angle) + dy * Math.cos(angle);
        sprite(index % 4 * cellW + 2, Math.floor(index / 4) * cellH + 2, cellW - 4, cellH - 4,
          centerX - size / 2, centerY - h / 2, size, h, alpha, angle);
      };
      const travel = starbreakTravel(elapsed);
      // Dedicated painted starflame strip, distributed along the traversed segments. Each sample has
      // its own birth time: the start of the Z disappears before the final straight.
      if (!reduced && elapsed >= 50) {
        const starts = [50, 185, 315], ends = [145, 275, STARBREAK_IMPACT_MS];
        for (let segment = 0; segment < 3; segment++) {
          const a = points[segment], b = points[segment + 1];
          const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
          const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
          for (let sample = 0; sample < 16; sample++) {
            const t = (sample + .5) / 16;
            const birth = starts[segment] + (ends[segment] - starts[segment]) *
              (segment === 0 ? 1 - Math.sqrt(1 - t) : Math.pow(t, segment === 1 ? 1 / .65 : 1 / .7));
            if (elapsed < birth) continue;
            const age = elapsed - birth;
            const alpha = Math.max(0, 1 - age / 560) * opacity;
            // Ascended energy chase crosses the already formed Z and converges
            // into the wound at 560ms; this carries no additional damage event.
            const chaseAt = STARBREAK_IMPACT_MS + (birth - 50) / 360 * 150;
            const chase = ascended && hit ? Math.max(0, 1 - Math.abs(elapsed - chaseAt) / 35) : 0;
            const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
            const stripW = length / 16 * 1.65, stripH = Math.max(12, artSize * .25) * (1 + chase * .45) * (1 + .12 * Math.sin(age / 38 + sample));
            const index = ascended ? 9 : 1;
            sprite(index % 4 * cellW + cellW * .05, Math.floor(index / 4) * cellH + cellH * .25,
              cellW * .90, cellH * .50, x - stripW / 2, y - stripH / 2,
              stripW, stripH, Math.min(1, alpha * .86 + chase * .30) * opacity, angle);
          }
        }
      }
      if (!reduced && elapsed < STARBREAK_IMPACT_MS) {
        const a = points[travel.segment], b = points[travel.segment + 1];
        const x = a[0] + (b[0] - a[0]) * travel.progress, y = a[1] + (b[1] - a[1]) * travel.progress;
        const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
        part(elapsed < 50 ? 2 : 0, x, y,
          artSize * (elapsed < 50 ? .65 : .9), opacity, elapsed < 50 ? 0 : angle);
      }
      // Corner sprite overshoots the incoming direction while the arrow holds then turns.
      if (!reduced) for (const [corner, birth] of [[1, 145], [2, 275]]) {
        const age = elapsed - birth;
        if (age < 0 || age >= (ascended ? 410 : 220)) continue;
        const point = points[corner], incoming = points[corner - 1];
        const angle = Math.atan2(point[1] - incoming[1], point[0] - incoming[0]);
        part(age < 40 ? 2 : 3, point[0], point[1], artSize * (1.35 + Math.min(age, 80) / 220),
          Math.max(0, 1 - age / (ascended ? 410 : 220)) * opacity, angle);
        if (ascended && elapsed >= STARBREAK_IMPACT_MS) {
          const pulse = Math.max(0, 1 - Math.abs(elapsed - (430 + corner * 55)) / 65);
          part(2, point[0], point[1], artSize * .6, pulse * opacity);
        }
      }
      // A tight entry wound precedes branching cracks, then a rightward exit cone.
      // All stages use the same one settled contact at 410ms.
      if (hit && (reduced || elapsed >= STARBREAK_IMPACT_MS)) {
        const age = elapsed - STARBREAK_IMPACT_MS;
        const detonateAt = ascended ? 150 : 70;
        const woundSize = Math.min(portraitH * .86, width * .34, 235);
        const woundAlpha = reduced ? .75 : opacity * Math.max(.25, 1 - Math.max(0, age - detonateAt) / 400);
        part(reduced ? 5 : age < 65 ? 4 : 5, toX, toY,
          woundSize * (age < 65 && !reduced ? .60 : 1), woundAlpha);
        if (!reduced && age >= detonateAt) {
          const blastAge = age - detonateAt;
          // Keep the cone origin at the wound and its rightmost shards inside
          // the battle field on phones; never move the enemy or its hit anchor.
          const coneSize = Math.min(300, portraitH * 1.20, (width - toX - 5) / .92);
          const growth = .80 + Math.min(1, blastAge / 110) * .20;
          part(blastAge < 120 ? 6 : 7, toX, toY, coneSize * growth,
            opacity * Math.max(0, 1 - Math.max(0, blastAge - 140) / 240));
        }
      }
      if (needsRecovery && recoveryReady && recoveryAge >= 0 && !recoveryDone) {
        const frame = reduced ? 2 : recoveryAge < 70 ? 0 : recoveryAge < 160 ? 1 : recoveryAge < 260 ? 2 : 3;
        const cw = recovery.naturalWidth / 2, ch = recovery.naturalHeight / 2;
        const progress = reduced ? 1 : Math.min(1, recoveryAge / 160);
        const tipX = toX + (fromX - toX) * progress, tipY = toY + (fromY - toY) * progress;
        const w = Math.min(width * .28, frame < 2 ? 120 : 100, (player ? player.width * scaleX : width * .20) * .65);
        const h = w * (ch - 2) / (cw - 2), anchors = [[.31,.55],[.14,.55],[.50,.44],[.46,.475]];
        sprite(frame % 2 * cw + 1, Math.floor(frame / 2) * ch + 1, cw - 2, ch - 2,
          Math.max(0, Math.min(width - w, tipX - w * anchors[frame][0])),
          Math.max(0, Math.min(height - h, tipY - h * anchors[frame][1])), w, h,
          reduced ? .75 : Math.min(1, (360 - recoveryAge) / 100), 0, recovery);
      }
      // Waiting for the secondary art does not keep an empty 60fps loop alive.
      if (elapsed >= (reduced ? 240 : STARBREAK_DURATION_MS) && needsRecovery && !recoveryReady && !recoveryFailed) return;
      schedule();
    }
    return () => {
      disposed = true; cancelAnimationFrame(raf); window.clearTimeout(watchdog);
      window.clearTimeout(recoveryWatchdog); recovery.onload = null; recovery.onerror = null;
      shake?.cancel();
      observer.disconnect(); image.onload = null; image.onerror = null;
      canvas.removeEventListener("webglcontextlost", lost);
      if (renderer && !renderer.gl.isContextLost()) renderer.dispose();
    };
  }, [effectKey, hit, fallback, ascended, chargeRecovered]);
  return <canvas key={fallback ? "canvas" : "webgl"} ref={canvasRef} className="skill-effect-canvas starbreak-snipe-canvas" aria-hidden="true" />;
}
