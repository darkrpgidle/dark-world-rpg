import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

import * as timing from "../app/sky-queen-rain-timing.ts";
const source = readFileSync(new URL("../app/ranger-sky-queen-rain-vfx.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React, jsxFactory: "jsx",
} }).outputText.replace(/import\s*\{([^}]+)\}\s*from\s*"[^"]+";/g,
  (_, names) => `const {${names}} = globalThis.__piercingFixture;`);
let id = 0;
async function playback({ fallback = false, reduced = false, ascended = false, mobile = false, missed = [] } = {}) {
  const keys = ["window", "Image", "ResizeObserver", "requestAnimationFrame", "cancelAnimationFrame", "__piercingFixture"];
  const originals = new Map(keys.map((key) => [key, globalThis[key]]));
  const frames = new Map(), timers = new Map(), effects = [], cleanups = [], images = [], draws = [], shakes = [];
  const impacts = [], completed = [];
  let serial = 0, now = 0, resize;
  const width = mobile ? 360 : 972, height = mobile ? 280 : 390;
  const context = { save() {}, restore() {}, translate(x,y) { this.tx=x;this.ty=y; }, rotate(angle) { this.angle=angle; }, setTransform() {}, clearRect() {}, drawImage(...args) { args[5]+=this.tx??0;args[6]+=this.ty??0;args.angle=this.angle??0;args.alpha=this.globalAlpha;draws.push(args); } };
  const stage = { clientWidth: width,
    querySelector(selector) { const player = selector.includes("player");
      return { getBoundingClientRect: () => ({ left: width * (player ? .12 : .68), top: height*.27,
        bottom: height * .8, width: width * .18, height: height * .7 }) }; },
    animate(_frames, options) { shakes.push(options); return { cancel() {} }; },
  };
  const canvas = { clientWidth: width, clientHeight: height,
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }), closest: () => stage,
    getContext: () => context, addEventListener() {}, removeEventListener() {} };
  globalThis.window = { devicePixelRatio: 1, matchMedia: () => ({ matches: reduced }),
    setTimeout(fn) { const timer = ++serial; timers.set(timer, fn); return timer; }, clearTimeout(timer) { timers.delete(timer); } };
  globalThis.Image = class { constructor() { images.push(this); this.complete = false;
    this.naturalWidth = 1024; this.naturalHeight = 1536; }
    set src(value) { this._src=value;if(value.endsWith('cannon.webp')) {this.naturalWidth=1024;this.naturalHeight=2048;} else if(value.endsWith('impacts.webp')) {this.naturalWidth=1252;this.naturalHeight=1252;} else if(value.includes('/sky-queen-rain-v5/array-')) {this.naturalWidth=1774;this.naturalHeight=887;} else if(value.endsWith('arrows.webp') || value.includes('/hit-')) {this.naturalWidth=1254;this.naturalHeight=1254;} else if(value.endsWith('water.webp')) {this.naturalWidth=1086;this.naturalHeight=1448;} else if(value.endsWith('summoning.webp')) {this.naturalWidth=1086;this.naturalHeight=1448;} }
    get src(){return this._src;} };
  globalThis.ResizeObserver = class { constructor(fn) { resize = fn; } observe() {} disconnect() {} };
  globalThis.requestAnimationFrame = (fn) => { const frame = ++serial; frames.set(frame, fn); return frame; };
  globalThis.cancelAnimationFrame = (frame) => frames.delete(frame);
  globalThis.__piercingFixture = { ...timing,
    useRef: (current) => ({ current }), useState: () => [fallback, () => {}], useEffect: (effect) => effects.push(effect),
    WebGLVfxRenderer: class { gl = { isContextLost: () => false }; resize() {} clear() {} dispose() {}
      sprite(...args) { draws.push(args); } },
    jsx(_type, props) { props.ref.current = canvas; return props; },
  };
  const component = await import(`data:text/javascript;base64,${Buffer.from('const {jsx} = globalThis.__piercingFixture;\n' + compiled + `\n// fixture ${++id}`).toString("base64")}`);
  component.RangerSkyQueenRainVfx({ ascended, effectKey: 42, arrows: Array.from({length:9},(_,i)=>({hit:!missed.includes(i),critical:i<8})),
    onImpact: (_, index) => impacts.push({index, at:now}), onComplete: () => completed.push(now) });
  for (const effect of effects) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); }
  return { impacts, completed, draws, shakes, width, height,
    load() { for(const image of images) { image.complete = true; image.onload?.(); } },
    loadPart(index) { const image=images[index]; image.complete=true; image.onload?.(); },
    expire() { [...timers.values()][0]?.(); },
    fail() { images[0].onerror(); }, resize: () => resize(), pending: () => frames.size,
    step(time) { now = time; const pending = [...frames.values()]; frames.clear(); for (const fn of pending) fn(time); },
    cleanup() { cleanups.forEach((fn) => fn()); for (const [key, value] of originals) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    } },
  };
}

