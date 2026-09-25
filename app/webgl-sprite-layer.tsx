"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { WebGLVfxRenderer } from "./webgl-vfx-renderer";

export type WebGLSprite = {
  source: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
  rotation?: number;
  additive?: boolean;
  uv?: [number, number, number, number];
};

// A single GPU surface can draw several successive skill frames and shots.
// The DOM image is retained only when the device cannot create a WebGL2 context.
export function WebGLSpriteLayer({ sprites, fallback }: { sprites: WebGLSprite[]; fallback: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WebGLVfxRenderer | null>(null);
  const imagesRef = useRef(new Map<string, HTMLImageElement>());
  const spritesRef = useRef(sprites);
  const [unavailable, setUnavailable] = useState(false);
  spritesRef.current = sprites;

  useEffect(() => {
    if (unavailable) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: WebGLVfxRenderer;
    try {
      renderer = new WebGLVfxRenderer(canvas);
    } catch {
      setUnavailable(true);
      return;
    }
    rendererRef.current = renderer;
    let disposed = false;
    const paint = () => {
      if (disposed) return;
      renderer.resize();
      renderer.clear();
      const canvasRect = canvas.getBoundingClientRect();
      const parentRect = canvas.parentElement?.getBoundingClientRect() ?? canvasRect;
      const offsetX = parentRect.left - canvasRect.left;
      const offsetY = parentRect.top - canvasRect.top;
      for (const sprite of spritesRef.current) {
        let image = imagesRef.current.get(sprite.source);
        if (!image) {
          image = new Image();
          image.onload = paint;
          image.src = sprite.source;
          imagesRef.current.set(sprite.source, image);
        }
        renderer.sprite(image, sprite.x + offsetX - sprite.width / 2, sprite.y + offsetY - sprite.height / 2,
          sprite.width, sprite.height, sprite.opacity ?? 1, sprite.rotation ?? 0, sprite.uv, sprite.additive);
      }
    };
    const observer = new ResizeObserver(paint);
    observer.observe(canvas);
    canvas.addEventListener("webglcontextlost", onContextLost);
    function onContextLost(event: Event) {
      event.preventDefault();
      setUnavailable(true);
    }
    paint();
    return () => {
      disposed = true;
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", onContextLost);
      for (const image of imagesRef.current.values()) image.onload = null;
      imagesRef.current.clear();
      if (!renderer.gl.isContextLost()) renderer.dispose();
      rendererRef.current = null;
    };
  }, [unavailable]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || unavailable || renderer.gl.isContextLost()) return;
    renderer.resize();
    renderer.clear();
    const canvas = renderer.canvas;
    const canvasRect = canvas.getBoundingClientRect();
    const parentRect = canvas.parentElement?.getBoundingClientRect() ?? canvasRect;
    const offsetX = parentRect.left - canvasRect.left;
    const offsetY = parentRect.top - canvasRect.top;
    for (const sprite of sprites) {
      let image = imagesRef.current.get(sprite.source);
      if (!image) {
        image = new Image();
        image.src = sprite.source;
        imagesRef.current.set(sprite.source, image);
        image.onload = () => {
          const current = rendererRef.current;
          if (!current || current.gl.isContextLost()) return;
          current.clear();
          const refreshedCanvasRect = canvas.getBoundingClientRect();
          const refreshedParentRect = canvas.parentElement?.getBoundingClientRect() ?? refreshedCanvasRect;
          for (const item of spritesRef.current) {
            const loaded = imagesRef.current.get(item.source);
            if (loaded) current.sprite(loaded, item.x + refreshedParentRect.left - refreshedCanvasRect.left - item.width / 2,
              item.y + refreshedParentRect.top - refreshedCanvasRect.top - item.height / 2,
              item.width, item.height, item.opacity ?? 1, item.rotation ?? 0, item.uv, item.additive);
          }
        };
      }
      renderer.sprite(image, sprite.x + offsetX - sprite.width / 2, sprite.y + offsetY - sprite.height / 2,
        sprite.width, sprite.height, sprite.opacity ?? 1, sprite.rotation ?? 0, sprite.uv, sprite.additive);
    }
  }, [sprites, unavailable]);

  return unavailable ? <>{fallback}</> : <canvas ref={canvasRef} className="webgl-vfx-layer" aria-hidden="true" />;
}
