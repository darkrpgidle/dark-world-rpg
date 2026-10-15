import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../app/ranger-starbreak-snipe-vfx.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React, jsxFactory: "jsx",
} }).outputText.replace(/import\s*\{([^}]+)\}\s*from\s*"[^"]+";/g,
  (_, names) => `const {${names}} = globalThis.__piercingFixture;`);
let id = 0;
async function playback({ fallback = false, reduced = false, hit = true, kind = "main", ascended = false, chargeRecovered = false, mobile = false } = {}) {
  const keys = ["window", "Image", "ResizeObserver", "requestAnimationFrame", "cancelAnimationFrame", "__piercingFixture"];
  const originals = new Map(keys.map((key) => [key, globalThis[key]]));
  const frames = new Map(), timers = new Map(), effects = [], cleanups = [], images = [], draws = [], shakes = [];
  const impacts = [], completed = [];
  let serial = 0, now = 0, resize;
  const width = mobile ? 360 : 972, height = mobile ? 280 : 390;
  const context = { save() {}, restore() {}, translate(x,y) { this.tx=x;this.ty=y; }, rotate() {}, setTransform() {}, clearRect() {}, drawImage(...args) { args[5]+=this.tx??0;args[6]+=this.ty??0;draws.push(args); } };
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
    this.naturalWidth = 1252; this.naturalHeight = 1252; } };
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
  component.RangerStarbreakSnipeVfx({ kind, hit, ascended, chargeRecovered, effectKey: 42,
    onImpact: () => impacts.push(now), onComplete: () => completed.push(now) });
  for (const effect of effects) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); }
  return { impacts, completed, draws, shakes, width, height,
    load() { const image = images[0]; image.complete = true; image.onload(); },
    loadRecovery() { const image = images[1]; image.complete = true; image.onload?.(); },
    failRecovery() { images[1].onerror?.(); },
    expireRecovery() { [...timers.values()].at(-1)?.(); },
    fail() { images[0].onerror(); }, resize: () => resize(), pending: () => frames.size,
    step(time) { now = time; const pending = [...frames.values()]; frames.clear(); for (const fn of pending) fn(time); },
    cleanup() { cleanups.forEach((fn) => fn()); for (const [key, value] of originals) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    } },
  };
}


for(const fallback of [false,true]) test(`${fallback?"Canvas":"WebGL"} starbreak waits for loaded art and publishes damage at first contact`,async()=>{
const p=await playback({fallback});try{p.step(2000);assert.equal(p.draws.length,0);p.load();p.step(3000);p.step(3369);assert.deepEqual(p.impacts,[]);
p.step(3370);p.step(3409);assert.deepEqual(p.impacts,[]);p.step(3410);assert.deepEqual(p.impacts,[3410]);assert.equal(p.shakes.length,1);
assert.equal(p.shakes[0].duration,220);p.resize();p.resize();assert.equal(p.pending(),1);p.step(3820);assert.deepEqual(p.completed,[3820]);assert.equal(p.pending(),0);
}finally{p.cleanup();}
});
test("missed ray uses flight artwork and never draws a contact explosion or shakes",async()=>{
const p=await playback({hit:false});try{p.load();p.step(1000);p.step(1410);p.step(1550);
assert.equal(p.shakes.length,0);for(const d of p.draws){assert.ok(d[7][1]<.25);}
assert.deepEqual(p.impacts,[1410]);p.step(1820);assert.equal(p.completed.length,1);
}finally{p.cleanup();}
});
test("arrow visibly travels right, back down-left, then right before one contact",async()=>{
const p=await playback();try{p.load();p.step(1000);
const tips=[];for(const age of [130,230,330,400]){p.draws.length=0;p.step(1000+age);
 const arrow=p.draws.findLast(d=>d[7][1]<.01&&d[7][0]<.5&&d[7][2]>.24);assert.ok(arrow);tips.push([arrow[1]+arrow[3]/2,arrow[2]+arrow[4]/2]);}
assert.ok(tips[0][0]>tips[1][0]);assert.ok(tips[1][1]>tips[0][1]);
assert.ok(tips[3][0]>tips[2][0]);assert.deepEqual(p.impacts,[]);
p.step(1410);assert.deepEqual(p.impacts,[1410]);
}finally{p.cleanup();}
});
test("both Z corners hold the arrow position for braking",async()=>{
const p=await playback();try{p.load();p.step(1000);
for(const [start,end] of [[150,180],[280,310]]){const positions=[];for(const age of [start,end]){
 p.draws.length=0;p.step(1000+age);const arrow=p.draws.find(d=>d[7][1]<.01&&d[7][0]<.25&&d[7][2]>.24);assert.ok(arrow);positions.push([arrow[1]+arrow[3]/2,arrow[2]+arrow[4]/2]);}
assert.deepEqual(positions[0],positions[1]);}
}finally{p.cleanup();}
});
test("reduced motion shows static contact and publishes once without shake",async()=>{
const p=await playback({reduced:true});try{p.load();p.step(1000);assert.deepEqual(p.impacts,[1000]);assert.equal(p.shakes.length,0);
p.step(1240);assert.deepEqual(p.completed,[1240]);
}finally{p.cleanup();}
});
test("failed atlas releases already settled damage once without an invented shake",async()=>{
const p=await playback();try{p.fail();p.fail();assert.equal(p.impacts.length,1);assert.equal(p.completed.length,1);assert.equal(p.shakes.length,0);}
finally{p.cleanup();}
});
test("mobile uses restrained shake and crops every region within the real atlas",async()=>{
const p=await playback({mobile:true});try{p.load();p.step(1000);for(const age of [270,340,370,410,455,505,585,665,740])p.step(1000+age);
assert.equal(p.shakes.length,1);for(const d of p.draws){const [x,y,w,h]=d[7];assert.ok(x>=0&&y>=0&&x+w<=1&&y+h<=1);assert.ok(d[3]>0&&d[4]>0);}
p.step(1820);assert.equal(p.completed.length,1);
}finally{p.cleanup();}
});

