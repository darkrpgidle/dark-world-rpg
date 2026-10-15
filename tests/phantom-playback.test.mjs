import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../app/ranger-phantom-step-vfx.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React, jsxFactory: "jsx",
} }).outputText.replace(/import\s*\{([^}]+)\}\s*from\s*"[^"]+";/g,
  (_, names) => `const {${names}} = globalThis.__phantomFixture;`);
let id = 0;
async function playback({ fallback = false, reduced = false, burst = "dodge", active = true, cues = true, mobile = false } = {}) {
  const keys = ["window", "Image", "ResizeObserver", "requestAnimationFrame", "cancelAnimationFrame", "__phantomFixture"];
  const originals = new Map(keys.map((key) => [key, globalThis[key]]));
  const frames = new Map(), timers = new Map(), effects = [], cleanups = [], images = [], draws = [], shakes = [];
  const completed = [], lights = [];
  let serial = 0, now = 0, resize;
  const width = mobile ? 360 : 972, height = mobile ? 280 : 390;
  const context = { setTransform() {}, clearRect() {}, beginPath() {}, arc() {}, stroke() {}, drawImage(...args) { draws.push(args); } };
  const stage = {
    querySelector(selector) { const player = selector.includes("player");
      return { getBoundingClientRect: () => ({ left: width * (player ? .12 : .68), top: 10,
        bottom: height * .8, width: width * .18, height: height * .7 }) }; },
    animate(_frames, options) { shakes.push(options); return { cancel() {} }; },
  };
  const canvas = { clientWidth: width, clientHeight: height,
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }), closest: () => stage,
    getContext: () => context, addEventListener() {}, removeEventListener() {} };
  globalThis.window = { devicePixelRatio: 1, matchMedia: () => ({ matches: reduced }),
    setTimeout(fn) { const timer = ++serial; timers.set(timer, fn); return timer; }, clearTimeout(timer) { timers.delete(timer); } };
  globalThis.Image = class { constructor() { images.push(this); this.complete = false;
    this.naturalWidth = 1536; this.naturalHeight = 1024; } };
  globalThis.ResizeObserver = class { constructor(fn) { resize = fn; } observe() {} disconnect() {} };
  globalThis.requestAnimationFrame = (fn) => { const frame = ++serial; frames.set(frame, fn); return frame; };
  globalThis.cancelAnimationFrame = (frame) => frames.delete(frame);
  globalThis.__phantomFixture = {
    useRef: (current) => ({ current }), useState: () => [fallback, () => {}], useEffect: (effect) => effects.push(effect),
    WebGLVfxRenderer: class { gl = { isContextLost: () => false }; resize() {} clear() {} dispose() {}
      sprite(...args) { draws.push(args); } glow(...args) { lights.push(args); } ring(...args) { lights.push(args); } },
    jsx(_type, props) { props.ref.current = canvas; return props; },
  };
  const component = await import(`data:text/javascript;base64,${Buffer.from('const {jsx} = globalThis.__phantomFixture;\n' + compiled + `\n// fixture ${++id}`).toString("base64")}`);
  const visual = { active, ascended: true, nextHitReady: cues, nextSkillReady: cues, eventKey: 42, burst };
  component.RangerPhantomStepVfx({ visual, portraitSrc: "/characters/ranger-rebirth.webp",
    onComplete: (key) => completed.push({ key, now }) });
  for (const effect of effects) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); }
  return { completed, draws, shakes, lights, width, height, images, visual,
    load() { for (const image of images) { image.complete = true; image.onload(); } },
    fail() { for (const image of images) image.onerror(); }, resize: () => resize(), pending: () => frames.size,
    step(time) { now = time; const pending = [...frames.values()]; frames.clear(); for (const fn of pending) fn(time); },
    cleanup() { cleanups.forEach((fn) => fn()); for (const [key, value] of originals) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    } },
  };
}

for (const fallback of [false, true]) test(`${fallback ? "Canvas" : "WebGL"} phantom uses current portrait and completes confirmed burst once`, async () => {
  const p = await playback({ fallback });
  try {
    p.load(); p.step(1000); p.step(1250);
    assert.equal(p.images[0].src, "/characters/ranger-rebirth.webp");
    const ghosts = p.draws.filter((d) => d[0] === p.images[0]);
    assert.equal(ghosts.length, 80);
    assert.equal(p.shakes.length, 0);
    p.step(1550); p.step(1800);
    assert.deepEqual(p.completed, [{ key: 42, now: 1550 }]);
    // Active defense and pending crit cues stay visible after the burst.
    assert.equal(p.pending(), 1);
    p.resize(); p.resize(); assert.equal(p.pending(), 1);
    p.cleanup(); assert.equal(p.pending(), 0);
  } catch (error) { p.cleanup(); throw error; }
});
for (const fallback of [false, true]) test(`${fallback ? "Canvas" : "WebGL"} normal phantom gently deforms only duplicate portrait strips`, async () => {
  const p = await playback({ fallback, burst: null, cues: false });
  try {
    p.load(); p.step(1000); const count = p.draws.length; p.step(1060);
    const position = (d) => fallback ? d[5] : d[1];
    assert.notEqual(position(p.draws[0]), position(p.draws[count]));
    assert.equal(p.completed.length, 0); assert.equal(p.shakes.length, 0);
    assert.ok(p.draws.every((d) => d[0] === p.images[0] || d[0] === p.images[1]));
  } finally { p.cleanup(); }
});
test("guaranteed dodge shatter removes portrait fragments while ordinary dodge remains whole", async () => {
  const p = await playback({ burst: "shatter" });
  try {
    p.load(); p.step(1000); p.draws.length = 0; p.step(1300);
    const ghosts = p.draws.filter((d) => d[0] === p.images[0]);
    assert.ok(ghosts.length > 0 && ghosts.length < 40);
    assert.equal(p.shakes.length, 0);
  } finally { p.cleanup(); }
});
test("reduced motion freezes displacement and stops RAF once transient finishes", async () => {
  const p = await playback({ reduced: true });
  try {
    p.load(); p.step(1000); const count = p.draws.length; p.step(1100);
    assert.equal(p.draws[0][1], p.draws[count][1]);
    p.step(1240); assert.equal(p.pending(), 0);
    assert.deepEqual(p.completed, [{ key: 42, now: 1240 }]);
    p.resize(); assert.equal(p.pending(), 1);
  } finally { p.cleanup(); }
});
test("missing images still release the transient; no damage or shake is produced", async () => {
  const p = await playback({ active: false, cues: false });
  try {
    p.fail(); p.step(1000); p.step(1550);
    assert.deepEqual(p.completed, [{ key: 42, now: 1550 }]);
    assert.equal(p.draws.length, 0); assert.equal(p.shakes.length, 0);
  } finally { p.cleanup(); }
});
test("mobile phantom portrait strips fit within the stage and follow live frame geometry", async () => {
  const p = await playback({ fallback: true, mobile: true });
  try {
    p.load(); p.step(1000); p.step(1200);
    for (const d of p.draws.filter((d) => d[0] === p.images[0])) {
      const [, , , , , x, y, w, h] = d;
      assert.ok(x >= 0 && x + w <= p.width && y >= 0 && y + h <= p.height);
    }
  } finally { p.cleanup(); }
});
