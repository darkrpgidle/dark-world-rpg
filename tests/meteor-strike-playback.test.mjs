import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import sharp from 'sharp';
import {METEOR_ART,METEOR_TIMING,HEAVEN_MAIN_ANCHORS,HEAVEN_BURST_ANCHORS,heavenMeteorFrame,meteorFrame,meteorBurstFrame,meteorFlight,meteorUv,meteorAmounts} from '../app/meteor-strike-frames.ts';
const source=readFileSync(new URL('../app/mage-meteor-strike-vfx.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.React,jsxFactory:'jsx'}}).outputText.replace(/import\s*\{([^}]+)\}\s*from\s*"[^"]+";/g,(_,names)=>`const {${names}}=globalThis.__frostFixture;`);
let id=0;
async function playback({fallback=false,reduced=false,hit=true,ascended=false,mobile=false,burstHit=true,burstEnabled=true}={}) {
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
 globalThis.__frostFixture={METEOR_ART,METEOR_TIMING,HEAVEN_MAIN_ANCHORS,HEAVEN_BURST_ANCHORS,heavenMeteorFrame,meteorFrame,meteorBurstFrame,meteorFlight,meteorUv,
  useRef(value){return refs[refIndex++]??= {current:value}},useState:()=>[fallback,()=>{}],useEffect:fn=>effects.push(fn),
  WebGLVfxRenderer:class{gl={isContextLost:()=>false};resize(){}clear(){}dispose(){}sprite(...args){draws.push(args)}},jsx(_,props){props.ref.current=canvas;return props}};
 const component=await import(`data:text/javascript;base64,${Buffer.from('const {jsx}=globalThis.__frostFixture;\n'+compiled+`\n//${++id}`).toString('base64')}`);
 const props={effects:[{key:42,hit,ascended,afterburst:ascended&&burstEnabled?{hit:burstHit,critical:false,damagePercent:burstHit?120:0}:null}],onImpact:(_,index)=>impacts.push([index,now]),onComplete:()=>completed.push(now)};
 component.MageMeteorStrikeVfx(props);for(const effect of effects){const cleanup=effect();if(cleanup)cleanups.push(cleanup)}
 return{impacts,completed,draws,shakes,width,height,
 load(){images.forEach(image=>{image.complete=true;image.onload()})},fail(){images[0].onerror()},watchdog(){[...timers.values()][0]?.()},resize:()=>resize(),pending:()=>frames.size,
 update(next){effects.length=0;refIndex=0;Object.assign(props,next);component.MageMeteorStrikeVfx(props);effects[0]()},
 step(time){now=time;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(time))},
 cleanup(){cleanups.forEach(fn=>fn());for(const[k,v]of originals){if(v===undefined)delete globalThis[k];else globalThis[k]=v}}};
}


for(const fallback of [false,true])test(`${fallback?'Canvas':'WebGL'} meteor waits for loading then publishes fast impact and ascension exactly once`,async()=>{
 const p=await playback({fallback,ascended:true});try{
 p.step(1000);assert.equal(p.impacts.length,0);p.load();p.step(3000);p.step(3239);assert.equal(p.impacts.length,0);
 p.step(3379);assert.equal(p.impacts.length,0);p.step(3380);p.resize();p.step(3380);
 assert.deepEqual(p.impacts,[[0,3380]]);p.step(3659);p.step(3660);p.step(4100);
 assert.deepEqual(p.impacts,[[0,3380],[1,3660]]);assert.equal(p.completed.length,1);assert.equal(p.shakes.length,2);assert.equal(p.shakes[0].duration,360);assert.equal(p.pending(),0);
 }finally{p.cleanup()}
});
test('missed meteor passes through without explosion or shake but still publishes miss contact',async()=>{
 const p=await playback({hit:false});try{p.load();for(const at of [0,240,379,380,460])p.step(at);
 assert.deepEqual(p.impacts,[[0,380]]);assert.equal(p.shakes.length,0);
 assert.ok(p.draws.every(d=>d[7][1]<.5));p.step(1040);assert.equal(p.completed.length,1);
 }finally{p.cleanup()}
});
test('missed ascension dissolves gathering rune instead of painting a bonus explosion',async()=>{
 const p=await playback({ascended:true,burstHit:false});try{p.load();for(const at of [0,380,460,659])p.step(at);
 const count=p.draws.filter(d=>d[0].src===METEOR_ART.ascended).length;p.step(660);
 assert.equal(p.draws.filter(d=>d[0].src===METEOR_ART.ascended).length,count);assert.equal(p.shakes.length,1);
 assert.deepEqual(p.impacts,[[0,380],[1,660]]);
 }finally{p.cleanup()}
});
test('reduced motion, image failure and load timeout settle both existing results once without shaking',async()=>{
 for(const mode of ['reduced','fail','watchdog']){const p=await playback({ascended:true,reduced:mode==='reduced'});try{
 if(mode==='reduced'){p.load();p.step(0);p.step(180)}else{p[mode]();p[mode]()}
 assert.deepEqual(p.impacts.map(x=>x[0]),[0,1]);assert.equal(p.completed.length,1);assert.equal(p.shakes.length,0);
 }finally{p.cleanup()}}
});
test('mobile summon originates above and right of actual enemy and resize does not restart contact',async()=>{
 const p=await playback({mobile:true});try{p.load();p.step(0);const first=p.draws[0];
 assert.ok(first[1]+first[3]/2>p.width*.77);assert.ok(first[2]+first[4]/2<10+p.height*.7*.48);
 p.step(380);p.resize();p.step(380);assert.deepEqual(p.impacts,[[0,380]]);assert.ok(p.shakes[0].keyframes[2].transform.includes('8px'));
 p.update({effects:[]});p.step(400);assert.equal(p.pending(),0);
 }finally{p.cleanup()}
});
test('accelerated fall traverses only 140ms and damage splitting conserves overkill totals',()=>{
 const from={x:200,y:0},to={x:100,y:200};assert.deepEqual(meteorFlight(from,to,240).x,200);
 assert.equal(meteorFlight(from,to,310).y,50);assert.equal(meteorFlight(from,to,380).y,200);
 for(const total of [0,1,12,99999]){const a=meteorAmounts(total,620,{hit:true,critical:false,damagePercent:120});assert.equal(a[0]+a[1],total)}
 assert.deepEqual(meteorAmounts(10,500,{hit:false,critical:false,damagePercent:0}),[10,0]);
});
test('both alpha atlases retain complete cells without sampling neighboring frames',async()=>{
 for(const [kind,path]of Object.entries(METEOR_ART)){const meta=await sharp(new URL(`../public${path}`,import.meta.url).pathname).metadata();assert.equal(meta.width,1536);assert.equal(meta.height,1024);assert.equal(meta.hasAlpha,true);
 for(let f=0;f<(kind==='ascended'?12:24);f++){const uv=meteorUv(f,meta.width,meta.height,kind==='ascended');assert.ok(uv[0]+uv[2]<=1&&uv[1]+uv[3]<=1)}}
});
test('a late successful atlas load restores later casts after the loading watchdog',async()=>{
 const p=await playback();try{
 p.watchdog();assert.deepEqual(p.impacts,[[0,0]]);
 p.update({effects:[{key:43,hit:true,afterburst:null}]});p.load();p.step(1000);p.step(1380);
 assert.deepEqual(p.impacts,[[0,0],[0,1380]]);assert.equal(p.shakes.length,1);
 }finally{p.cleanup()}
});

for(const fallback of [false,true])test(`${fallback?'Canvas':'WebGL'} ascended primary uses new art even without afterburst`,async()=>{
 const p=await playback({fallback,ascended:true,burstEnabled:false});try{
 p.load();p.step(0);assert.equal(p.draws[0][0].src,METEOR_ART.ascendedMain);
 p.step(240);assert.equal(p.draws.at(-1)[0].src,METEOR_ART.ascendedMain);
 p.step(380);p.step(1040);assert.deepEqual(p.impacts,[[0,380]]);assert.equal(p.completed.length,1);
 }finally{p.cleanup()}
});
test('heavenfire frame stages preserve ordinary charge, flight and contact timing',()=>{
 assert.equal(heavenMeteorFrame(239),5);assert.equal(heavenMeteorFrame(240),6);assert.equal(heavenMeteorFrame(379),11);assert.equal(heavenMeteorFrame(380),12);
 assert.equal(heavenMeteorFrame(680),18);assert.equal(heavenMeteorFrame(1039),23);
});
