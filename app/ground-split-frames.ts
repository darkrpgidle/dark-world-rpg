// The generated main atlas is not a uniform 4×3 grid vertically.
// These measured rectangles exclude the preceding row's debris and glow.
const MAIN_RECTS = [
  [2, 2, 414, 344], [420, 2, 414, 344], [838, 2, 414, 322], [1256, 2, 414, 344],
  [2, 468, 414, 182], [420, 446, 414, 204], [838, 348, 414, 304], [1256, 374, 414, 278],
  [2, 666, 414, 272], [420, 740, 414, 198], [838, 782, 414, 156], [1256, 808, 414, 130],
] as const;

// Original atlas ground-line pixels; cropping must not move this line.
const MAIN_GROUND_Y = [319, 320, 323, 320, 620, 623, 623, 625, 895, 895, 898, 897] as const;

export function groundSplitRect(kind: "main" | "shock", frame: number, width: number, height: number) {
  if (kind === "main") {
    const index = Math.max(0, Math.min(11, Math.floor(frame)));
    const rect = MAIN_RECTS[index];
    return { x: rect[0] * width / 1672, y: rect[1] * height / 940,
      width: rect[2] * width / 1672, height: rect[3] * height / 940,
      groundAnchor: (MAIN_GROUND_Y[index] - rect[1]) / rect[3] };
  }
  const index = Math.max(0, Math.min(5, Math.floor(frame)));
  const x = Math.floor(index % 3 * width / 3) + 1;
  const y = Math.floor(Math.floor(index / 3) * height / 2) + 1;
  return { x, y, width: Math.floor((index % 3 + 1) * width / 3) - x - 1,
    height: Math.floor((Math.floor(index / 3) + 1) * height / 2) - y - 1, groundAnchor: .77 };
}
