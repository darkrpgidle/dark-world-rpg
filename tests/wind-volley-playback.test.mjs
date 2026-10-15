import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../app/ranger-wind-volley-vfx.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React, jsxFactory: "jsx",
} }).outputText.replace(/import\s*\{([^}]+)\}\s*from\s*"[^"]+";/g,
  (_, names) => `const {${names}} = globalThis.__piercingFixture;`);
let id = 0;
async function playback({ fallback = false, reduced = false, hit = true, sixth = false, mobile = false } = {}) {
  const keys = ["window", "Image", "ResizeObserver", "requestAnimationFrame", "cancelAnimationFrame", "__piercingFixture"];
  const originals = new Map(keys.map((key) => [key, globalThis[key]]));
  const frames = new Map(), timers = new Map(), effects = [], cleanups = [], images = [], draws = [], shakes = [];
  const impacts = [], completed = [];
  let serial = 0, now = 0, resize;
  const width = mobile ? 360 : 972, height = mobile ? 280 : 390;
  const context = { save() {}, restore() {}, translate() {}, rotate() {}, setTransform() {}, clearRect() {}, drawImage(...args) { draws.push(args); } };
  const stage = {
    querySelector(selector) { const player = selector.includes("player");
      return { animate(_frames, options) { shakes.push({...options,keyframes:_frames,target:selector}); return { cancel() {} }; }, getBoundingClientRect: () => ({ left: width * (player ? .12 : .68), top: 10,
        bottom: height * .8, width: width * .18, height: height * .7 }) }; },
    animate(_frames, options) { shakes.push({...options,keyframes:_frames,target:"stage"}); return { cancel() {} }; },
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
  globalThis.__piercingFixture = {
    useRef: (current) => ({ current }), useState: () => [fallback, () => {}], useEffect: (effect) => effects.push(effect),
    WebGLVfxRenderer: class { gl = { isContextLost: () => false }; resize() {} clear() {} dispose() {}
      sprite(...args) { draws.push(args); } },
    jsx(_type, props) { props.ref.current = canvas; return props; },
  };
  const component = await import(`data:text/javascript;base64,${Buffer.from('const {jsx} = globalThis.__piercingFixture;\n' + compiled + `\n// fixture ${++id}`).toString("base64")}`);
  component.RangerWindVolleyVfx({ arrows: [...Array.from({length:5}, () => ({hit,critical:false,sixth:false})), ...(sixth ? [{hit:true,critical:true,sixth:true}] : [])], effectKey: 42,
    onImpact: (_key,index) => impacts.push([index,now]), onComplete: () => completed.push(now) });
  for (const effect of effects) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); }
  return { impacts, completed, draws, shakes, width, height,
    load() { for (const image of images) { image.complete = true; image.onload(); } },
    fail() { images.at(-1).onerror(); }, resize: () => resize(), pending: () => frames.size,
    step(time) { now = time; const pending = [...frames.values()]; frames.clear(); for (const fn of pending) fn(time); },
    cleanup() { cleanups.forEach((fn) => fn()); for (const [key, value] of originals) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    } },
  };
}


for (const fallback of [false,true]) test(`${fallback ? "Canvas" : "WebGL"} volley starts after loading and synchronizes five rapid hits`, async () => {
 const p=await playback({fallback}); try {
 p.step(2000); assert.deepEqual(p.impacts,[]); p.load(); p.step(3000);
 for(let i=0;i<5;i++) { p.step(3000+190+i*70); assert.deepEqual(p.impacts.at(-1),[i,3190+i*70]); }
 assert.equal(p.shakes.length,5); p.resize();p.resize();assert.equal(p.pending(),1);
 p.step(3710);assert.deepEqual(p.completed,[3710]);assert.equal(p.pending(),0);
 } finally {p.cleanup();}
});
test("sixth arrow uses its own atlas and immediately follows the five primary arrows",async()=>{
 const p=await playback({sixth:true});try{p.load();p.step(1000);p.step(1470);p.step(1540);
 assert.deepEqual(p.impacts.map(x=>x[0]),[0,1,2,3,4,5]);assert.equal(p.impacts.at(-1)[1],1540);
 assert.ok(p.draws.some(x=>x[0].src.endsWith("sixth.webp")));
 assert.equal(p.shakes.filter(x=>x.target==="stage").length,1);
 assert.ok(p.shakes.filter(x=>x.target!=="stage").some(x=>x.keyframes[1].filter==="brightness(1.7)"));
 assert.ok(p.shakes.filter(x=>x.target!=="stage"&&!x.keyframes[1].filter.includes("1.7")).every(x=>x.duration===60));p.step(1780);assert.equal(p.completed.length,1);
 }finally{p.cleanup();}
});
test("misses do not shake or select painted impact cells",async()=>{
 const p=await playback({hit:false});try{p.load();p.step(1000);p.step(1300);p.step(1470);
 assert.equal(p.shakes.length,0);for(const draw of p.draws)assert.equal(draw[7][1],1/1024);
 p.step(1710);assert.equal(p.impacts.length,5);
 }finally{p.cleanup();}
});
test("reduced motion settles all arrows once without shaking",async()=>{
 const p=await playback({reduced:true,sixth:true});try{p.load();p.step(1000);assert.equal(p.impacts.length,6);
 assert.equal(p.shakes.length,0);p.step(1240);assert.equal(p.completed.length,1);
 }finally{p.cleanup();}
});
test("failed atlas releases every already settled arrow exactly once",async()=>{
 const p=await playback({sixth:true});try{p.fail();p.fail();assert.equal(p.impacts.length,6);assert.equal(p.completed.length,1);}
 finally{p.cleanup();}
});
test("upward target progression and rotated projectile drawing work on mobile",async()=>{
 const p=await playback({mobile:true});try{p.load();p.step(1000);for(let i=0;i<5;i++)p.step(1190+i*70);
 const angles=p.draws.map(x=>x[8]);assert.ok(angles.some(x=>x>0));assert.ok(angles.some(x=>x<0));
 assert.ok(p.draws.every(x=>x[3]<=p.width*.4));
 }finally{p.cleanup();}
});
