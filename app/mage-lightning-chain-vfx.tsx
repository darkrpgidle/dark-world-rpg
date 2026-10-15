"use client";
import { useEffect, useRef, useState } from "react";
import { WebGLVfxRenderer } from "./webgl-vfx-renderer";
import { LIGHTNING_ART, LIGHTNING_CONTACTS, lightningDuration, lightningUv, type LightningVisual } from "./lightning-chain-frames";
type Props = { effects: LightningVisual[]; paralysisExpiresAt?: number;
  onImpact: (key: number, index: number) => void; onComplete: (key: number) => void };

// One canvas owns all Lightning casts, paralysis and ascended resonance.
export function MageLightningChainVfx({ effects, paralysisExpiresAt, onImpact, onComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputs = useRef({ effects, paralysisExpiresAt, onImpact, onComplete });
  const wake = useRef<(() => void) | null>(null);
  const playbacks = useRef(new Map<number, { start: number; published: Set<number>; completed: boolean }>());
  const [fallback, setFallback] = useState(false);
  useEffect(() => { inputs.current = { effects, paralysisExpiresAt, onImpact, onComplete }; wake.current?.(); }, [effects, paralysisExpiresAt, onImpact, onComplete]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stage = canvas.closest<HTMLElement>(".battle-stage");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let disposed = false, raf = 0, artFailed = false, loaded = false;
    let renderer: WebGLVfxRenderer | null = null, context: CanvasRenderingContext2D | null = null;
    const impacts = (effect: LightningVisual, record: { published: Set<number> }, index: number) => {
      if (record.published.has(index)) return;
      record.published.add(index); inputs.current.onImpact(effect.key, index);
    };
    const finish = (effect: LightningVisual) => {
      const record = playbacks.current.get(effect.key) ?? { start: 0, published: new Set<number>(), completed: false };
      playbacks.current.set(effect.key, record);
      if (record.completed) return;
      record.completed = true;
      effect.segments.forEach((_, index) => impacts(effect, record, index));
      inputs.current.onComplete(effect.key);
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
    images[0].src = LIGHTNING_ART.main; images[1].src = LIGHTNING_ART.ascended;
    const observer = new ResizeObserver(schedule); observer.observe(canvas);
    const lost = (event: Event) => { event.preventDefault(); setFallback(true); };
    canvas.addEventListener("webglcontextlost", lost);
    let shake: Animation | undefined;
    const sprite = (image: HTMLImageElement, frame: number, x: number, y: number,
      w: number, h: number, alpha = 1, angle = 0) => {
      const uv = lightningUv(frame, image.naturalWidth, image.naturalHeight);
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
      const chargeSize = Math.min(130, ew * .8), impactSize = Math.min(210, ew * 1.1);
      if (renderer) { renderer.resize(width, height); renderer.clear(); }
      else if (context) {
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        canvas!.width = Math.max(1, Math.round(width * ratio)); canvas!.height = Math.max(1, Math.round(height * ratio));
        context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height);
      }
      let active = false;
      const expiry = inputs.current.paralysisExpiresAt;
      if (expiry !== undefined && expiry > Date.now()) {
        sprite(images[0], 12 + (reduced ? 1 : Math.floor(now / 140) % 4), to.x, to.y, ew * 1.15, eh * .85,
          Math.min(.6, (expiry - Date.now()) / 250));
        active = !reduced;
      }
      const keys = new Set(inputs.current.effects.map(effect => effect.key));
      for (const key of playbacks.current.keys()) if (!keys.has(key)) playbacks.current.delete(key);
      for (const effect of inputs.current.effects) {
        let record = playbacks.current.get(effect.key);
        if (!record) { record = { start: now, published: new Set<number>(), completed: false }; playbacks.current.set(effect.key, record); }
        if (record.completed) continue;
        const elapsed = now - record.start;
        const duration = reduced ? 180 : lightningDuration(effect);
        if (elapsed >= duration) { finish(effect); continue; }
        effect.segments.forEach((segment, index) => {
          if ((reduced || elapsed >= LIGHTNING_CONTACTS[index]) && !record!.published.has(index)) {
            impacts(effect, record!, index);
            if (index === 3 && segment.hit && !reduced && stage?.animate) {
              shake?.cancel(); const amount = width < 600 ? 2 : 4;
              shake = stage.animate([{ transform: "translate(0,0)" }, { transform: `translate(${-amount}px,${amount}px)` },
                { transform: `translate(${amount}px,${-amount}px)` }, { transform: "translate(0,0)" }], { duration: 160 });
            }
          }
        });
        if (reduced) {
          const hit = effect.segments.some(segment => segment.hit);
          sprite(images[0], hit ? 9 : 5, to.x, to.y, impactSize, impactSize, (duration - elapsed) / duration);
        } else {
          if (elapsed < 200) sprite(images[0], Math.min(3, Math.floor(elapsed / 50)), from.x, from.y, chargeSize, chargeSize);
          for (let index = 0; index < 3; index++) {
            const age = elapsed - LIGHTNING_CONTACTS[index];
            if (age < 0 || age >= 130) continue;
            const hit = effect.segments[index]?.hit;
            const endpoint = { x: to.x, y: to.y + (hit ? 0 : eh * (index % 2 ? -.35 : .35)) };
            const dx = endpoint.x - from.x, dy = endpoint.y - from.y;
            // The generated bolt starts/ends at 10%/90% of the cell, hence / .8.
            const length = Math.hypot(dx, dy) / .8;
            sprite(images[0], 4 + (index + Math.floor(age / 33)) % 4,
              (from.x + endpoint.x) / 2, (from.y + endpoint.y) / 2,
              length, Math.min(130, eh * .5) * (1 + index * .08), 1 - age / 130, Math.atan2(dy, dx));
            if (hit) sprite(images[0], 8 + Math.min(3, Math.floor(age / 33)), to.x, to.y,
              impactSize * (1 + index * .08), impactSize * (1 + index * .08), 1 - age / 130);
          }
          if (effect.ascended) {
            const ringSize = Math.min(340, ew * 1.65);
            if (elapsed < 520) {
              effect.segments.slice(0, 3).forEach((segment, index) => {
                if (!segment.hit || elapsed < LIGHTNING_CONTACTS[index]) return;
                const angle = -Math.PI / 2 + index * Math.PI * 2 / 3;
                sprite(images[1], index, to.x + Math.cos(angle) * ringSize * .32,
                  to.y + Math.sin(angle) * ringSize * .32, ringSize * .24, ringSize * .24);
              });
            } else if (effect.segments.length > 3 && elapsed < 800) {
              const frame = elapsed < 640 ? 4 + Math.min(3, Math.floor((elapsed - 520) / 30))
                : 8 + Math.min(3, Math.floor((elapsed - 640) / 40));
              sprite(images[1], frame, to.x, to.y, ringSize, ringSize);
            } else if (effect.segments.length > 3 && effect.segments[3].hit && elapsed < 1100) {
              sprite(images[1], 12 + Math.min(3, Math.floor((elapsed - 800) / 75)), to.x, to.y,
                ringSize * 1.1, ringSize * 1.1, Math.min(1, (1100 - elapsed) / 100));
            } else if (elapsed < 650) {
              sprite(images[1], 3, to.x, to.y, ringSize * .55, ringSize * .55, (650 - elapsed) / 130);
            }
          }
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
  return <canvas key={fallback ? "canvas" : "webgl"} ref={canvasRef} className="skill-effect-canvas lightning-chain-canvas" aria-hidden="true" />;
}
