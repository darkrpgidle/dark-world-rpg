"use client";
import { useEffect, useRef, useState } from "react";
import { WebGLVfxRenderer } from "./webgl-vfx-renderer";
import { VOID_ART, VOID_ASCENDED_PAGES, VOID_ASCENDED_ANCHORS, voidAscendedFrame, VOID_TIMING, voidFrame, voidUv, voidGeometry, type VoidVisual } from "./void-collapse-frames";

type Props = { effects: VoidVisual[]; onImpact: (key: number, index: number) => void; onComplete: (key: number) => void };
export function MageVoidCollapseVfx({ effects, onImpact, onComplete }: Props) {
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
    const impact = (effect: VoidVisual, record: { published: Set<number> }, index: number) => {
      if (record.published.has(index)) return;
      record.published.add(index); inputs.current.onImpact(effect.key, index);
    };
    const finish = (effect: VoidVisual) => {
      const record = playbacks.current.get(effect.key) ?? { start: 0, published: new Set<number>(), completed: false };
      playbacks.current.set(effect.key, record);
      if (record.completed) return;
      record.completed = true; impact(effect, record, 0);

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
    const images = [new Image(), ...VOID_ASCENDED_PAGES.map(() => new Image())];
    const schedule = () => { if (!disposed) { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); } };
    wake.current = schedule;
    const watchdog = window.setTimeout(() => { artFailed = true; finishAll(); }, 3000);
    const ready = () => {
      loaded = images.every(image => image.complete && image.naturalWidth > 0);
      if (loaded) { artFailed = false; window.clearTimeout(watchdog); schedule(); }
    };
    images.forEach(image => { image.onload = ready; image.onerror = () => { artFailed = true; window.clearTimeout(watchdog); finishAll(); }; });
    images[0].src = VOID_ART;
    VOID_ASCENDED_PAGES.forEach((path, page) => { images[page + 1].src = path; });
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
    const sprite = (frame: number, x: number, y: number, w: number, h: number, alpha = 1, angle = 0, ascended = false) => {
      const image = images[ascended ? 1 + Math.floor(frame / 12) : 0];
      const uv = voidUv(frame, image.naturalWidth, image.naturalHeight, ascended);
      if (ascended) {
        const anchor = VOID_ASCENDED_ANCHORS[frame];
        x -= (anchor[0] - .5) * w; y -= (anchor[1] - .5) * h;
      }
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
      const to = voidGeometry(enemy, rect, width, height);
      const blastSize = to.size;
      if (renderer) { renderer.resize(width, height); renderer.clear(); }
      else if (context) {
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        const pw = Math.max(1, Math.round(width * ratio)), ph = Math.max(1, Math.round(height * ratio));
        if (canvas!.width !== pw || canvas!.height !== ph) { canvas!.width = pw; canvas!.height = ph; }
        context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
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
        const duration = reduced ? 180 : VOID_TIMING.duration;
        if (elapsed >= duration) { finish(effect); continue; }
        if ((reduced || elapsed >= VOID_TIMING.impact) && !record.published.has(0)) {
          impact(effect, record, 0); if (effect.hit) quake(false, stage?.clientWidth ?? width);
        }
        const scale = effect.ascended ? 1.45 : 1;
        const missFrame = effect.ascended ? 17 : 11;
        const frame = reduced ? (effect.hit ? (effect.ascended ? 20 : 14) : missFrame)
          : effect.ascended ? voidAscendedFrame(elapsed) : voidFrame(elapsed);
        // A miss closes the compressed rift without playing a contact blast.
        const missed = !effect.hit && elapsed >= VOID_TIMING.impact;
        const alpha = missed ? Math.max(0, 1 - (elapsed - VOID_TIMING.impact) / 180)
          : reduced ? 1 - elapsed / duration : Math.min(1, (duration - elapsed) / 200);
        if (alpha > 0) {
          sprite(missed ? missFrame : frame, to.x, to.y, blastSize * scale, blastSize * scale, alpha, 0, effect.ascended);
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
  return <canvas key={fallback ? "2d" : "webgl"} ref={canvasRef} className="skill-effect-canvas void-collapse-canvas" aria-hidden="true" />;
}
