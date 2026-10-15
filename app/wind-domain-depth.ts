export type FloorRect = { x: number; y: number; width: number; height: number };
// Keep the rear arc behind the opaque portrait panel, and the front arc below
// its feet. Clip source UVs as well as destinations so the ring never stretches
// across the hidden part. Both renderers use exactly these same pieces.
export function windDomainVisiblePieces(sprite: FloorRect, portrait: FloorRect | null): FloorRect[] {
  if (!portrait) return [sprite];
  const left = Math.max(sprite.x, portrait.x), top = Math.max(sprite.y, portrait.y);
  const right = Math.min(sprite.x + sprite.width, portrait.x + portrait.width);
  const bottom = Math.min(sprite.y + sprite.height, portrait.y + portrait.height);
  if (right <= left || bottom <= top) return [sprite];
  return [
    { x: sprite.x, y: sprite.y, width: sprite.width, height: top - sprite.y },
    { x: sprite.x, y: bottom, width: sprite.width, height: sprite.y + sprite.height - bottom },
    { x: sprite.x, y: top, width: left - sprite.x, height: bottom - top },
    { x: right, y: top, width: sprite.x + sprite.width - right, height: bottom - top },
  ].filter((part) => part.width > 0 && part.height > 0);
}