for(const fallback of [false,true])test(`${fallback?"Canvas":"WebGL"} ascended critical selects violet art and sends recovery back to the caster`,async()=>{
 const p=await playback({fallback,ascended:true,chargeRecovered:true});try{
 p.load();p.loadRecovery();p.step(1000);p.step(1410);assert.deepEqual(p.impacts,[1410]);p.step(1570);p.step(1650);p.step(1730);
 const returnDraws=p.draws.filter(d=>d[0].src.endsWith("recovery.webp"));assert.equal(returnDraws.length,3);
 const x=returnDraws.map(d=>fallback?d[5]:d[1]);assert.ok(x[0]>x[1]&&x[1]>x[2]);
 assert.ok(p.draws.filter(d=>!d[0].src.endsWith("recovery.webp")).every(d=>d[0].src.endsWith("atlas.webp") && (fallback ? d[2]/1252 : d[7][1]) >= .5));
 p.step(1930);assert.deepEqual(p.completed,[1930]);assert.equal(p.impacts.length,1);
 }finally{p.cleanup();}
});
for(const options of [{ascended:true,chargeRecovered:false},{ascended:false,chargeRecovered:true},{ascended:true,chargeRecovered:true,hit:false}])
test(`recovery requires actual ascension, hit and recovered event ${JSON.stringify(options)}`,async()=>{
 const p=await playback(options);try{p.load();p.step(1000);p.step(1570);p.step(1820);
 assert.ok(p.draws.every(d=>!d[0].src.endsWith("recovery.webp")));assert.deepEqual(p.completed,[1820]);
 }finally{p.cleanup();}
});
test("slow recovery atlas keeps the damage cue once and resumes its own return timeline",async()=>{
 const p=await playback({ascended:true,chargeRecovered:true});try{p.load();p.step(1000);p.step(1410);p.step(1820);
 assert.equal(p.pending(),0);assert.equal(p.completed.length,0);p.loadRecovery();p.step(3000);p.step(3160);p.step(3360);
 assert.deepEqual(p.impacts,[1410]);assert.deepEqual(p.completed,[3360]);
 }finally{p.cleanup();}
});
test("failed recovery artwork does not delay base shot completion",async()=>{
 const p=await playback({ascended:true,chargeRecovered:true});try{p.load();p.failRecovery();p.step(1000);p.step(1410);p.step(1820);
 assert.deepEqual(p.impacts,[1410]);assert.deepEqual(p.completed,[1820]);
 }finally{p.cleanup();}
});

test("reduced ascended recovery shows a static caster sigil without shake or duplicate damage",async()=>{
 const p=await playback({ascended:true,chargeRecovered:true,reduced:true});try{p.load();p.loadRecovery();p.step(1000);p.step(1240);
 assert.deepEqual(p.impacts,[1000]);assert.deepEqual(p.completed,[1240]);assert.equal(p.shakes.length,0);
 assert.ok(p.draws.some(d=>d[0].src.endsWith("recovery.webp")));
 }finally{p.cleanup();}
});
test("recovery timeout wakes the paused canvas and clears its expired cast",async()=>{
 const p=await playback({ascended:true,chargeRecovered:true});try{p.load();p.step(1000);p.step(1410);p.step(1820);
 assert.equal(p.pending(),0);p.expireRecovery();p.step(6000);assert.equal(p.completed.length,1);assert.equal(p.impacts.length,1);assert.equal(p.pending(),0);
 }finally{p.cleanup();}
});


for(const fallback of [false,true]) for(const ascended of [false,true])
test(`${fallback?"Canvas":"WebGL"} ${ascended?"ascended":"normal"} wound precedes rightward exit burst without another hit`,async()=>{
const p=await playback({fallback,ascended,mobile:true});try{
 p.load();p.step(1000);const cone=(d)=>fallback ? d[1]/1252>.49&&d[2]/1252>(ascended?.74:.24) : d[7][0]>.49&&d[7][1]>(ascended?.74:.24);
 p.draws.length=0;p.step(1410);assert.ok(p.draws.some(d=>fallback?d[2]/1252>(ascended?.74:.24):d[7][1]>(ascended?.74:.24)));assert.ok(!p.draws.some(cone));
 p.draws.length=0;p.step(1410+(ascended?149:69));assert.ok(!p.draws.some(cone));
 p.draws.length=0;p.step(1410+(ascended?150:70));const blast=p.draws.find(cone);assert.ok(blast);
 const x=fallback?blast[5]:blast[1],w=fallback?blast[7]:blast[3];assert.ok(x+w<=p.width);assert.ok(x+w>p.width*.77);
 assert.deepEqual(p.impacts,[1410]);p.step(1820);assert.deepEqual(p.completed,[1820]);
}finally{p.cleanup();}
});