for (const fallback of [false,true]) test(`${fallback?"Canvas":"WebGL"} nine impact cues follow loaded queen art and release ultimate only after finale`,async()=>{
 const p=await playback({fallback});try{
 p.step(2000);assert.equal(p.draws.length,0);p.load();p.step(3000);p.step(4319);assert.equal(p.impacts.length,0);
 for(const t of timing.SKY_RAIN_IMPACTS_MS)p.step(3000+t);
 assert.deepEqual(p.impacts.map(x=>x.index),[0,1,2,3,4,5,6,7,8]);
 assert.deepEqual(p.impacts.map(x=>x.at),timing.SKY_RAIN_IMPACTS_MS.map(t=>3000+t));
 assert.equal(p.shakes.length,9);assert.equal(p.shakes.at(-1).duration,440);assert.equal(p.completed.length,0);
 p.resize();p.resize();assert.equal(p.pending(),1);p.step(5920);assert.deepEqual(p.completed,[5920]);assert.equal(p.pending(),0);
 }finally{p.cleanup();}
});
test("nine misses fly through, show no contact art or invented shake",async()=>{
 const p=await playback({missed:[0,1,2,3,4,5,6,7,8]});try{p.load();p.step(1000);
 for(const age of timing.SKY_RAIN_IMPACTS_MS)p.step(1000+age);
 assert.equal(p.shakes.length,0);assert.equal(p.impacts.length,9);assert.ok(!p.draws.some(d=>d[0].src.includes("/hit-")));
 assert.ok(p.draws.every(d=>!d[0].src.endsWith("impacts.webp") || d[7][1]<.25));p.step(3920);assert.equal(p.completed.length,1);
 }finally{p.cleanup();}
});
test("ascended texture and marks reflect only preceding confirmed rain criticals",async()=>{
 const p=await playback({ascended:true,missed:[0,3,8]});try{p.load();p.step(1000);p.step(2440);
 assert.ok(p.draws.every(d=>d[0].src.endsWith("array-ascended.webp") || d[0].src.endsWith("hit-ascended.webp") || d[0].src.endsWith("cannon.webp") || (d[0].src.includes("sky-queen-rain-v2") || d[0].src.endsWith("summoning.webp") || d[0].src.endsWith("water.webp") || d[0].src.endsWith("arrows.webp")) && d[7][1]>=.5));
 assert.equal(p.impacts.length,2);p.step(3440);assert.equal(p.shakes.length,1); // suspended tab skips stale shakes, main missed
 }finally{p.cleanup();}
});
test("reduced motion publishes all nine once, uses static sprites and no camera motion",async()=>{
 const p=await playback({reduced:true,ascended:true});try{p.load();p.step(1000);assert.equal(p.impacts.length,9);
 assert.equal(p.shakes.length,0);p.step(1300);assert.deepEqual(p.completed,[1300]);
 }finally{p.cleanup();}
});
for(const failure of ["fail","expire"])test(`art ${failure} releases all settled display cues and ultimate lock once`,async()=>{
 const p=await playback();try{p[failure]();p[failure]();assert.equal(p.impacts.length,9);assert.equal(p.completed.length,1);assert.equal(p.shakes.length,0);
 }finally{p.cleanup();}
});
test("mobile atlas bounds and fixed queen proportions are valid throughout prayer",async()=>{
 const p=await playback({mobile:true});try{p.load();p.step(1000);p.step(1350);p.step(1750);p.step(1970);
 const queens=p.draws.filter(d=>d[0].src.endsWith("queen.webp"));assert.equal(queens.length,3);
 const bottoms=queens.map(d=>d[2]+d[4]);assert.ok(Math.max(...bottoms)-Math.min(...bottoms)<.001);
 for(const d of p.draws){const [x,y,w,h]=d[7];assert.ok(x>=0&&y>=0&&x+w<=1&&y+h<=1);assert.ok(d[3]>0&&d[4]>0);}
 }finally{p.cleanup();}
});


