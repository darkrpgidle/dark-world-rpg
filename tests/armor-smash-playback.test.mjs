import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const current=readFileSync('app/webgl-armor-smash-vfx.tsx','utf8');
let serial=0;
async function playback({source=current,fallback=false,hit=true,enhanced=false,ascended=false,reduced=false,mobile=false}={}){
 const keys=['window','Image','ResizeObserver','requestAnimationFrame','cancelAnimationFrame','__smashFixture'],original=new Map(keys.map(k=>[k,globalThis[k]]));
 const effects=[],cleanups=[],frames=new Map(),images=[],draws=[],completed=[];let next=0;
 const width=mobile?360:972,height=390,player={left:mobile?12:120,top:15,width:mobile?112:178,height:mobile?158:270},enemy={left:mobile?236:676,top:19,width:mobile?112:178,height:mobile?158:270};
 const ctx={setTransform(){},clearRect(){},drawImage(...args){draws.push({asset:args[0].src,box:args.slice(5),frame:Math.floor(args[1]/512)+Math.floor(args[2]/512)*5,alpha:this.globalAlpha})},beginPath(){},arc(){},stroke(){}};
 const stage={querySelector:s=>({getBoundingClientRect:()=>s.includes('player')?player:enemy})};
 const canvas={getBoundingClientRect:()=>({left:0,top:0,width,height}),closest:()=>stage,getContext:()=>ctx,addEventListener(){},removeEventListener(){}};
 globalThis.window={devicePixelRatio:1,matchMedia:()=>({matches:reduced})};globalThis.Image=class{constructor(){images.push(this);this.naturalWidth=2560;this.naturalHeight=1024;this.complete=true}};
 globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.requestAnimationFrame=fn=>{frames.set(++next,fn);return next};globalThis.cancelAnimationFrame=id=>frames.delete(id);
 globalThis.__smashFixture={useRef:current=>({current}),useState:()=>[fallback,()=>{}],useEffect:fn=>effects.push(fn),WebGLVfxRenderer:class{gl={isContextLost:()=>false};resize(){}clear(){}dispose(){}ring(){}sprite(image,x,y,w,h,alpha,_,uv){draws.push({asset:image.src,box:[x,y,w,h],frame:Math.floor(uv[0]*2560/512)+Math.floor(uv[1]*1024/512)*5,alpha})}},jsx(type,props){if(typeof type==='function')return type(props);if(props.ref)props.ref.current=canvas;return props}};
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.React,jsxFactory:'jsx'}}).outputText.replace(/import\s*\{([^}]+)\}\s*from\s*"[^"]+";/g,(_,names)=>`const {${names}}=globalThis.__smashFixture;`);
 const m=await import(`data:text/javascript;base64,${Buffer.from('const {jsx}=globalThis.__smashFixture;\n'+code+`\n//${serial++}`).toString('base64')}`);
 m.WebGLArmorSmashVfx({effectKey:7,hit,enhanced,ascended,onComplete:k=>completed.push(k)});effects.forEach(fn=>{const c=fn();if(c)cleanups.push(c)});images.forEach(i=>i.onload?.());
 return{images,draws,completed,step(t){draws.length=0;const todo=[...frames.values()];frames.clear();todo.forEach(fn=>fn(t));return structuredClone(draws)},cleanup(){cleanups.forEach(fn=>fn());for(const[k,v]of original){if(v===undefined)delete globalThis[k];else globalThis[k]=v}}};
}
for(const fallback of [false,true])for(const mobile of [false,true])for(const ascended of [false,true])test(`remade armor ${fallback?'Canvas':'WebGL'} ${mobile?'mobile':'desktop'} ${ascended?'gold':'red'} keeps exact existing travel and timing`,async()=>{
 const p=await playback({fallback,mobile,ascended});try{
  assert.equal(p.images[0].src,`/vfx/armor-smash-v2/${ascended?'ascended':'normal'}.webp`);
  const playerX=(mobile?12:120)+(mobile?112:178)*.72,playerY=15+(mobile?158:270)*.48,enemyX=(mobile?236:676)+(mobile?112:178)*.52,enemyY=19+(mobile?158:270)*.5;
  const size=Math.min((mobile?112:178)*1.68,(mobile?158:270)*1.04,390*.92);
  p.step(1000);for(let frame=0;frame<10;frame++){
   const elapsed=frame*96+1,d=p.step(1000+elapsed)[0],travel=Math.min(1,elapsed/(96*3.15));
   assert.equal(d.frame,frame);assert.ok(Math.abs(d.box[0]+size/2-playerX-(enemyX-playerX)*travel)<1e-8);
   assert.ok(Math.abs(d.box[1]+size/2-playerY-(enemyY-playerY)*travel+Math.sin(travel*Math.PI)*(mobile?158:270)*.12)<1e-8);
   assert.equal(d.box[2],size);assert.equal(d.box[3],size);
  }
  p.step(1960);assert.deepEqual(p.completed,[7]);
 }finally{p.cleanup()}
});
test('miss shows only four swing cells and finishes at existing 610ms; reduced motion retains static cell',async()=>{
 for(const fallback of [false,true])for(const ascended of [false,true]){
  const p=await playback({fallback,ascended,hit:false});try{p.step(1000);for(const t of [1100,1300,1400,1500]){p.step(t);assert.ok(p.draws.every(d=>d.frame<=3))}p.step(1610);assert.deepEqual(p.completed,[7]);}finally{p.cleanup()}
  const q=await playback({fallback,ascended,reduced:true});try{q.step(1000);assert.equal(q.draws[0].frame,6);q.step(1360);assert.deepEqual(q.completed,[7]);}finally{q.cleanup()}
 }
});
test('ascended art is selected even when repeated armor-break bonus did not trigger',async()=>{
 const p=await playback({ascended:true,enhanced:false});try{p.step(1000);p.step(1480);assert.equal(p.draws.length,1);assert.match(p.draws[0].asset,/ascended.webp$/)}finally{p.cleanup()}
});
