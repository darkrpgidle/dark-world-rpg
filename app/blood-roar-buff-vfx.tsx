"use client";

import { useEffect, useRef, useState } from "react";
import { WebGLSpriteLayer } from "./webgl-sprite-layer";

const FRAME_COUNT = 8;
const FRAME_DURATION_MS = 100;

export function BloodRoarBuffVfx({ active }: { active: boolean }) {
  const [frame, setFrame] = useState(0);
  const vfxRef = useRef<HTMLSpanElement>(null);
  const [bounds, setBounds] = useState({ width: 224, height: 314, left: 95, top: 135 });

  useEffect(() => {
    if (!active) {
      setFrame(0);
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(
      () => setFrame((current) => (current + 1) % FRAME_COUNT),
      FRAME_DURATION_MS,
    );

    return () => window.clearInterval(timer);
  }, [active]);

  useEffect(() => {
    const vfx = vfxRef.current;
    const frameElement = vfx?.closest<HTMLElement>(".fighter-frame");
    if (!vfx || !frameElement) return;

    const updateBounds = () => {
      const frameRect = frameElement.getBoundingClientRect();
      setBounds({
        width: frameRect.width * 1.258,
        height: frameRect.height * 1.163,
        left: frameRect.width / 2,
        top: frameRect.height / 2,
      });
    };

    updateBounds();
    const observer = new ResizeObserver(updateBounds);
    observer.observe(frameElement);
    window.addEventListener("resize", updateBounds);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateBounds);
    };
  }, []);

  if (!active) return null;

  return (
    <span
      ref={vfxRef}
      aria-hidden="true"
      className="blood-roar-buff-vfx"
      style={{
        width: `${bounds.width}px`,
        height: `${bounds.height}px`,
        left: `${bounds.left}px`,
        top: `${bounds.top}px`,
      }}
    >
      <WebGLSpriteLayer
        sprites={[{ source: `/vfx/blood-roar-border/blood-roar-border-frame-${String(frame).padStart(2, "0")}.png`,
          x: bounds.width / 2, y: bounds.height / 2, width: bounds.width, height: bounds.height }]}
        fallback={<span className="blood-roar-buff-fallback" style={{ backgroundImage: `url(/vfx/blood-roar-border/blood-roar-border-frame-${String(frame).padStart(2, "0")}.png)` }} />}
      />
    </span>
  );
}
