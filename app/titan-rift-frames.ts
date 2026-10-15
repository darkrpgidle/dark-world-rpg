// Per-cell source bounds from the remade 1334 × 1179 atlas (4 columns × 5 rows).
// Keep a one-pixel inset to prevent linear texture sampling from bleeding across frames.
export const TITAN_RIFT_FRAMES: readonly (readonly [number, number, number, number])[] = [
  [1, 1, 332, 234], [335, 1, 331, 234], [668, 1, 331, 234], [1001, 1, 332, 234],
  [1, 237, 332, 234], [335, 237, 331, 234], [668, 237, 331, 234], [1001, 237, 332, 234],
  [1, 473, 332, 233], [335, 473, 331, 233], [668, 473, 331, 233], [1001, 473, 332, 233],
  [1, 708, 332, 234], [335, 708, 331, 234], [668, 708, 331, 234], [1001, 708, 332, 234],
  [1, 944, 332, 234], [335, 944, 331, 234], [668, 944, 331, 234], [1001, 944, 332, 234],
];

// Native HD complete berserker sprites, independent normal/ascended artwork.
export const TITAN_HD_ART = {
  normal: "/vfx/titan-rift-v4/normal-spirit-v2.webp",
  ascended: "/vfx/titan-rift-v4/ascended-spirit-v2.webp",
  impact: "/vfx/titan-rift-v4/impact.webp",
  slash: "/vfx/berserker-stance-v3/ascended-slash.webp",
} as const;
export function titanGhostCell(frame: number) {
  return frame < 4 ? 0 : frame < 8 ? 1 : frame < 12 ? 2 : frame < 14 ? 3 : frame < 17 ? 4 : 5;
}
export function titanHdUv(cell: number, columns = 3, rows = 2, cellSize = 768): [number,number,number,number] {
  return [(cell % columns * cellSize + 2)/(columns*cellSize),
    (Math.floor(cell/columns)*cellSize+2)/(rows*cellSize),(cellSize-4)/(columns*cellSize),(cellSize-4)/(rows*cellSize)];
}
