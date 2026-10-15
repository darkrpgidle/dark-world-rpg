import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../app/ranger-tailwind-arrow-vfx.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React, jsxFactory: "jsx",
} }).outputText.replace(/import\s*\{([^}]+)\}\s*from\s*"[^"]+";/g,
  (_, names) => `const {${names}} = globalThis.__tailwindFixture;`);
let id = 0;
async function playback({ fallback = false, reduced = false, hit = true, kind = "main", mobile = false } = {}) {
  const keys = ["window", "Image", "ResizeObserver", "requestAnimationFrame", "cancelAnimationFrame", "__tailwindFixture"];
  const originals = new Map(keys.map((key) => [key, globalThis[key]]));
  const frames = new Map(), timers = new Map(), effects = [], cleanups = [], images = [], draws = [], shakes = [];
  const impacts = [], completed = [];
  let serial = 0, now = 0, resize;
  const width = mobile ? 360 : 972, height = mobile ? 280 : 390;
  let transform = { x: 0, y: 0, rotation: 0 }, stack = [];
  const context = { globalAlpha: 1, setTransform() { transform = { x: 0, y: 0, rotation: 0 }; }, clearRect() {},
    save() { stack.push({ ...transform, alpha: this.globalAlpha }); },
    restore() { const prior = stack.pop(); transform = prior; this.globalAlpha = prior.alpha; },
    translate(x, y) { transform.x += x; transform.y += y; }, rotate(angle) { transform.rotation += angle; },
    drawImage(...args) {
      args[5] += transform.x; args[6] += transform.y;
      args.opacity = this.globalAlpha; args.rotation = transform.rotation; draws.push(args);
    } };
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
    this.naturalWidth = 1448; this.naturalHeight = 1086; }
    set src(value) { this.url = value; if (value.includes("charge")) { this.naturalWidth = 1536; this.naturalHeight = 1024; } }
  };
  globalThis.ResizeObserver = class { constructor(fn) { resize = fn; } observe() {} disconnect() {} };
  globalThis.requestAnimationFrame = (fn) => { const frame = ++serial; frames.set(frame, fn); return frame; };
  globalThis.cancelAnimationFrame = (frame) => frames.delete(frame);
  globalThis.__tailwindFixture = {
    useRef: (current) => ({ current }), useState: () => [fallback, () => {}], useEffect: (effect) => effects.push(effect),
    WebGLVfxRenderer: class { gl = { isContextLost: () => false }; resize() {} clear() {} dispose() {}
      sprite(...args) { args.opacity = args[5]; args.rotation = args[8]; draws.push(args); } },
    jsx(_type, props) { props.ref.current = canvas; return props; },
  };
  const component = await import(`data:text/javascript;base64,${Buffer.from('const {jsx} = globalThis.__tailwindFixture;\n' + compiled + `\n// fixture ${++id}`).toString("base64")}`);
  component.RangerTailwindArrowVfx({ kind, hit, effectKey: 42,
    onImpact: () => impacts.push(now), onComplete: () => completed.push(now) });
  for (const effect of effects) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); }
  const frameOf = draw => {
    const columns = kind === "charge" ? 2 : 4, rows = kind === "charge" ? 2 : 3;
    return fallback ? Math.floor(draw[1] / (draw[0].naturalWidth / columns)) + columns * Math.floor(draw[2] / (draw[0].naturalHeight / rows))
      : Math.floor(draw[7][0] * columns) + columns * Math.floor(draw[7][1] * rows);
  };
  return { impacts, completed, draws, shakes, width, height, frameOf, timers,
    load() { const image = images.at(-1); image.complete = true; image.onload(); },
    fail() { images.at(-1).onerror(); }, resize: () => resize(), pending: () => frames.size,
    step(time) { now = time; const pending = [...frames.values()]; frames.clear(); for (const fn of pending) fn(time); },
    cleanup() { cleanups.forEach((fn) => fn()); for (const [key, value] of originals) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    } },
  };
}

