import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith("./") && !specifier.endsWith(".ts") ? `${specifier}.ts` : specifier, context);
} });
const { titanImpactCue } = await import("../app/titan-rift-impact.ts");
const { TITAN_RIFT_DURATION_MS, TITAN_RIFT_FRAME_STARTS_MS, TITAN_RIFT_IMPACT_MS, titanRiftFrameAt } = await import("../app/titan-rift-timing.ts");

test("frames 12–16 accelerate while all twenty atlas frames remain visible", () => {
  const observed = new Set();
  for (let elapsed = 0; elapsed < TITAN_RIFT_DURATION_MS; elapsed += 1000 / 60) observed.add(titanRiftFrameAt(elapsed));
  assert.equal(observed.size, 20);
  assert.equal(TITAN_RIFT_FRAME_STARTS_MS[16] - TITAN_RIFT_FRAME_STARTS_MS[11], 225);
  assert.equal(TITAN_RIFT_DURATION_MS, 2025);
  assert.equal(titanRiftFrameAt(TITAN_RIFT_IMPACT_MS - 1), 13);
  assert.equal(titanRiftFrameAt(TITAN_RIFT_IMPACT_MS), 14);
  assert.equal(titanRiftFrameAt(TITAN_RIFT_FRAME_STARTS_MS[15]), 15);
});

test("the strongest sustained shake starts with frame 15 and the damage cue", () => {
  const cues = [];
  let previous = -1;
  for (let elapsed = 0; elapsed < TITAN_RIFT_DURATION_MS; elapsed += 1000 / 60) {
    const cue = titanImpactCue(previous, elapsed, true, false);
    if (cue) cues.push(cue);
    previous = elapsed;
  }
  assert.equal(cues.length, 3);
  assert.deepEqual(cues.map((cue) => titanRiftFrameAt(cue.at)), [11, 14, 19]);
  assert.equal(cues[1].at, TITAN_RIFT_IMPACT_MS);
  assert.ok(cues[1].strength > cues[0].strength && cues[1].strength > cues[2].strength);
  assert.ok(cues[1].duration >= 400);
});

test("misses, reduced motion, duplicate frames and stale tab-resume cues do not shake", () => {
  assert.equal(titanImpactCue(1450, 1460, false, false), null);
  assert.equal(titanImpactCue(1450, 1460, true, true), null);
  assert.equal(titanImpactCue(0, 2200, true, false), null);
  assert.equal(titanImpactCue(1460, 1470, true, false), null);
  assert.equal(titanImpactCue(0, 1460, true, false)?.at, TITAN_RIFT_IMPACT_MS);
});
