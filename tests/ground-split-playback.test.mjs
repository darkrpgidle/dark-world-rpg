import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { groundSplitRect } from "../app/ground-split-frames.ts";

const source = readFileSync(new URL("../app/webgl-ground-split-vfx.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React, jsxFactory: "jsx",
} }).outputText.replace(/import\s*\{([^}]+)\}\s*from\s*"[^"]+";/g,
  (_, names) => `const {${names}} = globalThis.__groundFixture;`);
let id = 0;
async function playback({ fallback = false, reduced = false, hit = true, kind = "main", mobile = false } = {}) {
  const keys = ["window", "Image", "ResizeObserver", "requestAnimationFrame", "cancelAnimationFrame", "__groundFixture"];
  const originals = new Map(keys.map((key) => [key, globalThis[key]]));
  const frames = new Map(), timers = new Map(), effects = [], cleanups = [], images = [], draws = [], shakes = [];
  const impacts = [], completed = [];
  let serial = 0, now = 0, resize;
  const width = mobile ? 360 : 972, height = mobile ? 280 : 390;
  const context = { setTransform() {}, clearRect() {}, drawImage(...args) { draws.push(args); } };
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
    this.naturalWidth = kind === "main" ? 1672 : 1536; this.naturalHeight = kind === "main" ? 940 : 1024; } };
  globalThis.ResizeObserver = class { constructor(fn) { resize = fn; } observe() {} disconnect() {} };
  globalThis.requestAnimationFrame = (fn) => { const frame = ++serial; frames.set(frame, fn); return frame; };
  globalThis.cancelAnimationFrame = (frame) => frames.delete(frame);
  globalThis.__groundFixture = {
    groundSplitRect,
    useRef: (current) => ({ current }), useState: () => [fallback, () => {}], useEffect: (effect) => effects.push(effect),
    WebGLVfxRenderer: class { gl = { isContextLost: () => false }; resize() {} clear() {} dispose() {}
      sprite(...args) { draws.push(args); } },
    jsx(_type, props) { props.ref.current = canvas; return props; },
  };
  const component = await import(`data:text/javascript;base64,${Buffer.from('const {jsx} = globalThis.__groundFixture;\n' + compiled + `\n// fixture ${++id}`).toString("base64")}`);
  component.WebGLGroundSplitVfx({ kind, hit, effectKey: 42,
    onImpact: () => impacts.push(now), onComplete: () => completed.push(now) });
  for (const effect of effects) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); }
  return { impacts, completed, draws, shakes, width, height,
    load() { const image = images.at(-1); image.complete = true; image.onload(); },
    fail() { images.at(-1).onerror(); }, resize: () => resize(), pending: () => frames.size,
    step(time) { now = time; const pending = [...frames.values()]; frames.clear(); for (const fn of pending) fn(time); },
    cleanup() { cleanups.forEach((fn) => fn()); for (const [key, value] of originals) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    } },
  };
}

for (const fallback of [false, true]) for (const kind of ["main", "shock"]) {
  test(`${fallback ? "Canvas" : "WebGL"} ${kind} synchronizes impact after slow load and cleans the loop`, async () => {
    const p = await playback({ fallback, kind });
    try {
      const impactAt = kind === "main" ? 360 : 120, duration = kind === "main" ? 800 : 400;
      p.step(2000); assert.deepEqual(p.impacts, []);
      p.load(); p.step(3000); p.step(3000 + impactAt - 1); assert.deepEqual(p.impacts, []);
      p.step(3000 + impactAt); p.resize(); p.resize(); assert.equal(p.pending(), 1);
      assert.deepEqual(p.impacts, [3000 + impactAt]); assert.equal(p.shakes.length, 1);
      p.step(3000 + duration); assert.deepEqual(p.completed, [3000 + duration]); assert.equal(p.pending(), 0);
    } finally { p.cleanup(); }
  });
}
test("missed strike ends before its shield explosion and never shakes", async () => {
  const p = await playback({ hit: false });
  try { p.load(); p.step(1000); p.step(1310); p.step(1360);
    assert.deepEqual(p.shakes, []); assert.deepEqual(p.completed, [1360]);
    assert.equal(p.draws.length, 2);
  } finally { p.cleanup(); }
});
test("reduced motion shows a static impact without shaking and still completes", async () => {
  const p = await playback({ reduced: true });
  try { p.load(); p.step(1000); p.step(1280);
    assert.deepEqual(p.impacts, [1000]); assert.deepEqual(p.shakes, []); assert.deepEqual(p.completed, [1280]);
  } finally { p.cleanup(); }
});
test("failed sprite publishes already settled damage once and releases its visual", async () => {
  const p = await playback();
  try { p.fail(); p.fail(); assert.equal(p.impacts.length, 1); assert.equal(p.completed.length, 1); }
  finally { p.cleanup(); }
});
test("mobile Canvas placement fits the battle area and preserves source aspect ratio", async () => {
  const p = await playback({ fallback: true, mobile: true });
  try { p.load(); p.step(1000); p.step(1360);
    const [, , , sw, sh, x, y, w, h] = p.draws.at(-1);
    assert.ok(x >= 0 && y >= 0 && x + w <= p.width && y + h <= p.height);
    assert.ok(Math.abs(w / h - sw / sh) < .0001);
  } finally { p.cleanup(); }
});

test('late main frames exclude the previous row with identical WebGL and Canvas rectangles',async()=>{
 for(const fallback of [false,true])for(const mobile of [false,true]){
 const p=await playback({fallback,mobile});try{
 p.load();p.step(0);
 const times=[360,420,480,560,640,720];
 for(let i=0;i<times.length;i++){
 p.step(times[i]);const d=p.draws.at(-1),expected=groundSplitRect('main',i+6,1672,940);
 const actual=fallback?d.slice(1,5):[d[7][0]*1672,d[7][1]*940,d[7][2]*1672,d[7][3]*940];
 for(let j=0;j<4;j++)assert.ok(Math.abs(actual[j]-[expected.x,expected.y,expected.width,expected.height][j])<1e-8);
 assert.ok(expected.y>=(i<2?348:666));
 }
 p.step(800);assert.deepEqual(p.impacts,[360]);assert.deepEqual(p.completed,[800]);
 }finally{p.cleanup()}}
});
test('measured frames stay inside the atlas and scale with source resolution',()=>{
 for(const kind of ['main','shock'])for(let i=0;i<(kind==='main'?12:6);i++){
 const width=kind==='main'?1672:1536,height=kind==='main'?940:1024;
 const r=groundSplitRect(kind,i,width,height);assert.ok(r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=width&&r.y+r.height<=height);
 if(kind==='main'){const bigger=groundSplitRect(kind,i,width*2,height*2);for(const key of ['x','y','width','height'])assert.equal(bigger[key],r[key]*2)}
 }
});

test('the painted ground remains at one horizontal level through all late frames',async()=>{
 for(const fallback of [false,true])for(const mobile of [false,true]){
 const p=await playback({fallback,mobile});try{
 p.load();p.step(0);
 for(const [i,time]of [360,420,480,560,640,720].entries()){
 p.step(time);const d=p.draws.at(-1),r=groundSplitRect('main',i+6,1672,940);
 const y=fallback?d[6]:d[2],height=fallback?d[8]:d[4];
 assert.ok(Math.abs(y+height*r.groundAnchor-p.height*.8)<1e-8);
 }
 }finally{p.cleanup()}}
});