test("all seven separate assets must load before starting the ultimate",async()=>{
const p=await playback();try{p.loadPart(0);p.loadPart(1);p.loadPart(2);p.step(1000);assert.equal(p.draws.length,0);assert.equal(p.impacts.length,0);
p.loadPart(3);p.loadPart(4);p.step(1500);assert.equal(p.draws.length,0);p.loadPart(5);p.loadPart(6);p.step(2000);p.step(2001);assert.ok(p.draws.some(d=>d[0].src.endsWith("queen.webp")));assert.deepEqual(p.impacts,[]);
p.step(3320);assert.equal(p.impacts.length,1);}finally{p.cleanup();}
});
for(const fallback of [false,true])test(`${fallback?"Canvas":"WebGL"} awakening and sky array use separate artwork at their own times`,async()=>{
const p=await playback({fallback});try{p.load();p.step(1000);p.draws.length=0;p.step(1739);
assert.ok(p.draws.every(d=>d[0].src.endsWith("queen.webp")));
p.draws.length=0;p.step(1740);assert.ok(p.draws.some(d=>d[0].src.endsWith("impacts.webp")));assert.ok(!p.draws.some(d=>d[0].src.includes("/array-")));
p.draws.length=0;p.step(2050);assert.ok(p.draws.some(d=>d[0].src.includes("/array-")));assert.deepEqual(p.impacts,[]);
}finally{p.cleanup();}
});


for(const mobile of [false,true])for(const fallback of [false,true])
test(`${mobile?"mobile":"desktop"} ${fallback?"Canvas":"WebGL"} ring stays above portraits and centred over queen`,async()=>{
const p=await playback({mobile,fallback});try{p.load();p.step(1000);p.step(2200);
const ring=p.draws.findLast(d=>d[0].src.includes('/array-'));assert.ok(ring);
const x=fallback?ring[5]:ring[1],y=fallback?ring[6]:ring[2],w=fallback?ring[7]:ring[3],h=fallback?ring[8]:ring[4];
assert.ok(y>=0);assert.ok(y+h+w*.04<p.height*.27);assert.ok(Math.abs(x+w/2-p.width*.228)<p.width*.03);
assert.ok(w<=1534);assert.ok(x>=0&&x+w<=p.width);assert.deepEqual(p.impacts,[]);
}finally{p.cleanup();}
});


for(const fallback of [false,true])test(`${fallback?"Canvas":"WebGL"} water arrows emerge, main draws back and gate fades before firing`,async()=>{
const p=await playback({fallback});try{p.load();p.step(1000);
const find=(age,cell)=>{p.draws.length=0;p.step(1000+age);return p.draws.find(d=>d[0].src.endsWith('arrows.webp') && (fallback?d[1]/1254:d[7][0])>(cell%2?.49:-1) && (fallback?d[1]/1254:d[7][0])<(cell%2?1:.01) && (fallback?d[2]/1254:d[7][1])<.01);};
assert.equal(find(989,0),undefined);
const early=find(1020,0),late=find(1229,0);assert.ok(early&&late);
assert.ok((fallback?early.alpha:early[5])<(fallback?late.alpha:late[5]));
const tip=(d)=>{const left=fallback?d[5]:d[1],top=fallback?d[6]:d[2],w=fallback?d[7]:d[3],h=fallback?d[8]:d[4],r=fallback?d.angle:d[8];return[left+w/2+.35*w*Math.cos(r),top+h/2+.35*w*Math.sin(r)];};
const a=late,b=find(1230,0);assert.equal(fallback?a.angle:a[8],fallback?b.angle:b[8]);assert.ok(Math.hypot(...tip(a).map((v,i)=>v-tip(b)[i]))<.6);
const mainBefore=find(2170,1),mainPulled=find(2379,1),mainFired=find(2380,1);
assert.ok(tip(mainPulled)[0]<tip(mainBefore)[0]);assert.ok(Math.hypot(...tip(mainPulled).map((v,i)=>v-tip(mainFired)[i]))<.2);
p.draws.length=0;p.step(3150);const gateA=p.draws.find(d=>d[0].src.includes('/array-'));
p.draws.length=0;p.step(3370);const gateB=p.draws.find(d=>d[0].src.includes('/array-'));
assert.ok((fallback?gateA.alpha:gateA[5])>(fallback?gateB.alpha:gateB[5]));
p.draws.length=0;p.step(3400);assert.ok(p.draws.some(d=>d[0].src.includes('/array-')));
p.draws.length=0;p.step(3440);assert.ok(p.draws.some(d=>d[0].src.includes('/hit-')));
assert.equal(p.impacts.filter(d=>d.index===8).length,1);
}finally{p.cleanup();}
});

