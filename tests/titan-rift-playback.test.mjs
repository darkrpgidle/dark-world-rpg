import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import ts from "typescript";
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith("./") && !specifier.endsWith(".ts") ? `${specifier}.ts` : specifier, context);
} });
const timing = await import("../app/titan-rift-timing.ts");
const { titanSpiritPlacement, titanSlashPlacement } = await import("../app/titan-rift-layout.ts");
const { TITAN_HD_ART, titanGhostCell, titanHdUv } = await import("../app/titan-rift-frames.ts");
const { titanImpactCue } = await import("../app/titan-rift-impact.ts");
const source = readFileSync(new URL("../app/webgl-titan-rift-vfx.tsx", import.meta.url), "utf8");
// Run the real component effect with controllable image loading, RAF and GPU/2D surfaces.
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React, jsxFactory: "jsx",
} }).outputText.replace(/import\s*\{([^}]+)\}\s*from\s*"[^"]+";/g,
  (_, names) => `const {${names}} = globalThis.__titanPlaybackFixture;`);
let fixtureId = 0;
async function playback({ fallback = false, reducedMotion = false, ascended = false, hit = true, echo = false, mobile = false } = {}) {
  const original = new Map(["window", "Image", "ResizeObserver", "requestAnimationFrame", "cancelAnimationFrame", "__titanPlaybackFixture"].map((key) => [key, globalThis[key]]));
  const effects = [], cleanups = [], frames = new Map(), impacts = [], completed = [], shakes = [], sprites = [];
  const images = [];
  let nextFrame = 0, now = 0;
  const slashLayer={style:{opacity:"0"}},woundLayer={style:{opacity:"0"}};
  const context = { save(){},restore(){},translate(){},rotate(){},setTransform() {}, clearRect() {}, drawImage(...args) { sprites.push(args); }, beginPath() {}, arc() {}, stroke() {} };
  const classes=new Set();
  const stage = {
    classList:{add:k=>classes.add(k),remove:k=>classes.delete(k)},
    getBoundingClientRect:()=>({left:0,top:0,width:mobile?360:972,height:390}),
    querySelector(selector) { return { getBoundingClientRect: () => selector.includes("player")
      ? { left: mobile?12:120, top: 15, width: mobile?112:178, height: mobile?158:270 } : { left: mobile?236:676, top: 19, width: mobile?112:178, height: mobile?158:270 } }; },
    animate(keyframes, options) { const shake = { keyframes, options, cancelled: false, cancel() { this.cancelled = true; } }; shakes.push(shake); return shake; },
  };
  const stageWidth=mobile?360:972, expanded=echo?1:1.64;
  const canvas = { clientWidth:stageWidth*expanded, clientHeight:echo?390:390*2.16, width:972,height:390,
    getBoundingClientRect:()=>({left:echo?0:-stageWidth*.32,top:echo?0:-390*.88,width:stageWidth*expanded,height:echo?390:390*2.16}),closest:()=>stage,
    addEventListener() {}, removeEventListener() {}, getContext: () => context };
  globalThis.window = { devicePixelRatio: 1, matchMedia: () => ({ matches: reducedMotion }) };
  globalThis.Image = class { constructor() { images.push(this); this.complete = false; this.naturalWidth = 1536; this.naturalHeight = 1024; }
 set src(value){this._src=value;this.naturalWidth=value.includes("spirit")?2304:value.includes("impact")?1536:1024;this.naturalHeight=value.includes("slash")?1024:1536;}get src(){return this._src;} };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.requestAnimationFrame = (draw) => { const id = ++nextFrame; frames.set(id, draw); return id; };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  globalThis.__titanPlaybackFixture = { ...timing, titanSpiritPlacement, titanSlashPlacement, TITAN_HD_ART, titanGhostCell, titanHdUv, titanImpactCue,
    useRef: (current) => ({ current }), useEffect: (effect) => effects.push(effect), useState: () => [fallback, () => {}],
    WebGLVfxRenderer: class { gl = { isContextLost: () => false }; resize() {} clear() {} ring() {} dispose() {} sprite(...args) { sprites.push(args); } },
    jsx(type, props) { if (typeof type === "function") return type(props); if (props.ref) props.ref.current = props.className==="titan-ultimate-slash"?slashLayer:props.className==="titan-ultimate-wound"?woundLayer:canvas; return props; },
  };
  const componentModule = await import(`data:text/javascript;base64,${Buffer.from('const {jsx} = globalThis.__titanPlaybackFixture;\n' + compiled + `\n// fixture ${++fixtureId}`).toString("base64")}`);
  (echo?componentModule.WebGLTitanEchoVfx:componentModule.WebGLTitanRiftVfx)({ kind: echo?"echo":"ultimate", slashIndex:2, hit, ascended, effectKey: 42,
    onImpact: (key) => impacts.push({ key, at: now }), onComplete: (key) => completed.push(key) });
  for (const effect of effects) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); }
  return { impacts, completed, shakes, sprites, images, slashLayer, woundLayer, classes,
    load() { for(const image of images){image.complete = true;image.onload?.();} },
    failImage() { images[0].onerror(); },
    step(time) { now = time; sprites.length=0; const pending = [...frames.values()]; frames.clear(); for (const draw of pending) draw(time); },
    cleanup() { for (const cleanup of cleanups) cleanup(); for (const [key, value] of original) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } },
  };
}

