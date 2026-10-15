import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

import { windDomainVisiblePieces } from "../app/wind-domain-depth.ts";

const source = readFileSync(new URL("../app/ranger-wind-domain-vfx.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React, jsxFactory: "jsx",
} }).outputText.replace(/import\s*\{([^}]+)\}\s*from\s*"[^"]+";/g,
  (_, names) => `const {${names}} = globalThis.__hunterFixture;`);
let id = 0;
async function playback({ fallback = false, reduced = false, hit = true, pending = false, mobile = false, withTitle = false } = {}) {
  const keys = ["window", "Image", "ResizeObserver", "requestAnimationFrame", "cancelAnimationFrame", "__hunterFixture"];
  const originals = new Map(keys.map((key) => [key, globalThis[key]]));
  const frames = new Map(), timers = new Map(), effects = [], cleanups = [], images = [], draws = [], shakes = [];
  const impacts = [], completed = [], expired = [], lights = [];
  const dateNow = Date.now; Date.now = () => now;
  let serial = 0, now = 0, resize;
  const width = mobile ? 360 : 972, height = mobile ? 280 : 390;
  const context = { setTransform() {}, clearRect() {}, beginPath() {}, arc() {}, stroke() {}, drawImage(...args) { draws.push(args); } };
  const stage = {
    querySelector(selector) { if(selector.includes("equipped-title")) return withTitle ? {getBoundingClientRect:()=>({left:width*.15,top:10+height*.7-24,width:width*.12,height:18})} : null; const player = selector.includes("player");
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
    this.naturalWidth = 1086; this.naturalHeight = 1448; } };
  globalThis.ResizeObserver = class { constructor(fn) { resize = fn; } observe() {} disconnect() {} };
  globalThis.requestAnimationFrame = (fn) => { const frame = ++serial; frames.set(frame, fn); return frame; };
  globalThis.cancelAnimationFrame = (frame) => frames.delete(frame);
  globalThis.__hunterFixture = { windDomainVisiblePieces,
    useRef: (current) => ({ current }), useState: () => [fallback, () => {}], useEffect: (effect) => effects.push(effect),
    WebGLVfxRenderer: class { gl = { isContextLost: () => false }; resize() {} clear() {} dispose() {}
      sprite(...args) { draws.push(args); } ring(...args) { lights.push(args); } glow(...args) { lights.push(args); } },
    jsx(_type, props) { props.ref.current = canvas; return props; },
  };
  const component = await import(`data:text/javascript;base64,${Buffer.from('const {jsx} = globalThis.__hunterFixture;\n' + compiled + `\n// fixture ${++id}`).toString("base64")}`);
  const visual = { castKey: 1, pulseKey: 0, remainingActions: 8, rank: 1, ascended: false, galeStacks: 0, ending: false };
  component.RangerWindDomainVfx({ visual, onComplete: (key) => completed.push({ key, now }) });
  for (const effect of effects) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); }
  return { impacts, completed, expired, draws, shakes, width, height, images, visual, lights,
    load() { for (const image of images) { image.complete = true; image.onload(); } },
    fail() { images.at(-1).onerror(); }, resize: () => resize(), pending: () => frames.size,
    step(time) { now = time; const pending = [...frames.values()]; frames.clear(); for (const fn of pending) fn(time); },
    cleanup() { Date.now = dateNow; cleanups.forEach((fn) => fn()); for (const [key, value] of originals) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    } },
  };
}


