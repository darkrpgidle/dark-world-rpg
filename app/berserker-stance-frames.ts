export const STANCE_ATTACK_MS = 620;
export const STANCE_FADE_MS = 360;
export const STANCE_WOUND_START_MS = 280;
export const STANCE_WOUND_MS = 340;
export const ASCENDED_STANCE_ART = {
  state: "/vfx/berserker-stance-v3/ascended-state.webp",
  attack: ["/vfx/berserker-stance-v3/ascended-attack-1.webp", "/vfx/berserker-stance-v3/ascended-attack-2.webp"],
  slash: "/vfx/berserker-stance-v3/ascended-slash.webp",
  wound: "/vfx/berserker-stance-v3/ascended-wound.webp",
} as const;
export function ascendedStanceFrame(elapsed: number, phase: "activation" | "idle" | "pulse" | "attack" | "fade", reduced = false) {
  if (reduced) return phase === "attack" ? 3 : 0;
  if (phase === "attack") return Math.min(7, Math.floor(Math.max(0, elapsed) / (STANCE_ATTACK_MS / 8)));
  if (phase === "activation") return Math.min(1, Math.floor(Math.max(0, elapsed) / 250));
  if (phase === "pulse") return 2;
  if (phase === "fade") return 3;
  return Math.floor(Math.max(0, elapsed) / 240) % 4;
}
export function stanceHdUv(frame: number): [number, number, number, number] {
  const i = frame % 4;
  return [(i % 2 * 512 + 2) / 1024, (Math.floor(i / 2) * 512 + 2) / 1024, 508 / 1024, 508 / 1024];
}
export function stanceSpecterBox(player: { left: number; top: number; width: number; height: number }) {
  const size = player.height * 2.0;
  return { x: player.left + player.width * .32 - size / 2, y: player.top + player.height * .08 - size / 2, size };
}
export function stanceSlashPath(player: { left: number; top: number; width: number; height: number },
  enemy: { left: number; top: number; width: number; height: number }) {
  const start = { x: player.left + player.width * .8, y: player.top + player.height * .45 };
  const end = { x: enemy.left + enemy.width * .52, y: enemy.top + enemy.height * .56 };
  return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2,
    width: Math.hypot(end.x - start.x, end.y - start.y) * 1.3,
    height: Math.min(player.height, enemy.height) * .72, angle: Math.atan2(end.y - start.y, end.x - start.x) };
}
export function stanceFrame(elapsed: number, phase: "activation" | "idle" | "pulse" | "attack" | "fade", reduced = false) {
  if (reduced) return phase === "attack" ? 3 : phase === "fade" ? 5 : 2;
  if (phase === "attack") return Math.min(5, Math.floor(Math.max(0, elapsed) / (STANCE_ATTACK_MS / 6)));
  if (phase === "activation") return Math.min(1, Math.floor(Math.max(0, elapsed) / 250));
  if (phase === "pulse") return 4;
  if (phase === "fade") return 5;
  return 2 + Math.floor(Math.max(0, elapsed) / 180) % 2;
}
export function stanceUv(frame: number): [number, number, number, number] {
  return [(frame % 3 + 0.002) / 3, (Math.floor(frame / 3) + 0.002) / 2, 0.996 / 3, 0.996 / 2];
}
