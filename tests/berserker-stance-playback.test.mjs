import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import sharp from 'sharp';
import * as stance from '../app/berserker-stance-frames.ts';
const source=readFileSync('app/webgl-berserker-stance-vfx.tsx','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.React,jsxFactory:'jsx'}}).outputText.replace(/import\s*\{([^}]+)\}\s*from\s*"[^"]+";/g,(_,names)=>`const {${names}}=globalThis.__stanceFixture;`);
let version=0;
async function playback({fallback=false,mobile=false,ascended=true,reduced=false}={}){
 const keys=['window','Image','requestAnimationFrame','cancelAnimationFrame','__stanceFixture'],originals=new Map(keys.map(k=>[k,globalThis[k]]));
 const frames=new Map(),timers=new Map(),effects=[],cleanups=[],draws=[],images=[],classes=new Set();let serial=0,refs=[],refIndex=0;
 const width=mobile?360:972,height=mobile?280:390;
 const player={left:width*.1,top:height*.2,width:width*.18,height:height*.7};
 const enemy={left:width*.7,top:height*.1,width:width*.18,height:height*.65};
 const rect={left:-width*.2,top:-height*.48,width:width*1.4,height:height*1.68};
 const slashLayer={style:{opacity:"0"}},woundLayer={style:{opacity:"0"}};
 const stage={getBoundingClientRect:()=>({left:0,top:0,width,height}),classList:{toggle(k,on){if(on)classes.add(k);else classes.delete(k)},remove:k=>classes.delete(k)},querySelector(selector){return{getBoundingClientRect:()=>selector.includes('player')?player:enemy}}};
 const ctx={save(){},restore(){},setTransform(){},clearRect(){},translate(x,y){this.cx=x;this.cy=y},rotate(angle){this.angle=angle},drawImage(...args){draws.push({asset:args[0],uv:[args[1]/args[0].naturalWidth,args[2]/args[0].naturalHeight,args[3]/args[0].naturalWidth,args[4]/args[0].naturalHeight],cx:this.cx,cy:this.cy,width:args[7],height:args[8],angle:this.angle,alpha:this.globalAlpha})}};
 const canvas={getBoundingClientRect:()=>rect,closest:()=>stage,getContext:()=>ctx,addEventListener(){},removeEventListener(){}};
 globalThis.window={devicePixelRatio:2,matchMedia:()=>({matches:reduced}),setTimeout(fn){const k=++serial;timers.set(k,fn);return k},clearTimeout:k=>timers.delete(k)};
 globalThis.Image=class{constructor(){images.push(this);this.naturalWidth=1024;this.naturalHeight=1024}};
 globalThis.requestAnimationFrame=fn=>{const k=++serial;frames.set(k,fn);return k};globalThis.cancelAnimationFrame=k=>frames.delete(k);
 globalThis.__stanceFixture={...stance,useRef(value){return refs[refIndex++]??={current:value}},useState:()=>[fallback,()=>{}],useEffect:fn=>effects.push(fn),WebGLVfxRenderer:class{gl={isContextLost:()=>false};resize(){}clear(){}dispose(){}sprite(asset,x,y,width,height,alpha,_,uv,angle=0){draws.push({asset,cx:x+width/2,cy:y+height/2,width,height,alpha,uv,angle})}},jsx(_,props){props.ref.current=props.className==='berserker-stance-slash'?slashLayer:props.className==='berserker-stance-wound'?woundLayer:canvas;return props}};
 const module=await import(`data:text/javascript;base64,${Buffer.from('const {jsx}=globalThis.__stanceFixture;\n'+compiled+`\n//${version++}`).toString('base64')}`);
 const props={active:true,ascended,activationKey:1,pulseKey:0,attackKey:0,extensions:0,attackHit:true,attackTarget:"target-1",targetKey:"target-1"};
 module.WebGLBerserkerStanceVfx(props);for(const effect of effects){const cleanup=effect();if(cleanup)cleanups.push(cleanup)}
 const update=patch=>{effects.length=0;refIndex=0;Object.assign(props,patch);module.WebGLBerserkerStanceVfx(props);effects[0]()};
 return{draws,classes,images,player,enemy,rect,update,slashLayer,woundLayer,
 step(time){draws.length=0;const todo=[...frames.values()];frames.clear();if(!todo.length){for(const[k,fn]of timers){timers.delete(k);fn()}}if(todo.length)todo.forEach(fn=>fn(time));else{const more=[...frames.values()];frames.clear();more.forEach(fn=>fn(time))}},
 cleanup(){cleanups.forEach(fn=>fn());assert.equal(woundLayer.style.opacity,"0");assert.equal(frames.size,0);assert.equal(timers.size,0);for(const[k,v]of originals){if(v===undefined)delete globalThis[k];else globalThis[k]=v}}
 };
}
for(const fallback of [false,true])for(const mobile of [false,true])test(`ascended stance ${fallback?'Canvas':'WebGL'} ${mobile?'mobile':'desktop'} keeps one whole spirit, aims right, finishes last attack before fading`,async()=>{
 const p=await playback({fallback,mobile});try{
  p.step(100);p.step(700);assert.equal(p.draws.length,1);assert.equal(p.draws[0].asset.src,stance.ASCENDED_STANCE_ART.state);assert.ok(p.classes.has('berserker-ascended-active'));
  const cx=p.player.left-p.rect.left+p.player.width*.32,cy=p.player.top-p.rect.top+p.player.height*.08;
  p.update({active:false,attackKey:1});p.step(1000);
  for(let frame=0;frame<8;frame++){
   p.step(1000+frame*stance.STANCE_ATTACK_MS/8+1);const ghost=p.draws.find(d=>stance.ASCENDED_STANCE_ART.attack.includes(d.asset.src));assert.ok(ghost);
   assert.equal(ghost.asset.src,stance.ASCENDED_STANCE_ART.attack[Math.floor(frame/4)]);assert.deepEqual(ghost.uv,stance.stanceHdUv(frame));
   assert.equal(ghost.width,ghost.height);assert.equal(ghost.cx,cx);assert.equal(ghost.cy,cy);assert.ok(ghost.alpha<=.64);
   assert.equal(p.draws.length,1,'only the unchanged whole spirit remains on the rear Canvas');
   if(frame>=3){
    const style=p.slashLayer.style;assert.ok(Number(style.opacity)>0);
    const path=stance.stanceSlashPath(p.player,p.enemy),cell=Math.min(3,Math.floor(((frame*stance.STANCE_ATTACK_MS/8+1-155)/465)*4));
    assert.ok(Math.abs(parseFloat(style.left)+parseFloat(style.width)/2-path.x)<1e-6);
    assert.ok(Math.abs(parseFloat(style.top)+parseFloat(style.height)/2-path.y)<1e-6);
    assert.ok(Math.abs(parseFloat(style.transform.slice(7))-path.angle)<1e-12);
    const positions=style.backgroundPosition.split(" ").map(parseFloat);assert.ok(Math.abs(positions[0]+(cell%2*512+2)*path.width/508)<1e-8);assert.ok(Math.abs(positions[1]+(Math.floor(cell/2)*512+2)*path.height/508)<1e-8);
   }
  }
  p.step(1620);assert.equal(p.slashLayer.style.opacity,'0');assert.equal(p.draws.length,1);assert.equal(p.draws[0].asset.src,stance.ASCENDED_STANCE_ART.state);const initial=p.draws[0].alpha;
  p.step(1800);assert.ok(p.draws[0].alpha<initial);p.step(1980);assert.equal(p.draws.length,0);assert.equal(p.classes.size,0);
 }finally{p.cleanup()}
});
test('stance extension pulse uses stronger state without attacking or restarting stance',async()=>{
 const p=await playback();try{p.step(100);p.step(700);const before=p.draws[0].alpha;p.update({pulseKey:2,extensions:3});p.step(710);
 assert.equal(p.draws.length,1);assert.equal(p.draws[0].asset.src,stance.ASCENDED_STANCE_ART.state);assert.deepEqual(p.draws[0].uv,stance.stanceHdUv(2));assert.ok(p.draws[0].alpha>before);
 }finally{p.cleanup()}
});
test('reduced motion uses static whole spirit and never draws traveling slash',async()=>{
 for(const fallback of [false,true]){const p=await playback({fallback,reduced:true});try{p.step(100);p.update({attackKey:1});p.step(700);for(const t of [701,950,1200]){p.step(t);assert.equal(p.draws.length,1);assert.equal(p.slashLayer.style.opacity,'0');assert.deepEqual(p.draws[0].uv,stance.stanceHdUv(3))}}finally{p.cleanup()}}
});
test('missing HD assets do not block prop updates, fade, or cleanup',async()=>{
 const p=await playback();try{p.images.forEach(i=>{i.naturalWidth=0});p.step(100);p.update({active:false,attackKey:1});for(const t of [1000,1620,1980])p.step(t);assert.equal(p.draws.length,0);assert.equal(p.slashLayer.style.opacity,'0');assert.equal(p.classes.size,0)}finally{p.cleanup()}
});
test('normal stance still loads and draws the existing fire artwork',async()=>{
 const p=await playback({ascended:false});try{p.step(100);p.step(700);assert.ok(p.draws.length>0);assert.ok(p.images.filter(i=>i.src).every(i=>i.src.startsWith('/vfx/berserker-stance-v2/normal-')));assert.equal(p.classes.size,0);
 p.update({attackKey:1});p.step(1000);assert.equal(p.draws.length,1);assert.equal(p.draws[0].asset.src,'/vfx/berserker-stance-v2/normal-attack.webp');
 }finally{p.cleanup()}
});
test('HD whole-spirit and slash frames have alpha and 36px transparent gutters',async()=>{
 for(const path of [stance.ASCENDED_STANCE_ART.state,...stance.ASCENDED_STANCE_ART.attack,stance.ASCENDED_STANCE_ART.slash,stance.ASCENDED_STANCE_ART.wound]){
  const {data,info}=await sharp('public'+path).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(info.width,1024);assert.equal(info.height,1024);
  for(let i=0;i<4;i++){let visible=0;for(let y=0;y<512;y++)for(let x=0;x<512;x++){const alpha=data[((Math.floor(i/2)*512+y)*info.width+i%2*512+x)*4+3];if(x<36||x>=476||y<36||y>=476)assert.equal(alpha,0);else if(alpha>100)visible++}assert.ok(visible>100)}
 }
});

test('foreground slash sits above fighters and below shared damage text, with one rear Canvas',()=>{
 const css=readFileSync('app/globals.css','utf8');
 const layer=selector=>Number(css.match(new RegExp(selector+'\\s*\\{[^}]*z-index:\\s*(\\d+)'))[1]);
 assert.ok(layer('\\.berserker-stance-slash')>layer('\\.fighter'));
 assert.ok(layer('\\.berserker-stance-slash')<layer('\\.combat-damage-layer'));
 assert.equal((source.match(/<canvas/g)||[]).length,1);
 assert.match(css,/\.berserker-stance-slash\s*\{[^}]*pointer-events:\s*none/);
});

for(const fallback of [false,true])for(const mobile of [false,true])test(`wound tracks hit target and fades: ${fallback?'Canvas':'WebGL'} ${mobile?'mobile':'desktop'}`,async()=>{
 const p=await playback({fallback,mobile});try{
  p.step(100);p.update({attackKey:1});p.step(1000);p.step(1279);assert.equal(p.woundLayer.style.opacity,'0');
  for(let cell=0;cell<4;cell++){
   p.step(1281+cell*85);const s=p.woundLayer.style,size=p.enemy.width*1.35;
   assert.ok(Number(s.opacity)>0);assert.equal(parseFloat(s.width),size);
   assert.ok(Math.abs(parseFloat(s.left)+size/2-(p.enemy.left+p.enemy.width*.52))<1e-6);
   assert.ok(Math.abs(parseFloat(s.top)+size/2-(p.enemy.top+p.enemy.height*.56))<1e-6);
   assert.deepEqual(s.backgroundPosition.split(' ').map(parseFloat),[-(cell%2*512+2)*size/508,-(Math.floor(cell/2)*512+2)*size/508]);
  }
  p.enemy.left+=20;p.enemy.width*=.8;p.step(1540);
  assert.ok(Math.abs(parseFloat(p.woundLayer.style.left)+parseFloat(p.woundLayer.style.width)/2-(p.enemy.left+p.enemy.width*.52))<1e-6);
  p.step(1619);assert.ok(Number(p.woundLayer.style.opacity)<.02);p.step(1620);assert.equal(p.woundLayer.style.opacity,'0');
 }finally{p.cleanup()}
});
test('misses and changed targets never receive wounds while slash still plays',async()=>{
 const p=await playback();try{p.step(100);p.update({attackKey:1,attackHit:false});p.step(1000);p.step(1300);assert.equal(p.woundLayer.style.opacity,'0');assert.ok(Number(p.slashLayer.style.opacity)>0);
 p.update({attackKey:2,attackHit:true});p.step(1700);p.step(2000);assert.ok(Number(p.woundLayer.style.opacity)>0);
 p.update({targetKey:'target-2'});p.step(2010);assert.equal(p.woundLayer.style.opacity,'0');
 }finally{p.cleanup()}
});
test('reduced motion wound uses steady dim scar and missing wound asset leaves ghost and slash intact',async()=>{
 const p=await playback({reduced:true});try{p.step(100);p.update({attackKey:1});p.step(1000);p.step(1300);assert.ok(Number(p.woundLayer.style.opacity)>0);assert.ok(Number(p.woundLayer.style.opacity)<=.55);
 const size=p.enemy.width*1.35;assert.deepEqual(p.woundLayer.style.backgroundPosition.split(' ').map(parseFloat),[-514*size/508,-2*size/508]);
 }finally{p.cleanup()}
 const q=await playback();try{q.images.find(i=>i.src===stance.ASCENDED_STANCE_ART.wound).naturalWidth=0;q.step(100);q.update({attackKey:1});q.step(1000);q.step(1300);assert.equal(q.woundLayer.style.opacity,'0');assert.ok(Number(q.slashLayer.style.opacity)>0);assert.equal(q.draws.length,1)}finally{q.cleanup()}
});
test('wound overlay remains above slash and below shared damage text',()=>{
 const css=readFileSync('app/globals.css','utf8');const layer=selector=>Number(css.match(new RegExp(selector+'\\s*\\{[^}]*z-index:\\s*(\\d+)'))[1]);
 assert.ok(layer('\\.berserker-stance-wound')>layer('\\.berserker-stance-slash'));assert.ok(layer('\\.berserker-stance-wound')<layer('\\.combat-damage-layer'));
 assert.match(css,/\.berserker-stance-wound\s*\{[^}]*pointer-events:\s*none/);
});
