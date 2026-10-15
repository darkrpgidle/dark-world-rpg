import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import sharp from 'sharp';
import {FROSTFIRE_ART,FROSTFIRE_TIMING,frostfireArc,frostfireFlightProgress,frostfireFrame,frostfireUv} from '../app/frostfire-nova-frames.ts';
const source=readFileSync(new URL('../app/mage-frostfire-nova-vfx.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.React,jsxFactory:'jsx'}}).outputText.replace(/import\s*\{([^}]+)\}\s*from\s*"[^"]+";/g,(_,names)=>`const {${names}}=globalThis.__frostFixture;`);
let id=0;
async function playback({fallback=false,reduced=false,hit=true,kind='main',mobile=false,statuses={}}={}) {
 const keys=['window','Image','ResizeObserver','requestAnimationFrame','cancelAnimationFrame','__frostFixture'];
 const originals=new Map(keys.map(k=>[k,globalThis[k]]));
 const frames=new Map(),timers=new Map(),effects=[],cleanups=[],images=[],draws=[],shakes=[],impacts=[],completed=[];
 let serial=0,now=0,resize,refs=[],refIndex=0;
 const width=mobile?360:972,height=mobile?280:390;
 const context={save(){},restore(){},translate(x,y){this.tx=x;this.ty=y},rotate(){},setTransform(){},clearRect(){},drawImage(...args){draws.push(args)}};
 const stage={querySelector(selector){const player=selector.includes('player');return{getBoundingClientRect:()=>({left:width*(player?.12:.68),top:10,width:width*.18,height:height*.7})}},animate(_,options){shakes.push(options);return{cancel(){}}}};
 const canvas={clientWidth:width,clientHeight:height,getBoundingClientRect:()=>({left:0,top:0,width,height}),closest:()=>stage,getContext:()=>context,addEventListener(){},removeEventListener(){}};
 globalThis.window={devicePixelRatio:1,matchMedia:()=>({matches:reduced}),setTimeout(fn){const k=++serial;timers.set(k,fn);return k},clearTimeout(k){timers.delete(k)}};
 globalThis.Image=class {constructor(){images.push(this);this.complete=false;this.naturalWidth=1254;this.naturalHeight=1254}};
 globalThis.ResizeObserver=class{constructor(fn){resize=fn}observe(){}disconnect(){}};
 globalThis.requestAnimationFrame=fn=>{const k=++serial;frames.set(k,fn);return k};globalThis.cancelAnimationFrame=k=>frames.delete(k);
 globalThis.__frostFixture={FROSTFIRE_ART,FROSTFIRE_TIMING,frostfireArc,frostfireFlightProgress,frostfireFrame,frostfireUv,
  useRef(value){return refs[refIndex++]??= {current:value}},useState:()=>[fallback,()=>{}],useEffect:fn=>effects.push(fn),
  WebGLVfxRenderer:class{gl={isContextLost:()=>false};resize(){}clear(){}dispose(){}sprite(...args){draws.push(args)}},jsx(_,props){props.ref.current=canvas;return props}};
 const component=await import(`data:text/javascript;base64,${Buffer.from('const {jsx}=globalThis.__frostFixture;\n'+compiled+`\n//${++id}`).toString('base64')}`);
 const props={effects:[{key:42,kind,hit}],statuses,onImpact:()=>impacts.push(now),onComplete:()=>completed.push(now)};
 component.MageFrostfireNovaVfx(props);for(const effect of effects){const cleanup=effect();if(cleanup)cleanups.push(cleanup)}
 return{impacts,completed,draws,shakes,width,height,
 load(){images.forEach(image=>{image.complete=true;image.onload()})},fail(){images[0].onerror()},watchdog(){[...timers.values()][0]?.()},resize:()=>resize(),pending:()=>frames.size,
 update(next){effects.length=0;refIndex=0;Object.assign(props,next);component.MageFrostfireNovaVfx(props);effects[0]()},
 step(time){now=time;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(time))},
 cleanup(){cleanups.forEach(fn=>fn());for(const[k,v]of originals){if(v===undefined)delete globalThis[k];else globalThis[k]=v}}};
}
for(const fallback of [false,true])test(`${fallback?'Canvas':'WebGL'} frostfire waits for images then hits after charge+parabolic flight exactly once`,async()=>{
 const p=await playback({fallback});try{p.step(1000);assert.equal(p.draws.length,0);p.load();p.step(3000);p.step(3279);p.step(4239);assert.deepEqual(p.impacts,[]);
 p.step(4240);assert.deepEqual(p.impacts,[4240]);p.resize();p.resize();assert.equal(p.pending(),1);p.step(4560);assert.deepEqual(p.completed,[4560]);assert.equal(p.shakes.length,1);assert.equal(p.pending(),0);
 }finally{p.cleanup()}
});
test('missed ball never uses impact atlas rows or shakes; reports miss at contact',async()=>{
 const p=await playback({hit:false});try{p.load();p.step(0);p.step(280);p.step(800);p.step(1240);p.step(1380);
 assert.deepEqual(p.impacts,[1240]);assert.equal(p.shakes.length,0);assert.ok(p.draws.every(d=>d[7][1]<.5));p.step(1560);assert.equal(p.completed.length,1);
 }finally{p.cleanup()}
});
for(const kind of ['afterburst','shatter'])test(`${kind} has its own settled-damage impact callback`,async()=>{
 const p=await playback({kind});try{p.load();p.step(0);const impact=kind==='shatter'?100:80,duration=kind==='shatter'?400:360;
 p.step(impact-1);assert.deepEqual(p.impacts,[]);p.step(impact);assert.deepEqual(p.impacts,[impact]);p.step(duration);assert.equal(p.completed.length,1);
 }finally{p.cleanup()}
});
test('failure and slow-load watchdog finish and publish once',async()=>{
 for(const method of ['fail','watchdog']){const p=await playback();try{p[method]();p[method]();assert.equal(p.impacts.length,1);assert.equal(p.completed.length,1)}finally{p.cleanup()}}
});
test('reduced motion shows static contact with no shake or trajectory',async()=>{
 const p=await playback({reduced:true});try{p.load();p.step(0);assert.deepEqual(p.impacts,[0]);assert.equal(p.shakes.length,0);assert.equal(p.draws.length,1);p.step(180);assert.equal(p.completed.length,1)}finally{p.cleanup()}
});
test('mobile orb core stays inside stage and collision is pinned to enemy chest',async()=>{
 const p=await playback({mobile:true});try{p.load();for(const at of [0,280,540,800,900,1020,1130,1239])p.step(at);
 const flight=p.draws.filter(d=>d[7][1]>=.25&&d[7][1]<.5&&d[5]>.5);
 for(const d of flight){const coreX=d[1]+d[3]/2+Math.cos(d[8])*d[3]*.15,coreY=d[2]+d[4]/2+Math.sin(d[8])*d[3]*.15;assert.ok(coreX>0&&coreX<p.width);assert.ok(coreY>d[4]/2)}
 p.step(1240);const d=p.draws.at(-1);assert.ok(Math.abs(d[1]+d[3]/2-p.width*.77)<1e-7);
 }finally{p.cleanup()}
});
test('status refresh preserves ice growth age without a shatter; expired states stop drawing',async()=>{
 const p=await playback({statuses:{freeze:Date.now()+5000}});try{p.load();p.step(0);p.step(240);p.update({effects:[],statuses:{freeze:Date.now()+7000}});p.step(300);
 assert.ok(Math.abs(p.draws.at(-1)[7][0]-(3*.25+2/1254))<1e-7);assert.equal(p.draws.at(-1)[7][1],.25+2/1254);
 p.update({statuses:{}});const before=p.draws.length;p.step(400);assert.equal(p.draws.length,before);assert.equal(p.pending(),0);
 }finally{p.cleanup()}
});
test('production atlases have alpha and complete 16-cell geometry each',async()=>{
 for(const path of Object.values(FROSTFIRE_ART)) {
  const meta=await sharp(new URL(`../public${path}`,import.meta.url).pathname).metadata();assert.equal(meta.width,1254);assert.equal(meta.height,1254);assert.equal(meta.hasAlpha,true);
  for(let frame=0;frame<16;frame++){const uv=frostfireUv(frame,meta.width,meta.height);assert.ok(uv[0]>=0&&uv[1]>=0&&uv[0]+uv[2]<=1&&uv[1]+uv[3]<=1)}
 }
});

test('enlarged orb holds at midpoint then accelerates down without changing impact size',async()=>{
 const p=await playback();try{
 p.load();p.step(0);const charge=p.draws.at(-1);assert.equal(charge[3],200);
 const center=d=>[d[1]+d[3]/2+Math.cos(d[8])*d[3]*.15,d[2]+d[4]/2+Math.sin(d[8])*d[3]*.15];
 p.step(800);const hold=center(p.draws.at(-1));p.step(900);assert.deepEqual(center(p.draws.at(-1)),hold);p.step(1020);assert.deepEqual(center(p.draws.at(-1)),hold);
 p.step(1130);const halfway=center(p.draws.at(-1));p.step(1240);const impact=p.draws.at(-1);assert.equal(impact[3],Math.min(310,p.width*.18*1.55));
 assert.ok(halfway[0]-hold[0] < impact[1]+impact[3]/2-halfway[0]);assert.deepEqual(p.impacts,[1240]);
 }finally{p.cleanup()}
});
