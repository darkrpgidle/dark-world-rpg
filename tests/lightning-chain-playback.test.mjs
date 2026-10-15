import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import sharp from 'sharp';
import {LIGHTNING_ART,LIGHTNING_CONTACTS,lightningDuration,lightningUv,lightningAmounts} from '../app/lightning-chain-frames.ts';
const source=readFileSync(new URL('../app/mage-lightning-chain-vfx.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.React,jsxFactory:'jsx'}}).outputText.replace(/import\s*\{([^}]+)\}\s*from\s*"[^"]+";/g,(_,names)=>`const {${names}}=globalThis.__frostFixture;`);
let id=0;
async function playback({fallback=false,reduced=false,hit=true,ascended=false,mobile=false,paralysisExpiresAt=undefined,segments=undefined}={}) {
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
 globalThis.__frostFixture={LIGHTNING_ART,LIGHTNING_CONTACTS,lightningDuration,lightningUv,
  useRef(value){return refs[refIndex++]??= {current:value}},useState:()=>[fallback,()=>{}],useEffect:fn=>effects.push(fn),
  WebGLVfxRenderer:class{gl={isContextLost:()=>false};resize(){}clear(){}dispose(){}sprite(...args){draws.push(args)}},jsx(_,props){props.ref.current=canvas;return props}};
 const component=await import(`data:text/javascript;base64,${Buffer.from('const {jsx}=globalThis.__frostFixture;\n'+compiled+`\n//${++id}`).toString('base64')}`);
 const props={effects:[{key:42,ascended,segments:segments??Array.from({length:ascended?4:3},()=>({hit,critical:false,damagePercent:hit?100:0}))}],paralysisExpiresAt,onImpact:(_,index)=>impacts.push([index,now]),onComplete:()=>completed.push(now)};
 component.MageLightningChainVfx(props);for(const effect of effects){const cleanup=effect();if(cleanup)cleanups.push(cleanup)}
 return{impacts,completed,draws,shakes,width,height,
 load(){images.forEach(image=>{image.complete=true;image.onload()})},fail(){images[0].onerror()},watchdog(){[...timers.values()][0]?.()},resize:()=>resize(),pending:()=>frames.size,
 update(next){effects.length=0;refIndex=0;Object.assign(props,next);component.MageLightningChainVfx(props);effects[0]()},
 step(time){now=time;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(time))},
 cleanup(){cleanups.forEach(fn=>fn());for(const[k,v]of originals){if(v===undefined)delete globalThis[k];else globalThis[k]=v}}};
}

for(const fallback of [false,true])test(`${fallback?'Canvas':'WebGL'} lightning publishes each contact once after assets are loaded`,async()=>{
 const p=await playback({fallback,ascended:true});try{
 p.step(1000);assert.equal(p.impacts.length,0);p.load();p.step(3000);p.step(3199);assert.deepEqual(p.impacts,[]);
 for(const at of [3200,3350,3500,3800]){p.step(at);p.resize();p.step(at)}
 assert.deepEqual(p.impacts,[[0,3200],[1,3350],[2,3500],[3,3800]]);p.step(4100);assert.equal(p.completed.length,1);assert.equal(p.shakes.length,1);assert.equal(p.pending(),0);
 }finally{p.cleanup()}
});
test('missed normal chains avoid contact cells and report three separate misses',async()=>{
 const p=await playback({hit:false});try{p.load();for(const at of [0,200,350,500])p.step(at);
 assert.deepEqual(p.impacts,[[0,200],[1,350],[2,500]]);assert.equal(p.shakes.length,0);
 assert.ok(p.draws.every(d=>d[7][1]<.5));p.step(650);assert.equal(p.completed.length,1);
 }finally{p.cleanup()}
});
test('ascended extra miss retains ring but does not paint an explosion or shake',async()=>{
 const segments=Array.from({length:4},(_,i)=>({hit:i<3,critical:false,damagePercent:i<3?100:0}));
 const p=await playback({ascended:true,segments});try{p.load();p.step(0);p.step(520);p.step(640);const count=p.draws.length;p.step(800);
 assert.equal(p.draws.length,count);assert.equal(p.shakes.length,0);assert.equal(p.impacts.at(-1)[0],3);
 }finally{p.cleanup()}
});
test('reduced motion and failed images release all settled segments exactly once',async()=>{
 for(const mode of ['reduced','fail','watchdog']){const p=await playback({ascended:true,reduced:mode==='reduced'});try{
 if(mode==='reduced'){p.load();p.step(0);p.step(180)}else{p[mode]();p[mode]()}
 assert.deepEqual(p.impacts.map(p=>p[0]),[0,1,2,3]);assert.equal(p.completed.length,1);assert.equal(p.shakes.length,0);
 }finally{p.cleanup()}}
});
test('mobile direct bolt is anchored to both live portraits and pending resize does not restart it',async()=>{
 const p=await playback({mobile:true});try{p.load();p.step(0);p.step(200);const bolt=p.draws.at(-2);
 assert.ok(bolt[3]>p.width*.4);assert.ok(bolt[4]<p.height*.6);p.resize();p.step(350);assert.deepEqual(p.impacts,[[0,200],[1,350]]);
 }finally{p.cleanup()}
});
test('paralysis loops only until actual expiry and new input can stop RAF',async()=>{
 const p=await playback({paralysisExpiresAt:Date.now()+3000});try{p.load();p.step(0);p.update({effects:[]});p.step(1000);assert.equal(p.pending(),1);
 p.update({paralysisExpiresAt:Date.now()-1});const count=p.draws.length;p.step(1100);assert.equal(p.draws.length,count);assert.equal(p.pending(),0);
 }finally{p.cleanup()}
});
test('integer damage allocation preserves total, independent crit weights and misses including overkill',()=>{
 const parts=[{hit:true,damagePercent:100},{hit:false,damagePercent:0},{hit:true,damagePercent:150},{hit:true,damagePercent:80}];
 for(const total of [0,1,12,99999]){const amounts=lightningAmounts(parts,total);assert.equal(amounts.reduce((a,b)=>a+b,0),total);assert.equal(amounts[1],0)}
 assert.deepEqual(lightningAmounts([{hit:false,damagePercent:0}],0),[0]);
});
test('both production atlases are transparent complete 4x4 sheets',async()=>{
 for(const path of Object.values(LIGHTNING_ART)){const meta=await sharp(new URL(`../public${path}`,import.meta.url).pathname).metadata();assert.equal(meta.width,1254);assert.equal(meta.height,1254);assert.equal(meta.hasAlpha,true);
 for(let frame=0;frame<16;frame++){const uv=lightningUv(frame,meta.width,meta.height);assert.ok(uv[0]+uv[2]<=1&&uv[1]+uv[3]<=1)}}
});
