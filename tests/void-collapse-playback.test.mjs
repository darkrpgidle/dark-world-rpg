import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import sharp from 'sharp';
import {VOID_ART,VOID_ASCENDED_ART,VOID_ASCENDED_PAGES,VOID_ASCENDED_ANCHORS,voidAscendedFrame,VOID_TIMING,voidFrame,voidUv,voidGeometry} from '../app/void-collapse-frames.ts';
const source=readFileSync(new URL('../app/mage-void-collapse-vfx.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.React,jsxFactory:'jsx'}}).outputText.replace(/import\s*\{([^}]+)\}\s*from\s*"[^"]+";/g,(_,names)=>`const {${names}}=globalThis.__frostFixture;`);
let id=0;
async function playback({fallback=false,reduced=false,hit=true,ascended=false,mobile=false,burstHit=true}={}) {
 const keys=['window','Image','ResizeObserver','requestAnimationFrame','cancelAnimationFrame','__frostFixture'];
 const originals=new Map(keys.map(k=>[k,globalThis[k]]));
 const frames=new Map(),timers=new Map(),effects=[],cleanups=[],images=[],draws=[],shakes=[],impacts=[],completed=[];
 let serial=0,now=0,resize,refs=[],refIndex=0;
 const width=mobile?360:972,height=mobile?280:390;
 const context={save(){},restore(){},translate(x,y){this.tx=x;this.ty=y},rotate(){},setTransform(){},clearRect(){},drawImage(...args){draws.push(args)}};
 const stage={clientWidth:width,querySelector(selector){const player=selector.includes('player');return{getBoundingClientRect:()=>({left:width*(player?.12:.68),top:10,width:width*.18,height:height*.7})}},animate(keyframes,options){shakes.push({keyframes,...options});return{cancel(){}}}};
 const canvas={clientWidth:width,clientHeight:height,getBoundingClientRect:()=>({left:0,top:0,width,height}),closest:()=>stage,getContext:()=>context,addEventListener(){},removeEventListener(){}};
 globalThis.window={devicePixelRatio:1,matchMedia:()=>({matches:reduced}),setTimeout(fn){const k=++serial;timers.set(k,fn);return k},clearTimeout(k){timers.delete(k)}};
 globalThis.Image=class {constructor(){images.push(this);this.complete=false;this.naturalWidth=1536;this.naturalHeight=1024}};
 globalThis.ResizeObserver=class{constructor(fn){resize=fn}observe(){}disconnect(){}};
 globalThis.requestAnimationFrame=fn=>{const k=++serial;frames.set(k,fn);return k};globalThis.cancelAnimationFrame=k=>frames.delete(k);
 globalThis.__frostFixture={VOID_ART,VOID_ASCENDED_ART,VOID_ASCENDED_PAGES,VOID_ASCENDED_ANCHORS,voidAscendedFrame,VOID_TIMING,voidFrame,voidUv,voidGeometry,
  useRef(value){return refs[refIndex++]??= {current:value}},useState:()=>[fallback,()=>{}],useEffect:fn=>effects.push(fn),
  WebGLVfxRenderer:class{gl={isContextLost:()=>false};resize(){}clear(){}dispose(){}sprite(...args){draws.push(args)}},jsx(_,props){props.ref.current=canvas;return props}};
 const component=await import(`data:text/javascript;base64,${Buffer.from('const {jsx}=globalThis.__frostFixture;\n'+compiled+`\n//${++id}`).toString('base64')}`);
 const props={effects:[{key:42,hit,ascended}],onImpact:(_,index)=>impacts.push([index,now]),onComplete:()=>completed.push(now)};
 component.MageVoidCollapseVfx(props);for(const effect of effects){const cleanup=effect();if(cleanup)cleanups.push(cleanup)}
 return{impacts,completed,draws,shakes,width,height,
 load(){images.forEach(image=>{image.complete=true;image.onload()})},fail(){images[0].onerror()},watchdog(){[...timers.values()][0]?.()},resize:()=>resize(),pending:()=>frames.size,
 update(next){effects.length=0;refIndex=0;Object.assign(props,next);component.MageVoidCollapseVfx(props);effects[0]()},
 step(time){now=time;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(time))},
 cleanup(){cleanups.forEach(fn=>fn());for(const[k,v]of originals){if(v===undefined)delete globalThis[k];else globalThis[k]=v}}};
}

for (const fallback of [false,true]) for (const mobile of [false,true]) test(`void ${fallback?'2D':'WebGL'} ${mobile?'mobile':'desktop'} contact follows loaded frames and survives resize`,async()=>{
 const p=await playback({fallback,mobile,ascended:true});try {
  p.step(1000);assert.equal(p.impacts.length,0);p.load();p.step(3000);p.step(3719);assert.equal(p.impacts.length,0);
  assert.ok(Math.abs(p.draws[0][fallback?7:3]-p.width*.18*3.2*1.45)<.001,'ascended artwork keeps its larger scale on both viewports');
  p.step(3720);p.resize();p.step(3720);assert.deepEqual(p.impacts,[[0,3720]]);assert.equal(p.shakes.length,1);
  p.step(4560);assert.equal(p.completed.length,1);assert.equal(p.pending(),0);
 } finally {p.cleanup()}
});
test('miss closes rift without blast or shake, and still publishes miss',async()=>{
 const p=await playback({hit:false});try {p.load();for(const at of [0,360,719,720,850,1560])p.step(at);
 assert.deepEqual(p.impacts,[[0,720]]);assert.equal(p.shakes.length,0);assert.ok(p.draws.every(d=>d[7][1]<.5));assert.equal(p.completed.length,1);
 }finally{p.cleanup()}
});
test('reduced motion and failed art settle once without camera shake',async()=>{
 for(const mode of ['reduced','fail','watchdog']){const p=await playback({reduced:mode==='reduced'});try {
 if(mode==='reduced'){p.load();p.step(0);p.step(180)}else{p[mode]();p[mode]()}
 assert.equal(p.impacts.length,1);assert.equal(p.completed.length,1);assert.equal(p.shakes.length,0);
 }finally{p.cleanup()}}
});
test('real atlas is transparent with all 24 padded cells and correct phases',async()=>{
 const meta=await sharp(new URL(`../public${VOID_ART}`,import.meta.url).pathname).metadata();assert.equal(meta.hasAlpha,true);
 assert.equal(meta.width/6,meta.height/4);for(let i=0;i<24;i++){const uv=voidUv(i,meta.width,meta.height);assert.ok(uv[0]+uv[2]<=1&&uv[1]+uv[3]<=1)}
 assert.equal(voidFrame(359),5);assert.equal(voidFrame(719),11);assert.equal(voidFrame(720),12);assert.equal(voidFrame(1560),23);
});

for(const fallback of [false,true])test(`ascended ${fallback?'Canvas':'WebGL'} uses independent 36 frames and one fixed-center detonation`,async()=>{
 const p=await playback({fallback,ascended:true});try{p.load();p.step(0);assert.equal(p.draws[0][0].src,VOID_ASCENDED_ART);
 p.step(720);assert.deepEqual(p.impacts,[[0,720]]);assert.equal(p.shakes.length,1);assert.equal(p.draws.length,2);
 p.step(1560);assert.equal(p.completed.length,1);
 }finally{p.cleanup()}
});
test('ascended miss remains on contracted frame and never paints explosion',async()=>{
 const p=await playback({ascended:true,hit:false});try{p.load();p.step(0);p.step(719);p.step(720);p.step(850);p.step(1560);
 assert.deepEqual(p.impacts,[[0,720]]);assert.equal(p.shakes.length,0);assert.ok(p.draws.every(d=>d[7][1]<.5));
 }finally{p.cleanup()}
});
test('HD atlas pages have native 512px alpha cells, transparent gutters and unchanged contact time',async()=>{
 assert.equal(VOID_ASCENDED_PAGES.length,3);
 for(const path of VOID_ASCENDED_PAGES){
  const file=new URL(`../public${path}`,import.meta.url).pathname;
  const meta=await sharp(file).metadata();assert.equal(meta.hasAlpha,true);
  assert.equal(meta.width,2048);assert.equal(meta.height,1536);
  const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(let i=0;i<12;i++)for(let y=0;y<512;y++)for(let x=0;x<512;x++){
   if(x>=36&&x<476&&y>=36&&y<476)continue;
   const alpha=data[((Math.floor(i/4)*512+y)*info.width+(i%4)*512+x)*4+3];
   assert.equal(alpha,0,`${path} frame ${i+1} spills into its transparent gutter`);
  }
  for(let i=0;i<36;i++){const uv=voidUv(i,meta.width,meta.height,true);assert.ok(uv[0]+uv[2]<=1&&uv[1]+uv[3]<=1)}
 }
 assert.deepEqual(VOID_ASCENDED_ANCHORS,Array.from({length:36},()=>[.5,.5]));
 assert.equal(voidAscendedFrame(719),17);assert.equal(voidAscendedFrame(720),18);assert.equal(voidAscendedFrame(959),23);assert.equal(voidAscendedFrame(1260),30);assert.equal(voidAscendedFrame(1559),35);
});
for(const fallback of [false,true])test(`HD ${fallback?'Canvas':'WebGL'} selects the correct atlas page at both boundaries`,async()=>{
 const p=await playback({fallback,ascended:true});try{
  p.load();for(const time of [0,479,480,719,720,959,960,1259,1260,1559]){
   p.step(time);const frame=voidAscendedFrame(time),draw=p.draws.at(-1);
   assert.equal(draw[0].src,VOID_ASCENDED_PAGES[Math.floor(frame/12)]);
   const uv=voidUv(frame,1536,1024,true);
   if(!fallback)assert.deepEqual(draw[7],uv);
   else{assert.equal(draw[1],uv[0]*1536);assert.equal(draw[2],uv[1]*1024)}
  }
  assert.deepEqual(p.impacts,[[0,720]]);p.step(1560);assert.equal(p.completed.length,1);
 }finally{p.cleanup()}
});
