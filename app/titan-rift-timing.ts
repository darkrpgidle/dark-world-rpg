// Frames 12–16 whip through the swing; anticipation and dissipation stay readable.
export const TITAN_RIFT_FRAME_DURATIONS_MS = [
  120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120,
  45, 45, 45, 45, 45,
  120, 120, 120, 120,
] as const;
export const TITAN_RIFT_FRAME_STARTS_MS = TITAN_RIFT_FRAME_DURATIONS_MS.map((_, index) =>
  TITAN_RIFT_FRAME_DURATIONS_MS.slice(0, index).reduce<number>((total, duration) => total + duration, 0));
export const TITAN_RIFT_DURATION_MS = TITAN_RIFT_FRAME_DURATIONS_MS.reduce<number>((total, duration) => total + duration, 0);
export const TITAN_RIFT_IMPACT_MS = TITAN_RIFT_FRAME_STARTS_MS[14];

export function titanRiftFrameAt(elapsed: number): number {
  return Math.max(0, TITAN_RIFT_FRAME_STARTS_MS.findLastIndex((start) => elapsed >= start));
}
