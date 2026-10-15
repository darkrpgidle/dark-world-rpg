import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../app/ranger-hunter-mark-vfx.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React, jsxFactory: "jsx",
} }).outputText.replace(/import\s*\{([^}]+)\}\s*from\s*"[^"]+";/g,
  (_, names) => `const {${names}} = globalThis.__hunterFixture;`);
let id = 0;
async function playback({ fallback = false, reduced = false, hit = true, pending = false, mobile = false } = {}) {
  const keys = ["window", "Image", "ResizeObserver", "requestAnimationFrame", "cancelAnimationFrame", "__hunterFixture"];
  const originals = new Map(keys.map((key) => [key, globalThis[key]]));
  const frames = new Map(), timers = new Map(), effects = [], cleanups = [], images = [], draws = [], shakes = [];
  const impacts = [], completed = [], expired = [], lights = [];
  const dateNow = Date.now; Date.now = () => now;
  let serial = 0, now = 0, resize;
  const width = mobile ? 360 : 972, height = mobile ? 280 : 390;
  let transform = { x: 0, y: 0, rotation: 0 }, stack = [];
  const context = { setTransform() { transform = { x: 0, y: 0, rotation: 0 }; }, clearRect() {},
    save() { stack.push({ ...transform }); }, restore() { transform = stack.pop(); },
    translate(x, y) { transform.x += x; transform.y += y; }, rotate(r) { transform.rotation += r; },
    drawImage(...args) { args[5] += transform.x; args[6] += transform.y; args.rotation = transform.rotation; draws.push(args); } };
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
    this.naturalWidth = 1536; this.naturalHeight = 1536; } };
  globalThis.ResizeObserver = class { constructor(fn) { resize = fn; } observe() {} disconnect() {} };
  globalThis.requestAnimationFrame = (fn) => { const frame = ++serial; frames.set(frame, fn); return frame; };
  globalThis.cancelAnimationFrame = (frame) => frames.delete(frame);
  globalThis.__hunterFixture = {
    useRef: (current) => ({ current }), useState: () => [fallback, () => {}], useEffect: (effect) => effects.push(effect),
    WebGLVfxRenderer: class { gl = { isContextLost: () => false }; resize() {} clear() {} dispose() {}
      sprite(...args) { args.rotation = args[8]; draws.push(args); } ring(...args) { lights.push(args); } glow(...args) { lights.push(args); } },
    jsx(_type, props) { props.ref.current = canvas; return props; },
  };
  const component = await import(`data:text/javascript;base64,${Buffer.from('const {jsx} = globalThis.__hunterFixture;\n' + compiled + `\n// fixture ${++id}`).toString("base64")}`);
  const mark = { castKey: 1, pulseKey: 0, expiresAt: 8000, criticals: pending ? 3 : 1,
    pending, ascended: true, activated: true, criticalHit: false };
  const bursts = [{ key: 42, hit }];
  component.RangerHunterMarkVfx({ mark, bursts, onImpact: (key) => impacts.push({ key, now }),
    onComplete: (key) => completed.push({ key, now }), onExpire: (key) => expired.push(key) });
  for (const effect of effects) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); }
  const frameOf = d => fallback ? Math.floor(d[1] / (d[0].naturalWidth / 4)) + 4 * Math.floor(d[2] / (d[0].naturalHeight / 4))
    : Math.floor(d[7][0] * 4) + 4 * Math.floor(d[7][1] * 4);
  return { frameOf, impacts, completed, expired, draws, shakes, width, height, images, mark, bursts, lights,
    load() { for (const image of images) { image.complete = true; image.onload(); } },
    fail() { images.at(-1).onerror(); }, resize: () => resize(), pending: () => frames.size,
    step(time) { now = time; const pending = [...frames.values()]; frames.clear(); for (const fn of pending) fn(time); },
    cleanup() { Date.now = dateNow; cleanups.forEach((fn) => fn()); for (const [key, value] of originals) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    } },
  };
}

