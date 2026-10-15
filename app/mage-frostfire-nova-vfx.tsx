"use client";
import { useEffect, useRef, useState } from "react";
import { WebGLVfxRenderer } from "./webgl-vfx-renderer";
import { FROSTFIRE_ART, FROSTFIRE_TIMING, frostfireArc, frostfireFlightProgress, frostfireFrame, frostfireUv,
  type FrostfireVisual, type FrostfireStatusVisual } from "./frostfire-nova-frames";

type Props = { effects: FrostfireVisual[]; statuses: FrostfireStatusVisual;
  onImpact: (key: number) => void; onComplete: (key: number) => void };

// One canvas owns all Frostfire casts, persistent ailments and ascended bursts.
export function MageFrostfireNovaVfx({ effects, statuses, onImpact, onComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputs = useRef({ effects, statuses, onImpact, onComplete });
  const wake = useRef<(() => void) | null>(null);
  const playbacks = useRef(new Map<number, { start: number; impacted: boolean; completed: boolean }>());
  const statusBirth = useRef<{ burn?: number; freeze?: number }>({});
  const [fallback, setFallback] = useState(false);
  useEffect(() => { inputs.current = { effects, statuses, onImpact, onComplete }; wake.current?.(); }, [effects, statuses, onImpact, onComplete]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stage = canvas.closest<HTMLElement>(".battle-stage");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let disposed = false, raf = 0, artFailed = false, loaded = false;
    let renderer: WebGLVfxRenderer | null = null, context: CanvasRenderingContext2D | null = null;
    const impacts = (effect: FrostfireVisual, record: { impacted: boolean }) => {
      if (record.impacted) return;
      record.impacted = true; inputs.current.onImpact(effect.key);
    };
    const finish = (effect: FrostfireVisual) => {
      const record = playbacks.current.get(effect.key) ?? { start: 0, impacted: false, completed: false };
      playbacks.current.set(effect.key, record);
      if (record.completed) return;
      record.completed = true; impacts(effect, record); inputs.current.onComplete(effect.key);
    };
    const finishAll = () => { if (!disposed) inputs.current.effects.forEach(finish); };
    let fallbackTimer: number | undefined;
    if (!fallback) {
      try { renderer = new WebGLVfxRenderer(canvas); }
      catch { fallbackTimer = window.setTimeout(() => setFallback(true), 0); }
      if (!renderer) return () => window.clearTimeout(fallbackTimer);
    } else {
      context = canvas.getContext("2d");
      if (!context) { finishAll(); return; }
    }
    const images = [new Image(), new Image()];
    const schedule = () => { if (!disposed) { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); } };
    wake.current = schedule;
    const watchdog = window.setTimeout(() => { artFailed = true; finishAll(); }, 3000);
    const ready = () => {
      loaded = images.every(image => image.complete && image.naturalWidth > 0);
      if (loaded) { window.clearTimeout(watchdog); schedule(); }
    };
    images.forEach(image => { image.onload = ready; image.onerror = () => { artFailed = true; window.clearTimeout(watchdog); finishAll(); }; });
    images[0].src = FROSTFIRE_ART.main; images[1].src = FROSTFIRE_ART.states;
    const observer = new ResizeObserver(schedule); observer.observe(canvas);
    const lost = (event: Event) => { event.preventDefault(); setFallback(true); };
    canvas.addEventListener("webglcontextlost", lost);
    let shake: Animation | undefined;
    const sprite = (image: HTMLImageElement, frame: number, x: number, y: number,
      w: number, h: number, alpha = 1, angle = 0) => {
      const uv = frostfireUv(frame, image.naturalWidth, image.naturalHeight);
      // Painted projectile cores sit right of their short left-hand tail.
      const offset = image === images[0] && frame >= 4 && frame <= 7 ? w * .15 : 0;
      x -= Math.cos(angle) * offset; y -= Math.sin(angle) * offset;
      if (renderer) renderer.sprite(image, x - w / 2, y - h / 2, w, h, alpha, false, uv, angle);
      else if (context) {
        context.save(); context.globalAlpha = alpha; context.translate(x, y); context.rotate(angle);
        context.drawImage(image, uv[0] * image.naturalWidth, uv[1] * image.naturalHeight,
          uv[2] * image.naturalWidth, uv[3] * image.naturalHeight, -w / 2, -h / 2, w, h); context.restore();
      }
    };
    function draw(now: number) {
      if (disposed) return;
      if (artFailed) { finishAll(); return; }
      if (!loaded || renderer?.gl.isContextLost()) return;
      const rect = canvas!.getBoundingClientRect();
      const width = canvas!.clientWidth || rect.width, height = canvas!.clientHeight || rect.height;
      if (!width || !height) { finishAll(); return; }
      const sx = width / Math.max(1, rect.width), sy = height / Math.max(1, rect.height);
      const player = stage?.querySelector<HTMLElement>(".fighter.player .fighter-frame")?.getBoundingClientRect();
      const enemy = stage?.querySelector<HTMLElement>(".fighter.enemy .fighter-frame")?.getBoundingClientRect();
      const from = { x: player ? (player.left - rect.left + player.width * .8) * sx : width * .28,
        y: player ? (player.top - rect.top + player.height * .4) * sy : height * .4 };
      const to = { x: enemy ? (enemy.left - rect.left + enemy.width * .5) * sx : width * .74,
        y: enemy ? (enemy.top - rect.top + enemy.height * .48) * sy : height * .44 };
      const ew = enemy ? enemy.width * sx : width * .24, eh = enemy ? enemy.height * sy : height * .65;
      const orbSize = Math.min(100, ew * .62) * 2, burstSize = Math.min(310, ew * 1.55);
      // Limit the arc to the space above both actor centers; keep the ball inside the stage.
      const arcHeight = Math.max(0, Math.min(eh * .45, Math.min(from.y, to.y) - orbSize * .45));
      if (renderer) { renderer.resize(width, height); renderer.clear(); }
      else if (context) {
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        canvas!.width = Math.max(1, Math.round(width * ratio)); canvas!.height = Math.max(1, Math.round(height * ratio));
        context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height);
      }
      let active = false;
      const wallNow = Date.now();
      for (const kind of ["burn", "freeze"] as const) {
        const expiresAt = inputs.current.statuses[kind];
        if (expiresAt === undefined || expiresAt <= wallNow) { delete statusBirth.current[kind]; continue; }
        statusBirth.current[kind] ??= now;
        const age = now - statusBirth.current[kind]!;
        const frame = kind === "burn" ? reduced ? 1 : Math.floor(age / 130) % 4
          : 4 + (reduced ? 3 : Math.min(3, Math.floor(age / 75)));
        const alpha = Math.min(1, (expiresAt - wallNow) / 150) * (kind === "burn" ? .72 : .86);
        sprite(images[1], frame, to.x, enemy ? (enemy.top - rect.top + enemy.height * .55) * sy : to.y,
          ew * 1.18, eh * .95, alpha);
        active = !reduced;
      }
      const keys = new Set(inputs.current.effects.map(effect => effect.key));
      for (const key of playbacks.current.keys()) if (!keys.has(key)) playbacks.current.delete(key);
      for (const effect of inputs.current.effects) {
        let record = playbacks.current.get(effect.key);
        if (!record) { record = { start: now, impacted: false, completed: false }; playbacks.current.set(effect.key, record); }
        if (record.completed) continue;
        const elapsed = now - record.start;
        const main = effect.kind === "main";
        const impactAt = main ? FROSTFIRE_TIMING.impact : effect.kind === "shatter" ? FROSTFIRE_TIMING.shatterImpact : FROSTFIRE_TIMING.burstImpact;
        const duration = reduced ? 180 : main ? FROSTFIRE_TIMING.duration : effect.kind === "shatter" ? FROSTFIRE_TIMING.shatterDuration : FROSTFIRE_TIMING.burstDuration;
        if (elapsed >= duration) { finish(effect); continue; }
        if ((reduced || elapsed >= impactAt) && !record.impacted) {
          impacts(effect, record);
          if (effect.hit && !reduced && stage?.animate) {
            shake?.cancel();
            const amount = width < 600 ? 1 : 2;
            shake = stage.animate([{ transform: "translate(0,0)" }, { transform: `translate(${-amount}px,${amount}px)` },
              { transform: `translate(${amount}px,${-amount}px)` }, { transform: "translate(0,0)" }], { duration: 140 });
          }
        }
        const alpha = Math.min(1, (duration - elapsed) / 100);
        if (!main) {
          if (effect.hit) sprite(images[1], reduced ? effect.kind === "shatter" ? 13 : 9 : frostfireFrame(effect.kind, elapsed),
            to.x, to.y, effect.kind === "shatter" ? ew * 1.25 : burstSize * .8,
            effect.kind === "shatter" ? eh * .95 : burstSize * .8, alpha);
        } else if (reduced) {
          sprite(images[0], effect.hit ? 9 : 5, to.x, to.y, effect.hit ? burstSize : orbSize, effect.hit ? burstSize : orbSize, alpha);
        } else if (elapsed < FROSTFIRE_TIMING.charge) {
          const windup = Math.sin(elapsed / FROSTFIRE_TIMING.charge * Math.PI) * ew * .08;
          sprite(images[0], frostfireFrame("main", elapsed), from.x - windup, from.y + windup, orbSize, orbSize);
        } else if (elapsed < FROSTFIRE_TIMING.impact || !effect.hit) {
          const t = frostfireFlightProgress(elapsed);
          const ball = frostfireArc(from, to, arcHeight, t);
          for (let index = 3; index >= 1; index--) {
            const trail = frostfireArc(from, to, arcHeight, frostfireFlightProgress(elapsed - index * 24));
            sprite(images[0], 4 + Math.floor(elapsed / 90) % 4, trail.x, trail.y, orbSize * .8, orbSize * .8,
              Math.max(0, .16 - index * .035) * alpha, trail.angle);
          }
          sprite(images[0], frostfireFrame("main", Math.min(elapsed, FROSTFIRE_TIMING.impact - 1)), ball.x, ball.y, orbSize, orbSize,
            effect.hit ? 1 : Math.max(0, 1 - Math.max(0, elapsed - FROSTFIRE_TIMING.impact) / 160), ball.angle);
        } else {
          sprite(images[0], frostfireFrame("main", elapsed), to.x, to.y, burstSize, burstSize, alpha);
        }
        active = true;
      }
      if (active) schedule();
    }
    schedule();
    return () => {
      disposed = true; cancelAnimationFrame(raf); window.clearTimeout(watchdog); observer.disconnect(); shake?.cancel();
      wake.current = null; images.forEach(image => { image.onload = null; image.onerror = null; });
      canvas.removeEventListener("webglcontextlost", lost);
      if (renderer && !renderer.gl.isContextLost()) renderer.dispose();
    };
  }, [fallback]);
  return <canvas key={fallback ? "canvas" : "webgl"} ref={canvasRef} className="skill-effect-canvas frostfire-nova-canvas" aria-hidden="true" />;
}
