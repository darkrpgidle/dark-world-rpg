import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {emptyOverloadVisual,updateOverloadVisual,overloadUv,overloadGeometry,OVERLOAD_ART} from '../app/arcane-overload-frames.ts';
const snap=(extra={})=>({owner:'battle',enabled:true,phase:'idle',charge:0,remaining:0,stability:0,ascended:false,expiresAt:0,...extra});
test('real charge counts and unchanged snapshots do not restart animation',()=>{
 const v=updateOverloadVisual(emptyOverloadVisual(),snap({charge:2}),1000);assert.equal(v.charge,2);
 assert.equal(updateOverloadVisual(v,snap({charge:2}),1100),v);
 const active=updateOverloadVisual(v,snap({phase:'overloaded',remaining:3}),1200);assert.equal(active.activatedAt,1200);
 const repeat=updateOverloadVisual(active,snap({phase:'overloaded',remaining:3}),1400);assert.equal(repeat,active);assert.equal(repeat.consumedAt,0);
 const used=updateOverloadVisual(active,snap({phase:'overloaded',remaining:2}),1500);assert.equal(used.consumedSlot,2);assert.equal(used.consumedAt,1500);
});
test('third success enters actual exhaustion, expiry clears it and new owner or unequipping cannot retain old aura',()=>{
 const active=updateOverloadVisual(emptyOverloadVisual(),snap({phase:'overloaded',remaining:1,ascended:true,stability:6}),1000);
 const exhausted=updateOverloadVisual(active,snap({phase:'exhausted',ascended:true,expiresAt:7000}),2000);
 assert.equal(exhausted.remaining,0);assert.equal(exhausted.exhaustedAt,2000);assert.equal(exhausted.stability,6);
 const expired=updateOverloadVisual(exhausted,snap({phase:'exhausted',expiresAt:7000}),7000);assert.equal(expired.phase,'idle');assert.equal(expired.clearedAt,7000);
 const newOwner=updateOverloadVisual(active,snap({owner:'boss',charge:1}),2000);assert.equal(newOwner.activatedAt,0);assert.equal(newOwner.stability,0);
 assert.deepEqual(updateOverloadVisual(active,snap({enabled:false}),2000),emptyOverloadVisual());
});
test('all generated irregular cells have bounded padded UVs and glyphs use their separate source widths',()=>{
 for(let i=0;i<31;i++){const[x,y,w,h]=overloadUv(i);assert.ok(x>=0&&y>=0&&x+w<=1&&y+h<=1)}
 assert.ok(overloadUv(27)[2]<overloadUv(24)[2]);
});
const source=readFileSync(new URL('../app/mage-arcane-overload-vfx.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.React,jsxFactory:'jsx'}}).outputText.replace(/import\s*\{([^}]+)\}\s*from\s*"[^"]+";/g,(_,names)=>`const {${names}}=globalThis.__overloadFixture;`);
let serialImport=0;
async function playback({mobile=false,fallback=false,reduced=false}={}){
 const globals=['window','Image','ResizeObserver','requestAnimationFrame','cancelAnimationFrame','__overloadFixture'];const originals=new Map(globals.map(k=>[k,globalThis[k]])),originalNow=Date.now;
 const width=mobile?360:972,height=mobile?280:390,player={left:width*.12,top:20,width:width*.18,height:height*.7};
 const frames=new Map(),timers=new Map(),draws=[],images=[],effects=[],cleanups=[];let serial=0,now=1000,refs=[],refIndex=0,resize;
 const stage={querySelector(){return{getBoundingClientRect:()=>player}}};
 const context={globalAlpha:1,setTransform(){},clearRect(){},drawImage(...args){draws.push({dx:args[5],dy:args[6],dw:args[7],dh:args[8],uv:[args[1]/1536,args[2]/1024,args[3]/1536,args[4]/1024]})}};
 const canvas={clientWidth:width,clientHeight:height,getBoundingClientRect:()=>({left:0,top:0,width,height}),closest:()=>stage,getContext:()=>context,addEventListener(){},removeEventListener(){}};
 Date.now=()=>now;globalThis.window={devicePixelRatio:1,matchMedia:()=>({matches:reduced}),setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,ms});return id},clearTimeout(id){timers.delete(id)}};
 globalThis.Image=class{constructor(){images.push(this);this.complete=false;this.naturalWidth=1536;this.naturalHeight=1024}};
 globalThis.ResizeObserver=class{constructor(fn){resize=fn}observe(){}disconnect(){}};
 globalThis.requestAnimationFrame=fn=>{const id=++serial;frames.set(id,fn);return id};globalThis.cancelAnimationFrame=id=>frames.delete(id);
 globalThis.__overloadFixture={OVERLOAD_ART,overloadUv,overloadGeometry,useRef(value){return refs[refIndex++]??={current:value}},useState:()=>[fallback,()=>{}],useEffect:fn=>effects.push(fn),jsx(_,props){props.ref.current=canvas;return props},WebGLVfxRenderer:class{gl={isContextLost:()=>false};resize(){}clear(){}dispose(){}sprite(image,dx,dy,dw,dh,alpha,add,uv){draws.push({dx,dy,dw,dh,uv})}}};
 const mod=await import(`data:text/javascript;base64,${Buffer.from('const {jsx}=globalThis.__overloadFixture;\n'+compiled+`\n//${++serialImport}`).toString('base64')}`);
 let visual=updateOverloadVisual(emptyOverloadVisual(),snap({phase:'overloaded',remaining:3,stability:6,ascended:true}),1000);
 mod.MageArcaneOverloadVfx({visual});effects.forEach(fn=>{const c=fn();if(c)cleanups.push(c)});
 return{draws,player,load(){images[0].complete=true;images[0].onload()},step(at){now=at;draws.length=0;const fs=[...frames.values()];frames.clear();fs.forEach(fn=>fn())},update(extra){effects.length=0;refIndex=0;visual=updateOverloadVisual(visual,snap(extra),now);mod.MageArcaneOverloadVfx({visual});effects[0]()},resize:()=>resize(),pending:()=>frames.size,timers,
 cleanup(){cleanups.forEach(fn=>fn());Date.now=originalNow;for(const[k,v]of originals){if(v===undefined)delete globalThis[k];else globalThis[k]=v}}};
}
for(const mobile of [false,true])for(const fallback of [false,true])test(`${mobile?'mobile':'desktop'} ${fallback?'Canvas':'WebGL'} flames stay outside both portrait borders, with correct three runes and six stability marks`,async()=>{
 const p=await playback({mobile,fallback});try{p.load();p.step(1600);
 const [left,right]=p.draws;assert.ok(left.dx+left.dw<p.player.left);assert.ok(right.dx>p.player.left+p.player.width);
 assert.equal(p.draws.filter(d=>Math.abs(d.uv[0]-overloadUv(27)[0])<1e-8 && Math.abs(d.uv[1]-overloadUv(27)[1])<1e-8).length,3);
 assert.equal(p.draws.filter(d=>Math.abs(d.uv[0]-overloadUv(28)[0])<1e-8 && Math.abs(d.uv[1]-overloadUv(28)[1])<1e-8).length,6);
 p.update({phase:'overloaded',remaining:2,ascended:true,stability:6});p.step(1900);
 assert.equal(p.draws.filter(d=>Math.abs(d.uv[0]-overloadUv(27)[0])<1e-8 && Math.abs(d.uv[1]-overloadUv(27)[1])<1e-8).length,2);
 p.resize();p.step(1900);assert.ok(p.draws[0].dx+p.draws[0].dw<p.player.left);
 p.update({enabled:false});p.step(2000);assert.equal(p.draws.length,0);assert.equal(p.pending(),0);
 }finally{p.cleanup()}
});
test('reduced motion renders static overload and exhaustion expiry clears flames without perpetual RAF',async()=>{
 const p=await playback({reduced:true});try{p.load();p.step(1000);assert.equal(p.pending(),0);
 p.update({phase:'exhausted',expiresAt:2000,ascended:true});p.step(1500);assert.equal(p.pending(),0);assert.ok(p.timers.size>0);
 p.resize();p.step(2000);assert.equal(p.draws.length,0);
 }finally{p.cleanup()}
});