for (const fallback of [false, true]) test(`${fallback ? "Canvas" : "WebGL"} hunter burst synchronizes actual impact after delayed image load`, async () => {
  const p = await playback({ fallback });
  try {
    p.step(1000); p.step(2000); assert.deepEqual(p.impacts, []);
    p.load(); p.step(3000); p.step(3199); assert.deepEqual(p.impacts, []);
    p.step(3200); p.resize(); p.resize(); assert.equal(p.pending(), 1);
    assert.deepEqual(p.impacts, [{ key: 42, now: 3200 }]);
    p.step(3650); p.step(3700);
    assert.deepEqual(p.completed, [{ key: 42, now: 3650 }]);
    assert.equal(p.shakes.length, 0);
  } finally { p.cleanup(); }
});
for (const fallback of [false, true]) test(`${fallback ? "Canvas" : "WebGL"} missed explosion never displays the hit burst frames`, async () => {
  const p = await playback({ fallback, hit: false });
  try {
    p.load(); p.step(1000); p.step(1250); p.step(1450);
    const burstDraws = p.draws.filter((d) => d[0] === p.images[1]);
    assert.ok(burstDraws.length > 0);
    for (const d of burstDraws) assert.ok(p.frameOf(d) === 8 || p.frameOf(d) === 9);
    assert.equal(p.shakes.length, 0);
  } finally { p.cleanup(); }
});
test("expired mark releases its cast key once; ready explosion retains three glyphs past expiry", async () => {
  const p = await playback();
  try {
    p.load(); p.step(1000); p.step(8001); p.step(8100);
    assert.deepEqual(p.expired, [1]);
  } finally { p.cleanup(); }
  const ready = await playback({ pending: true });
  try { ready.load(); ready.step(1000); ready.step(9000); assert.deepEqual(ready.expired, []); }
  finally { ready.cleanup(); }
});
test("concurrent burst keys keep independent impact and completion callbacks", async () => {
  const p = await playback();
  try {
    p.load(); p.step(1000); p.bursts.push({ key: 43, hit: true }); p.step(1100);
    p.step(1200); p.step(1300); p.step(1650); p.step(1750);
    assert.deepEqual(p.impacts.map((i) => i.key), [42, 43]);
    assert.deepEqual(p.completed.map((i) => i.key), [42, 43]);
  } finally { p.cleanup(); }
});
test("failed burst image still publishes settled number and completes once", async () => {
  const p = await playback();
  try { p.fail(); p.step(1000); p.step(1200); p.step(1650); p.step(1800);
    assert.equal(p.impacts.length, 1); assert.equal(p.completed.length, 1); }
  finally { p.cleanup(); }
});
test("reduced motion shows static mark and burst and expires without continuous RAF", async () => {
  const p = await playback({ reduced: true });
  try {
    p.load(); p.step(1000); p.step(1240); p.step(1300);
    assert.deepEqual(p.impacts, [{ key: 42, now: 1000 }]);
    assert.equal(p.pending(), 0); assert.equal(p.shakes.length, 0);
  } finally { p.cleanup(); }
});
test("mobile burst stays localized inside battle bounds", async () => {
  const p = await playback({ fallback: true, mobile: true });
  try { p.load(); p.step(1000); p.step(1200);
    for (const [, , , sw, sh, x, y, w, h] of p.draws) {
      assert.ok(x >= 0 && y >= 0 && x + w <= p.width && y + h <= p.height);
      assert.ok(Math.abs(w / h - sw / sh) < .0001);
    }
  } finally { p.cleanup(); }
});
test("cleanup cancels RAF and both image callbacks", async () => {
  const p = await playback();
  try {
    p.load(); p.step(1000); p.cleanup(); assert.equal(p.pending(), 0);
    assert.ok(p.images.every((image) => image.onload === null && image.onerror === null));
  } catch (error) { p.cleanup(); throw error; }
});


for (const fallback of [false, true]) test(`${fallback ? "Canvas" : "WebGL"} three blade glyphs orbit and real criticals light them`, async () => {
 const p = await playback({ fallback });
 try {
  p.bursts.length = 0; p.load(); p.step(1000); p.step(1500);
  const before = p.draws.slice(-3);
  assert.equal(before.filter(d => p.frameOf(d) === 5).length, 1);
  p.mark.criticals = 2; p.step(1800);
  const after = p.draws.slice(-3);
  assert.equal(after.filter(d => p.frameOf(d) === 5).length, 2);
  assert.notEqual(after[0].rotation, before[0].rotation);
  p.mark.criticals = 3; p.mark.pending = true; p.step(2100);
  const locked = p.draws.slice(-4); assert.equal(p.frameOf(locked[0]), 7);
  p.step(2400); const later = p.draws.slice(-3);
  assert.ok(later.every(d => p.frameOf(d) === 5));
  assert.deepEqual(later.map(d => d.rotation), locked.slice(-3).map(d => d.rotation));
 } finally { p.cleanup(); }
});
test("ordinary successful hit pulse shows claw feedback without adding critical stacks", async () => {
 const p = await playback();
 try { p.bursts.length = 0; p.mark.ascended = false; p.load(); p.step(1000);
  p.mark.pulseKey = 12; p.step(1300);
  assert.ok(p.draws.some(d => p.frameOf(d) === 6));
  assert.equal(p.mark.criticals, 1);
 } finally { p.cleanup(); }
});