for (const fallback of [false, true]) for (const kind of ["main", "echo", "charge"]) {
  test(`${fallback ? "Canvas" : "WebGL"} ${kind} synchronizes impact after slow load and cleans the loop`, async () => {
    const p = await playback({ fallback, kind });
    try {
      const impactAt = kind === "main" ? 270 : kind === "echo" ? 170 : 150;
      const duration = kind === "main" ? 850 : kind === "echo" ? 750 : 320;
      p.step(2000); assert.deepEqual(p.impacts, []);
      p.load(); p.step(3000); p.step(3000 + impactAt - 1); assert.deepEqual(p.impacts, []);
      p.step(3000 + impactAt); p.resize(); p.resize(); assert.equal(p.pending(), 1);
      assert.deepEqual(p.impacts, [3000 + impactAt]); assert.equal(p.shakes.length, 0);
      p.step(3000 + duration); assert.deepEqual(p.completed, [3000 + duration]); assert.equal(p.pending(), 0);
    } finally { p.cleanup(); }
  });
}
test("missed arrow flies past the enemy without impact sprites or shaking", async () => {
  const p = await playback({ hit: false });
  try { p.load(); p.step(1000); p.step(1200); p.step(1270); p.step(1500); p.step(1850);
    assert.deepEqual(p.shakes, []); assert.deepEqual(p.completed, [1850]);
    assert.ok(p.draws.length > 3);
    assert.ok(p.draws.every(draw => p.frameOf(draw) < 4), "miss must never draw a split armor frame");
  } finally { p.cleanup(); }
});
test("reduced motion shows a static impact without shaking and still completes", async () => {
  const p = await playback({ reduced: true });
  try { p.load(); p.step(1000); p.step(1240);
    assert.deepEqual(p.impacts, [1000]); assert.deepEqual(p.shakes, []); assert.deepEqual(p.completed, [1240]);
  } finally { p.cleanup(); }
});
test("failed sprite publishes already settled damage once and releases its visual", async () => {
  const p = await playback();
  try { p.fail(); p.fail(); assert.equal(p.impacts.length, 1); assert.equal(p.completed.length, 1); }
  finally { p.cleanup(); }
});
test("mobile Canvas arrow fits the battle area and preserves source aspect ratio", async () => {
  const p = await playback({ fallback: true, mobile: true });
  try { p.load(); p.step(1000); p.step(1270);
    const [, , , sw, sh, x, y, w, h] = p.draws.at(-1);
    assert.ok(x >= 0 && y >= 0 && x + w <= p.width && y + h <= p.height);
    assert.ok(Math.abs(w / h - sw / sh) < .0001);
  } finally { p.cleanup(); }
});

for (const fallback of [false, true]) test(`${fallback ? "Canvas" : "WebGL"} arrow travels continuously from player to enemy`, async () => {
  const p = await playback({ fallback });
  try {
    p.load(); p.step(1000); p.step(1135); p.step(1250);
    const positions = p.draws.filter(draw => p.frameOf(draw) < 2 && draw.opacity === 1).map(draw => fallback ? draw[5] : draw[1]);
    assert.ok(positions[0] < positions[1] && positions[1] < positions[2]);
    p.step(1270); assert.deepEqual(p.impacts, [1270]);
  } finally { p.cleanup(); }
});

test("charge recovery sprite stays beside the player rather than traveling to the monster", async () => {
  const p = await playback({ fallback: true, kind: "charge" });
  try {
    p.load(); p.step(1000); p.step(1080); p.step(1150);
    const positions = p.draws.map((draw) => draw[5]);
    assert.ok(positions.every((x) => x === positions[0]));
    assert.ok(positions[0] < p.width * .4);
  } finally { p.cleanup(); }
});


for (const fallback of [false, true]) test(`${fallback ? "Canvas" : "WebGL"} wind spirals follow the arrow and vanish at contact`, async () => {
  const p = await playback({ fallback });
  try {
    p.load(); p.step(1000); p.step(1100);
    const first = p.draws.filter(draw => [2, 3].includes(p.frameOf(draw))).at(-1);
    const offset = p.draws.length; p.step(1200);
    const next = p.draws.slice(offset).find(draw => [2, 3].includes(p.frameOf(draw)));
    assert.ok(next[fallback ? 5 : 1] > first[fallback ? 5 : 1], "spiral moves with arrow");
    assert.notEqual(next.rotation, first.rotation);
    const contact = p.draws.length; p.step(1270);
    assert.ok(p.draws.slice(contact).every(draw => p.frameOf(draw) >= 4), "wind bursts replace all flight layers");
  } finally { p.cleanup(); }
});
for (const fallback of [false, true]) test(`${fallback ? "Canvas" : "WebGL"} windburst stays at the enemy while eight frames dissipate`, async () => {
  const p = await playback({ fallback });
  try {
    p.load(); p.step(1000);
    for (let frame = 0; frame < 8; frame++) p.step(1270 + frame * 60);
    const burst = p.draws.filter(draw => p.frameOf(draw) >= 4);
    assert.deepEqual(burst.map(p.frameOf), [4, 5, 6, 7, 8, 9, 10, 11]);
    assert.ok(burst.every(draw => draw[fallback ? 5 : 1] === burst[0][fallback ? 5 : 1]));
    assert.ok(burst.every(draw => draw[0].url.includes("/tailwind-arrow-v3/")));
    assert.deepEqual(p.impacts, [1270]);
  } finally { p.cleanup(); }
});
test("stalled RAF watchdog releases settled damage exactly once", async () => {
  const p = await playback();
  try { p.load(); p.step(1000); const watchdog = [...p.timers.values()][0]; watchdog(); watchdog();
    assert.equal(p.impacts.length, 1); assert.equal(p.completed.length, 1);
  } finally { p.cleanup(); }
});


test("ascended wind arrow uses its own atlas and preserves independent contact", async () => {
  const p = await playback({ kind: "echo" });
  try {
    p.load(); p.step(1000); p.step(1170);
    const armor = p.draws.filter(draw => p.frameOf(draw) >= 4);
    assert.equal(armor.length, 1); assert.equal(p.frameOf(armor[0]), 4);
    assert.ok(armor[0][0].url.endsWith("/ascended.webp"));
    assert.deepEqual(p.impacts, [1170]);
  } finally { p.cleanup(); }
});