for (const fallback of [false, true]) test(`${fallback ? "Canvas fallback" : "WebGL"} publishes damage once at actual frame 15 after a slow image load`, async () => {
  const p = await playback({ fallback });
  try {
    p.step(2000);
    assert.equal(p.impacts.length, 0);
    p.load(); p.step(3000);
    p.step(3000 + timing.TITAN_RIFT_IMPACT_MS - 1);
    assert.equal(p.impacts.length, 0);
    p.step(3000 + timing.TITAN_RIFT_IMPACT_MS);
    assert.deepEqual(p.impacts, [{ key: 42, at: 3000 + timing.TITAN_RIFT_IMPACT_MS }]);
    assert.equal(p.shakes.at(-1).options.duration, 450);
    assert.ok(p.shakes.at(-1).keyframes.some((frame) => frame.translate.startsWith("16px")));
    p.step(3000 + timing.TITAN_RIFT_IMPACT_MS + 10);
    p.step(3000 + timing.TITAN_RIFT_DURATION_MS);
    assert.equal(p.impacts.length, 1);
    assert.deepEqual(p.completed, [42]);
    assert.ok(p.shakes.every((shake) => shake.cancelled));
  } finally { p.cleanup(); }
});

test("reduced motion shows the static impact number without shaking", async () => {
  const p = await playback({ reducedMotion: true });
  try { p.load(); p.step(1000); p.step(1430); assert.equal(p.impacts.length, 1); assert.equal(p.shakes.length, 0); }
  finally { p.cleanup(); }
});

test("a failed image reports already-settled damage once and finishes", async () => {
  const p = await playback();
  try { p.failImage(); p.failImage(); assert.equal(p.impacts.length, 1); assert.deepEqual(p.completed, [42]); }
  finally { p.cleanup(); }
});

for(const ascended of [false,true])for(const mobile of [false,true])for(const fallback of [false,true])test(`HD titan ${ascended?'ascended':'normal'} ${mobile?'mobile':'desktop'} ${fallback?'Canvas':'WebGL'} has whole fixed giant and foreground contact`,async()=>{
 const p=await playback({ascended,mobile,fallback});try{
  p.load();p.step(1000);p.step(1600);
  assert.equal(p.images[0].src,ascended?TITAN_HD_ART.ascended:TITAN_HD_ART.normal);
  const before=p.sprites[0];const dimensions=fallback?before.slice(7,9):before.slice(3,5);
  assert.equal(dimensions[0],dimensions[1]);assert.equal(dimensions[0],(mobile?158:270)*(ascended?3.35:3));
  p.step(1000+timing.TITAN_RIFT_IMPACT_MS-1);assert.equal(p.woundLayer.style.opacity,'0');assert.ok(Number(p.slashLayer.style.opacity)>0);
  p.step(1000+timing.TITAN_RIFT_IMPACT_MS);assert.ok(Number(p.woundLayer.style.opacity)>0);assert.equal(p.sprites.length,1);
  const uv=fallback?p.sprites[0].slice(1,5).map((v,i)=>v/(i%2?1536:2304)):p.sprites[0][7];
  assert.deepEqual(uv,titanHdUv(4));
  assert.deepEqual(fallback?p.sprites[0].slice(7,9):p.sprites[0].slice(3,5),dimensions);
  const size=(mobile?112:178)*(ascended?2:1.6);
  assert.equal(parseFloat(p.woundLayer.style.width),size);
  const position=p.woundLayer.style.backgroundPosition.split(' ').map(parseFloat);
  assert.deepEqual(position,[-2*size/764,-(ascended?770:2)*size/764]);
  p.step(1000+timing.TITAN_RIFT_DURATION_MS);assert.equal(p.woundLayer.style.opacity,'0');assert.equal(p.slashLayer.style.opacity,'0');assert.equal(p.classes.size,0);
 }finally{p.cleanup()}
});
test('miss still swings without enemy wound or shake and completes its settled status once',async()=>{
 const p=await playback({hit:false});try{p.load();p.step(1000);p.step(1000+timing.TITAN_RIFT_FRAME_STARTS_MS[11]+10);assert.ok(Number(p.slashLayer.style.opacity)>0);assert.equal(p.woundLayer.style.opacity,'0');assert.equal(p.shakes.length,0);
 p.step(3000);assert.equal(p.impacts.length,1);assert.deepEqual(p.completed,[42]);}finally{p.cleanup()}
});
test('reduced motion starts with static whole ghost and dim contact without traveling slash',async()=>{
 const p=await playback({reducedMotion:true,ascended:true});try{p.load();p.step(1000);assert.equal(p.sprites.length,1);assert.ok(Number(p.woundLayer.style.opacity)>0);assert.ok(Number(p.woundLayer.style.opacity)<=.55);assert.equal(p.slashLayer.style.opacity,'0');assert.equal(p.impacts.length,1)}finally{p.cleanup()}
});
test('actual ascended echo draws one target scar and one slash and never publishes main damage',async()=>{
 for(const fallback of [false,true]){const p=await playback({echo:true,fallback});try{p.load();p.step(1000);p.step(1150);assert.equal(p.sprites.length,2);assert.equal(p.impacts.length,0);p.step(1520);assert.deepEqual(p.completed,[42]);}finally{p.cleanup()}}
});
test('optional foreground image failures leave main damage and completion intact',async()=>{
 const p=await playback();try{p.load();for(const image of p.images.slice(1))image.naturalWidth=0;p.step(1000);p.step(1000+timing.TITAN_RIFT_IMPACT_MS);assert.equal(p.impacts.length,1);assert.equal(p.sprites.length,1);assert.equal(p.woundLayer.style.opacity,'0');p.step(1000+timing.TITAN_RIFT_DURATION_MS);assert.deepEqual(p.completed,[42]);}finally{p.cleanup()}
});
