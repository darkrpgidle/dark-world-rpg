import { TITAN_RIFT_FRAME_STARTS_MS, TITAN_RIFT_IMPACT_MS } from "./titan-rift-timing";

export type TitanImpactCue = { at: number; strength: number; duration: number };

// Frame 12 winds into the strike; frame 15 owns the sustained full-stage impact.
const CUES: readonly TitanImpactCue[] = [
  { at: TITAN_RIFT_FRAME_STARTS_MS[11], strength: 0.35, duration: 135 },
  { at: TITAN_RIFT_IMPACT_MS, strength: 1, duration: 450 },
  { at: TITAN_RIFT_FRAME_STARTS_MS[19], strength: 0.38, duration: 120 },
];

export function titanImpactCue(previousElapsed: number, elapsed: number, hit: boolean, reducedMotion: boolean) {
  if (!hit || reducedMotion) return null;
  const cue = CUES.findLast((value) => value.at > previousElapsed && value.at <= elapsed);
  // A suspended tab must not replay a backlog of old impacts when it returns.
  return cue && elapsed - cue.at <= 120 ? cue : null;
}