for(const fallback of [false,true])for(const ascended of [false,true])
test(`${fallback?'Canvas':'WebGL'} ${ascended?'ascended':'normal'} penetration wave spreading and dissipation use distinct frames at the monster`,async()=>{
 const p=await playback({fallback,ascended});try{p.load();p.step(1000);const frames=[];
 for(const age of [2440,2490,2600,2800]){p.draws.length=0;p.step(1000+age);
  const hit=p.draws.find(d=>d[0].src.endsWith(ascended?"cannon.webp":"hit-normal.webp") && (!ascended||(fallback?d[2]/2048:d[7][1])>.49));assert.ok(hit);
  const sx=fallback?hit[1]/(ascended?1024:1254):hit[7][0],sy=fallback?hit[2]/(ascended?2048:1254):hit[7][1];frames.push(Math.floor(sx*2)+Math.floor(sy*(ascended?4:2))*2);
  const x=fallback?hit[5]:hit[1],y=fallback?hit[6]:hit[2],w=fallback?hit[7]:hit[3],h=fallback?hit[8]:hit[4];
  assert.ok(Math.abs(x+w/2-p.width*.77)<.001);assert.ok(Math.abs(y+h/2-p.height*(.27+.7*.58))<.001);
 }
 assert.deepEqual(frames,ascended?[4,5,6,7]:[0,1,2,3]);assert.equal(p.impacts.filter(d=>d.index===8).length,1);
 }finally{p.cleanup();}
});

for(const fallback of [false,true])test(`${fallback?'Canvas':'WebGL'} ascended cannon waits for its atlas and plays charge then launch without extra hits`,async()=>{
 const p=await playback({fallback,ascended:true});try{
 for(let i=0;i<7;i++)p.loadPart(i);p.step(1000);assert.equal(p.draws.length,0);assert.equal(p.impacts.length,0);
 p.loadPart(7);p.step(2000);const cells=[];
 for(const age of [2090,2300,2380,2420]){p.draws.length=0;p.step(2000+age);
 const d=p.draws.find(d=>d[0].src.endsWith('cannon.webp') && (age>=2380 || (fallback?d[2]/2048:d[7][1])<.25));assert.ok(d);
 const u=fallback?d[1]/1024:d[7][0],v=fallback?d[2]/2048:d[7][1];cells.push(Math.floor(u*2)+Math.floor(v*4)*2);
 }
 assert.deepEqual(cells,[0,1,2,3]);p.step(4440);p.step(4920);
 assert.deepEqual(p.impacts.map(x=>x.index),[0,1,2,3,4,5,6,7,8]);assert.equal(p.completed.length,1);
 }finally{p.cleanup();}
});
test('ascended missed arrows never draw pressure impact or waves',async()=>{
 const p=await playback({ascended:true,missed:[0,1,2,3,4,5,6,7,8]});try{p.load();p.step(1000);
 for(const age of timing.SKY_RAIN_IMPACTS_MS)p.step(1000+age);
 assert.ok(p.draws.every(d=>!d[0].src.endsWith('cannon.webp')||d[7][1]<.5));assert.equal(p.shakes.length,0);assert.equal(p.impacts.length,9);
 }finally{p.cleanup();}
});