for (const fallback of [false,true]) test(`${fallback?"Canvas":"WebGL"} domain waits for atlas then starts activation and tracks actual ending`,async()=>{
const p=await playback({fallback});try{p.step(1000);assert.equal(p.draws.length,0);p.load();p.step(5000);p.step(5100);
const draw=p.draws.find(d=>(fallback?d[1]:d[7][0])===(fallback?1:1/1086));assert.ok(draw);
p.step(5400);p.step(8000);assert.equal(p.completed.length,0);assert.equal(p.shakes.length,0);
p.visual.ending=true;p.visual.remainingActions=0;p.step(8100);p.step(8350);assert.deepEqual(p.completed,[{key:1,now:8350}]);
assert.equal(p.pending(),0);p.resize();p.step(8400);assert.equal(p.completed.length,1);
}finally{p.cleanup();}
});
test("ascension selects pale gold row with brightness tied to actual stacks",async()=>{
const p=await playback();try{p.load();p.step(1000);p.visual.ascended=true;p.visual.galeStacks=0;p.step(1500);
let gold=p.draws.at(-1);assert.ok(gold[7][1]>=.5);const weak=gold[5];p.visual.galeStacks=5;p.step(1600);
assert.ok(p.draws.at(-1)[5]>weak);assert.equal(p.completed.length,0);
}finally{p.cleanup();}
});
test("reduced motion has one static draw and updates on actual state changes",async()=>{
const p=await playback({reduced:true});try{p.load();p.step(1000);assert.equal(p.pending(),0);assert.equal(p.shakes.length,0);
p.visual.ending=true;p.resize();p.step(1100);p.step(1350);assert.equal(p.completed.length,1);assert.equal(p.pending(),0);
}finally{p.cleanup();}
});
test("failed image never spins an active buff and still clears expired visual",async()=>{
const p=await playback();try{p.fail();p.step(1000);assert.equal(p.pending(),0);p.visual.ending=true;p.resize();p.step(2000);p.step(2250);
assert.equal(p.completed.length,1);assert.equal(p.pending(),0);
}finally{p.cleanup();}
});
test("reactivation during fade cancels completion for the previous cast",async()=>{
const p=await playback();try{p.load();p.step(1000);p.visual.ending=true;p.step(1500);
p.visual.castKey=2;p.visual.ending=false;p.visual.remainingActions=8;p.step(1600);p.step(1800);assert.equal(p.completed.length,0);
p.visual.ending=true;p.step(2000);p.step(2250);assert.deepEqual(p.completed,[{key:2,now:2250}]);
}finally{p.cleanup();}
});
test("mobile floor ring fits the stage, resize retains one animation loop",async()=>{
const p=await playback({fallback:true,mobile:true});try{p.load();p.step(1000);p.step(1500);
const [,,,,,x,y,w,h]=p.draws.at(-1);assert.ok(x>=0&&y>=0&&x+w<=p.width&&y+h<=p.height);
p.resize();p.resize();assert.equal(p.pending(),1);
}finally{p.cleanup();}
});

for (const fallback of [false,true]) for (const mobile of [false,true])
test(`${fallback?"Canvas":"WebGL"} ${mobile?"mobile":"desktop"} upright aura stays above name and health`,async()=>{
 const p=await playback({fallback,mobile});try{p.load();p.step(1000);p.step(1500);p.visual.ascended=true;p.visual.galeStacks=5;p.step(1600);
 const foot=10+p.height*.7;
 for(const d of p.draws){
  const [x,y,w,h]=fallback?d.slice(5,9):d.slice(1,5);
  assert.ok(x>=0&&y>=0&&x+w<=p.width+.001&&y+h<=p.height+.001);
  assert.ok(y+h<=foot+.001,"aura must stay above external name and health");
  assert.ok(Math.abs(w/h-1)<.001,"aura must not flatten into a floor ring");
 }
 assert.equal(p.shakes.length,0);
 }finally{p.cleanup();}
});

for(const fallback of [false,true]) test(`${fallback?"Canvas":"WebGL"} aura protects title text without cutting away the portrait`,async()=>{
 const p=await playback({fallback,withTitle:true});try{
 p.load();p.step(1000);p.step(1500);
 const title={x:p.width*.15-3,y:10+p.height*.7-27,width:p.width*.12+6,height:24};
 let upperPortrait=false;
 for(const d of p.draws){const [x,y,w,h]=fallback?d.slice(5,9):d.slice(1,5);
 const ix=Math.min(x+w,title.x+title.width)-Math.max(x,title.x);
 const iy=Math.min(y+h,title.y+title.height)-Math.max(y,title.y);
 assert.ok(ix<.001||iy<.001);
 if(y<title.y&&x<p.width*.3&&x+w>p.width*.12)upperPortrait=true;
 }
 assert.ok(upperPortrait,"streams may cross the portrait sides, keeping their curved outline");
 }finally{p.cleanup();}
});
