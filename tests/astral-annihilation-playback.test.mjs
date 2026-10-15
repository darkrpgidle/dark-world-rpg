import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import sharp from 'sharp';
import {ASTRAL_ART,ASTRAL_PAGES,astralAtlasIndex,astralPage,astralSky,ASTRAL_STAR_ART,ASTRAL_CORE_ANCHORS,ASTRAL_TIMING,astralStarsAt,astralContact,astralUv,ASTRAL_STAR_POSITIONS,astralStarPosition} from '../app/astral-annihilation-frames.ts';
const source=readFileSync(new URL('../app/mage-astral-annihilation-vfx.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.React,jsxFactory:'jsx'}}).outputText.replace(/import\s*\{([^}]+)\}\s*from\s*"[^"]+";/g,(_,names)=>`const {${names}}=globalThis.__frostFixture;`);
let id=0;
async function playback({fallback=false,reduced=false,hit=true,ascended=false,mobile=false}={}) {
 const keys=['window','Image','ResizeObserver','requestAnimationFrame','cancelAnimationFrame','__frostFixture'];
 const originals=new Map(keys.map(k=>[k,globalThis[k]]));
 const frames=new Map(),timers=new Map(),effects=[],cleanups=[],images=[],draws=[],rotations=[],shakes=[],impacts=[],completed=[];
 let serial=0,now=0,resize,refs=[],refIndex=0;
 const width=mobile?360:972,height=mobile?280:390;
 const context={save(){},restore(){},translate(x,y){this.tx=x;this.ty=y},rotate(angle){this.angle=angle},setTransform(){},clearRect(){},drawImage(...args){draws.push(args);rotations.push(this.angle)}};
 const stage={clientWidth:width,clientHeight:height,getBoundingClientRect:()=>({left:0,top:0,width,height}),querySelector(selector){const player=selector.includes('player');return{getBoundingClientRect:()=>({left:width*(player?.12:.68),top:10,width:width*.18,height:height*.7})}},animate(keyframes,options){if(keyframes[0].transform)shakes.push({keyframes,...options});return{cancel(){}}}};
 const canvas={clientWidth:width,clientHeight:height,getBoundingClientRect:()=>({left:0,top:0,width,height}),closest:()=>stage,getContext:()=>context,addEventListener(){},removeEventListener(){}};
 globalThis.window={devicePixelRatio:1,matchMedia:()=>({matches:reduced}),setTimeout(fn){const k=++serial;timers.set(k,fn);return k},clearTimeout(k){timers.delete(k)}};
 globalThis.Image=class {constructor(){images.push(this);this.complete=false;this.naturalWidth=512;this.naturalHeight=512} set src(path){this.path=path;if(Object.values(ASTRAL_PAGES).some(pages=>pages.includes(path))){this.naturalWidth=2048;this.naturalHeight=1024}else if(path.includes("tail")){this.naturalWidth=768;this.naturalHeight=256}else if(path.includes("normal-core")){this.naturalWidth=768;this.naturalHeight=768}} get src(){return this.path}};
 globalThis.ResizeObserver=class{constructor(fn){resize=fn}observe(){}disconnect(){}};
 globalThis.requestAnimationFrame=fn=>{const k=++serial;frames.set(k,fn);return k};globalThis.cancelAnimationFrame=k=>frames.delete(k);
 globalThis.__frostFixture={ASTRAL_ART,ASTRAL_PAGES,astralAtlasIndex,astralPage,astralSky,ASTRAL_STAR_ART,ASTRAL_CORE_ANCHORS,ASTRAL_TIMING,astralStarsAt,astralContact,astralUv,ASTRAL_STAR_POSITIONS,astralStarPosition,
  useRef(value){return refs[refIndex++]??= {current:value}},useState:()=>[fallback,()=>{}],useEffect:fn=>effects.push(fn),
  WebGLVfxRenderer:class{gl={isContextLost:()=>false};resize(){}clear(){}dispose(){}sprite(...args){draws.push(args)}},jsx(_,props){props.ref.current=canvas;return props}};
 const component=await import(`data:text/javascript;base64,${Buffer.from('const {jsx}=globalThis.__frostFixture;\n'+compiled+`\n//${++id}`).toString('base64')}`);
 const props={effectKey:42,ascended,segments:Array.from({length:8},(_,i)=>({hit,critical:false,damagePercent:i===6?600:60})),onImpact:(_,index)=>impacts.push([index,now]),onComplete:()=>completed.push(now)};
 component.MageAstralAnnihilationVfx(props);for(const effect of effects){const cleanup=effect();if(cleanup)cleanups.push(cleanup)}
 return{impacts,completed,draws,rotations,shakes,width,height,
 load(){images.forEach(image=>{image.complete=true;image.onload?.()})},fail(index=0){images[index].onerror()},watchdog(){[...timers.values()][0]?.()},resize:()=>resize(),pending:()=>frames.size,
 update(next){effects.length=0;refIndex=0;Object.assign(props,next);component.MageAstralAnnihilationVfx(props);effects[0]()},
 step(time){now=time;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(time))},
 cleanup(){cleanups.forEach(fn=>fn());for(const[k,v]of originals){if(v===undefined)delete globalThis[k];else globalThis[k]=v}}};
}

for(const fallback of [false,true])for(const mobile of [false,true])test(`astral ${fallback?'2D':'WebGL'} ${mobile?'mobile':'desktop'} beams charge sequentially then impact simultaneously`,async()=>{
 const p=await playback({fallback,mobile});try {
 p.load();p.step(0);for(let i=0;i<6;i++){
 p.draws.length=0;p.step(601+i*120);
 if(!fallback)assert.equal(p.draws.filter(d=>d[0].src===ASTRAL_STAR_ART.normal.core).length,i+1);
 }
 assert.equal(p.impacts.length,0);p.step(1561);p.step(2039);assert.equal(p.impacts.length,0);
 p.step(2040);p.resize();p.step(2040);assert.deepEqual(p.impacts,Array.from({length:6},(_,i)=>[i,2040]));
 p.step(2999);assert.equal(p.impacts.length,6);p.step(3000);assert.deepEqual(p.impacts.at(-1),[6,3000]);
 p.step(3160);p.step(4000);assert.equal(p.completed.length,1);assert.equal(p.impacts.length,8);assert.equal(p.pending(),0);
 }finally{p.cleanup()}
});
test('miss and reduced motion preserve every contact without invented camera impacts',async()=>{
 for(const reduced of [false,true]){const p=await playback({hit:false,reduced});try {
 p.load();for(const time of reduced?[0,300]:[0,2040,3000,3160,4000])p.step(time);
 assert.equal(p.impacts.length,8);assert.equal(p.shakes.length,0);assert.equal(p.completed.length,1);
 }finally{p.cleanup()}}
});
test('image failure and loading timeout publish all settled segments once and unlock completion',async()=>{
 for(const mode of ['fail','watchdog']){const p=await playback();try {p[mode]();p[mode]();assert.equal(p.impacts.length,8);assert.equal(p.completed.length,1);assert.equal(p.shakes.length,0)}finally{p.cleanup()}}
});
test('HD normal and ascended atlas pages preserve alpha and all 24 used frames',async()=>{
 for(const pages of Object.values(ASTRAL_PAGES))for(const path of pages){
  const meta=await sharp(new URL(`../public${path}`,import.meta.url).pathname).metadata();
  assert.equal(meta.hasAlpha,true);assert.equal(meta.width,2048);assert.equal(meta.height,1024);
  for(const i of [0,1,2,3,4,5,...Array.from({length:18},(_,i)=>18+i)]){const uv=astralUv(i,meta.width,meta.height);assert.ok(uv[0]+uv[2]<=1&&uv[1]+uv[3]<=1)}
 }
 assert.equal(astralStarsAt(599),0);assert.equal(astralStarsAt(600),1);assert.equal(astralStarsAt(1200),6);
 assert.equal(astralContact(0),astralContact(5));
});

test('six sphere positions are scattered, all trajectories arrive together at their shared contact',()=>{
 assert.equal(ASTRAL_STAR_POSITIONS.length,6);assert.ok(new Set(ASTRAL_STAR_POSITIONS.map(p=>p[1])).size>=5);
 const target={x:700,y:200};for(let i=0;i<6;i++){
 const [x,y]=ASTRAL_STAR_POSITIONS[i],origin={x:x*1000,y:y*400};
 const start=astralStarPosition(i,ASTRAL_TIMING.fire,true,origin,target,120);assert.deepEqual(start,origin);
 const end=astralStarPosition(i,ASTRAL_TIMING.beamImpact,true,origin,target,120);
 assert.ok(Math.abs(end.x-target.x)<1e-8&&Math.abs(end.y-target.y)<1e-8);
 const miss=astralStarPosition(i,ASTRAL_TIMING.beamImpact,false,origin,target,120);assert.notDeepEqual(miss,target);
 }
});

 test('dedicated normal and ascended layers have transparent borders and high resolution',async()=>{
 for(const parts of Object.values(ASTRAL_STAR_ART))for(const path of Object.values(parts)){
  const {data,info}=await sharp(new URL(`../public${path}`,import.meta.url).pathname).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.ok(info.width>=512);assert.ok(info.height>=256);
  const alpha=(x,y)=>data[(y*info.width+x)*4+3];
  for(let x=0;x<info.width;x++){assert.equal(alpha(x,0),0);assert.equal(alpha(x,info.height-1),0)}
  for(let y=0;y<info.height;y++){assert.equal(alpha(0,y),0);assert.equal(alpha(info.width-1,y),0)}
  assert.ok(data.some((value,index)=>index%4===3&&value>100));
 }
});
 test('ascended both backends keep six separate cores and identical callbacks',async()=>{
 for(const fallback of [false,true]){const p=await playback({ascended:true,fallback});try{
  p.load();p.step(0);p.draws.length=0;p.step(1201);
  assert.equal(p.draws.filter(d=>d[0].src===ASTRAL_STAR_ART.ascended.core).length,6);
  p.step(2040);p.step(3000);p.step(3160);p.step(4000);
  assert.equal(p.impacts.length,8);assert.equal(p.completed.length,1);
 }finally{p.cleanup()}}
});

test('each separate asset failure settles once, even after another image loads late',async()=>{
 for(let index=0;index<6;index++){const p=await playback();try{
  p.fail(index);p.fail(index);p.load();p.step(4000);
  assert.equal(p.impacts.length,8);assert.equal(p.completed.length,1);assert.equal(p.pending(),0);
 }finally{p.cleanup()}}
});

test('HD pages keep transparent 36px gutters and centered late nuclei',async()=>{
 for(const [variant,pages]of Object.entries(ASTRAL_PAGES))for(const path of pages){
  const {data,info}=await sharp(new URL('../public'+path,import.meta.url).pathname).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(let frame=0;frame<8;frame++)for(let y=0;y<512;y++)for(let x=0;x<512;x++){
   if(x>=36&&x<476&&y>=36&&y<476)continue;
   assert.equal(data[((Math.floor(frame/4)*512+y)*info.width+frame%4*512+x)*4+3],0);
  }
  assert.equal(ASTRAL_CORE_ANCHORS[variant].length,18);
  for(const anchor of ASTRAL_CORE_ANCHORS[variant])assert.deepEqual(anchor,[.5,.5]);
 }
});

test('blast and extinction stay pinned to the same enemy point without a size jump',async()=>{
 for(const ascended of [false,true])for(const mobile of [false,true]){
 const p=await playback({ascended,mobile});try{
 p.load();p.step(0);let previousSize;
 for(const time of [3320,3400,3479,3480,3567,3654,3741,3828,3915]){
 p.draws.length=0;p.step(time);
 const draw=p.draws.find(d=>ASTRAL_PAGES[ascended?'ascended':'normal'].includes(d[0].src));assert.ok(draw);
 const [,, ,w,h]=draw;
 if(previousSize)assert.equal(w,previousSize);previousSize=w;assert.equal(w,h);
 const frame=time<3480?24+Math.min(5,Math.floor((time-3000)/80)):30+Math.min(5,Math.floor((time-3480)/87));
 const anchor=ASTRAL_CORE_ANCHORS[ascended?'ascended':'normal'][frame-18];
 assert.ok(Math.abs(draw[1]+w*anchor[0]-p.width*.77)<1e-6);
 assert.ok(Math.abs(draw[2]+h*anchor[1]-(10+p.height*.7*.56))<1e-6);
 }
 }finally{p.cleanup()}}
});

for(const fallback of [false,true])for(const mobile of [false,true])for(const ascended of [false,true])test(`galaxy ${fallback?'Canvas':'WebGL'} ${mobile?'mobile':'desktop'} ${ascended?'ascended':'normal'} rotates continuously without ellipse or moving center`,async()=>{
 const p=await playback({fallback,mobile,ascended});try{
  p.load();p.step(0);let previousAngle=-1;
  for(const time of [600,900,1200,1560,1800,2040,2279]){
   p.draws.length=0;p.rotations.length=0;p.step(time);
   const i=p.draws.findIndex(d=>d[0].src===ASTRAL_ART[ascended?'ascended':'normal']);assert.ok(i>=0);
   const d=p.draws[i],sky=astralSky(time,p.width,p.height);
   assert.equal(d[fallback?7:3],d[fallback?8:4]);assert.equal(d[fallback?7:3],sky.size);
   const angle=fallback?p.rotations[i]:d[8];assert.equal(angle,sky.angle);assert.ok(angle>previousAngle);previousAngle=angle;
   if(!fallback){assert.ok(Math.abs(d[1]+d[3]/2-p.width*.5)<1e-6);assert.ok(Math.abs(d[2]+d[4]/2-sky.y)<1e-6)}
  }
  assert.equal(p.impacts.length,6);
  p.draws.length=0;p.rotations.length=0;p.step(2280);assert.ok(p.draws.every((d,i)=>(fallback?p.rotations[i]:d[8])===0));
 }finally{p.cleanup()}
});

 test('every used logical frame maps to one unique HD cell across page boundaries',()=>{
 const used=[0,1,2,3,4,5,...Array.from({length:18},(_,i)=>18+i)];
 for(const [index,frame]of used.entries()){
  assert.equal(astralAtlasIndex(frame),index);assert.equal(astralPage(frame),Math.floor(index/8));
  assert.deepEqual(astralUv(frame,2048,1024),[(index%4*512+2)/2048,(Math.floor(index%8/4)*512+2)/1024,508/2048,508/1024]);
 }
});

 test('HD contraction and extinction shrink across source-sheet boundaries and finish empty',async()=>{
 for(const pages of Object.values(ASTRAL_PAGES)){
  const raw=await Promise.all(pages.map(path=>sharp(new URL('../public'+path,import.meta.url).pathname).ensureAlpha().raw().toBuffer({resolveWithObject:true})));
  const extent=frame=>{
   const {data,info}=raw[astralPage(frame)],index=astralAtlasIndex(frame)%8,left=index%4*512,top=Math.floor(index/4)*512;
   let minX=512,minY=512,maxX=-1,maxY=-1;
   for(let y=0;y<512;y++)for(let x=0;x<512;x++)if(data[((top+y)*info.width+left+x)*4+3]>16){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y)}
   return maxX<0?0:Math.max(maxX-minX+1,maxY-minY+1);
  };
  for(const frames of [[18,19,20,21,22,23],[28,29,30,31,32,33,34,35]]){
   let previous=Infinity;for(const frame of frames){const size=extent(frame);assert.ok(size<=previous+2,`frame ${frame} grows from ${previous} to ${size}`);previous=size}
  }
  assert.equal(extent(35),0);
 }
});
