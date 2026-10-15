"use client";
import { useEffect, useRef, useState } from "react";
import { WebGLVfxRenderer } from "./webgl-vfx-renderer";
import { METEOR_ART, METEOR_TIMING, HEAVEN_MAIN_ANCHORS, HEAVEN_BURST_ANCHORS, heavenMeteorFrame, meteorFrame, meteorBurstFrame, meteorFlight, meteorUv, type MeteorVisual } from "./meteor-strike-frames";

type Props = { effects: MeteorVisual[]; onImpact: (key: number, index: number) => void; onComplete: (key: number) => void };
export function MageMeteorStrikeVfx({ effects, onImpact, onComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputs = useRef({ effects, onImpact, onComplete });
  const wake = useRef<(() => void) | null>(null);
  const playbacks = useRef(new Map<number, { start: number; published: Set<number>; completed: boolean }>());
  const [fallback, setFallback] = useState(false);
  useEffect(() => { inputs.current = { effects, onImpact, onComplete }; wake.current?.(); }, [effects, onImpact, onComplete]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stage = canvas.closest<HTMLElement>(".battle-stage");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let disposed = false, raf = 0, artFailed = false, loaded = false;
    let renderer: WebGLVfxRenderer | null = null, context: CanvasRenderingContext2D | null = null;
    const impact = (effect: MeteorVisual, record: { published: Set<number> }, index: number) => {
      if (record.published.has(index)) return;
      record.published.add(index); inputs.current.onImpact(effect.key, index);
    };
    const finish = (effect: MeteorVisual) => {
      const record = playbacks.current.get(effect.key) ?? { start: 0, published: new Set<number>(), completed: false };
      playbacks.current.set(effect.key, record);
      if (record.completed) return;
      record.completed = true; impact(effect, record, 0);
      if (effect.afterburst) impact(effect, record, 1);
      inputs.current.onComplete(effect.key);
    };
    const finishAll = () => { if (!disposed) inputs.current.effects.forEach(finish); };
    if (!fallback) {
      try { renderer = new WebGLVfxRenderer(canvas); }
      catch { const timer = window.setTimeout(() => setFallback(true), 0); return () => window.clearTimeout(timer); }
    } else {
      context = canvas.getContext("2d");
      if (!context) { finishAll(); return; }
    }
    const images = [new Image(), new Image(), new Image()];
    const schedule = () => { if (!disposed) { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); } };
    wake.current = schedule;
    const watchdog = window.setTimeout(() => { artFailed = true; finishAll(); }, 3000);
    const ready = () => {
      loaded = images.every(image => image.complete && image.naturalWidth > 0);
      if (loaded) { artFailed = false; window.clearTimeout(watchdog); schedule(); }
    };
    images.forEach(image => { image.onload = ready; image.onerror = () => { artFailed = true; window.clearTimeout(watchdog); finishAll(); }; });
    images[0].src = METEOR_ART.main; images[1].src = METEOR_ART.ascended; images[2].src = METEOR_ART.ascendedMain;
    const observer = new ResizeObserver(schedule); observer.observe(canvas);
    const lost = (event: Event) => { event.preventDefault(); setFallback(true); };
    canvas.addEventListener("webglcontextlost", lost);
    let shake: Animation | undefined;
    const quake = (secondary: boolean, stageWidth: number) => {
      if (reduced || !stage?.animate) return;
      shake?.cancel();
      const strength = (stageWidth < 600 ? 8 : 14) * (secondary ? .75 : 1);
      shake = stage.animate([
        { transform: "translate(0,0) rotate(0deg)" },
        { transform: `translate(${-strength}px,${strength * .65}px) rotate(-.22deg)` },
        { transform: `translate(${strength}px,${-strength * .8}px) rotate(.22deg)` },
        { transform: `translate(${-strength * .8}px,${strength * .5}px) rotate(-.15deg)` },
        { transform: `translate(${strength * .65}px,${-strength * .4}px) rotate(.12deg)` },
        { transform: `translate(${-strength * .4}px,${strength * .25}px)` },
        { transform: `translate(${strength * .2}px,${-strength * .15}px)` },
        { transform: "translate(0,0) rotate(0deg)" },
      ], { duration: secondary ? 260 : 360, easing: "linear" });
    };
    const sprite = (ascended: boolean, frame: number, x: number, y: number, w: number, h: number, alpha = 1, angle = 0, heavenMain = false) => {
      const image = images[ascended ? 1 : heavenMain ? 2 : 0], uv = meteorUv(frame, image.naturalWidth, image.naturalHeight, ascended);
      // Align the painted rock core/contact point, rather than its tail, to the live anchor.
      if (ascended || heavenMain) {
        const anchor = (ascended ? HEAVEN_BURST_ANCHORS : HEAVEN_MAIN_ANCHORS)[frame];
        const ox = (anchor[0] - .5) * w, oy = (anchor[1] - .5) * h;
        x -= ox * Math.cos(angle) - oy * Math.sin(angle);
        y -= ox * Math.sin(angle) + oy * Math.cos(angle);
      } else if (frame >= 5 && frame <= 11) {
        const ox = -w * .2, oy = h * .18;
        x -= ox * Math.cos(angle) - oy * Math.sin(angle);
        y -= ox * Math.sin(angle) + oy * Math.cos(angle);
      } else if (!ascended && frame >= 12 && frame <= 17) y -= h * .24;
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
      const rect = canvas!.getBoundingClientRect(), width = canvas!.clientWidth, height = canvas!.clientHeight;
      if (!width || !height) { finishAll(); return; }
      const enemy = stage?.querySelector<HTMLElement>(".fighter.enemy .fighter-frame")?.getBoundingClientRect();
      if (!enemy) { finishAll(); return; }
      const sx = width / Math.max(1, rect.width), sy = height / Math.max(1, rect.height);
      const ew = enemy.width * sx, eh = enemy.height * sy;
      const to = { x: (enemy.left - rect.left + enemy.width * .5) * sx, y: (enemy.top - rect.top + enemy.height * .66) * sy };
      const rockSize = ew * 1.2, blastSize = ew * 2;
      const from = { x: Math.min(width - rockSize * .4, to.x + ew * .85), y: Math.max(rockSize * .4, (enemy.top - rect.top) * sy - eh * .27) };
      if (renderer) { renderer.resize(width, height); renderer.clear(); }
      else if (context) {
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        const pw = Math.max(1, Math.round(width * ratio)), ph = Math.max(1, Math.round(height * ratio));
        if (canvas!.width !== pw || canvas!.height !== ph) { canvas!.width = pw; canvas!.height = ph; }
        context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height);
      }
      const keys = new Set(inputs.current.effects.map(effect => effect.key));
      for (const key of playbacks.current.keys()) if (!keys.has(key)) playbacks.current.delete(key);
      let active = false;
      for (const effect of inputs.current.effects) {
        let record = playbacks.current.get(effect.key);
        if (!record) { record = { start: now, published: new Set<number>(), completed: false }; playbacks.current.set(effect.key, record); }
        if (record.completed) continue;
        const elapsed = now - record.start;
        const duration = reduced ? 180 : effect.afterburst ? METEOR_TIMING.burstDuration : METEOR_TIMING.duration;
        if (elapsed >= duration) { finish(effect); continue; }
        if ((reduced || elapsed >= METEOR_TIMING.impact) && !record.published.has(0)) {
          impact(effect, record, 0); if (effect.hit) quake(false, stage?.clientWidth ?? width);
        }
        if (effect.afterburst && (reduced || elapsed >= METEOR_TIMING.burstImpact) && !record.published.has(1)) {
          impact(effect, record, 1); if (effect.afterburst.hit) quake(true, stage?.clientWidth ?? width);
        }
        const mainFrame = effect.ascended ? heavenMeteorFrame : meteorFrame;
        const mainSprite = (frame: number, x: number, y: number, w: number, h: number, alpha = 1, angle = 0) => sprite(false, frame, x, y, w, h, alpha, angle, effect.ascended);
        if (reduced) {
          if (effect.hit) mainSprite( 14, to.x, to.y, blastSize, blastSize, 1 - elapsed / duration);
        } else if (elapsed < METEOR_TIMING.charge) {
          mainSprite(mainFrame(elapsed), from.x, from.y, rockSize, rockSize);
        } else if (elapsed < METEOR_TIMING.impact || !effect.hit) {
          const endpoint = effect.hit ? to : { x: to.x - ew * .65, y: to.y + eh * .35 };
          const pos = meteorFlight(from, endpoint, elapsed);
          const alpha = effect.hit ? 1 : Math.max(0, 1 - Math.max(0, elapsed - METEOR_TIMING.impact) / 120);
          if (alpha > 0) mainSprite(mainFrame(Math.min(elapsed, METEOR_TIMING.impact - 1)), pos.x, pos.y, rockSize, rockSize, alpha, pos.angle);
        } else if (elapsed < METEOR_TIMING.duration) {
          mainSprite(mainFrame(elapsed), to.x, to.y, blastSize, blastSize,
            Math.min(1, (METEOR_TIMING.duration - elapsed) / 180));
        }
        if (!reduced && effect.afterburst && elapsed >= METEOR_TIMING.burstStart
          && (effect.afterburst.hit || elapsed < METEOR_TIMING.burstImpact)) {
          // Ascended cells have a 9:8 cell aspect, preserved by both backends.
          sprite(true, meteorBurstFrame(elapsed), to.x, to.y, blastSize * 1.5, blastSize * 1.5 * 8 / 9,
            effect.afterburst.hit ? Math.min(1, (duration - elapsed) / 160) : Math.max(0, (METEOR_TIMING.burstImpact - elapsed) / 200));
        }
        active = true;
      }
      if (active) schedule();
    }
    schedule();
    return () => {
      disposed = true; cancelAnimationFrame(raf); window.clearTimeout(watchdog); observer.disconnect(); shake?.cancel(); wake.current = null;
      images.forEach(image => { image.onload = null; image.onerror = null; });
      canvas.removeEventListener("webglcontextlost", lost);
      if (renderer && !renderer.gl.isContextLost()) renderer.dispose();
    };
  }, [fallback]);
  return <canvas key={fallback ? "2d" : "webgl"} ref={canvasRef} className="skill-effect-canvas meteor-strike-canvas" aria-hidden="true" />;
}
