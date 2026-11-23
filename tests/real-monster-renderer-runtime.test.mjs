import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[cm]?[jt]sx?$/.test(s)?`${s}.ts`:s,c);}});
const {installRealMonsterRenderer}=await import('../app/real-monster-renderer.ts');
const {createRealMonster,realMonsterSnapshot,advanceRealMonster}=await import('../app/real-monster-combat.ts');

function harness(chapter=4){
 const keys=['document','addEventListener','removeEventListener','matchMedia','requestAnimationFrame','cancelAnimationFrame','devicePixelRatio'];
 const original=new Map(keys.map(k=>[k,globalThis[k]])),listeners=new Map(),frames=new Map(),nodes=new Set(),animations=[];
 let frameId=0;const trace=[];const stats={rects:0,draws:0},layout={width:760,height:360,left:0,playerX:40,enemyX:550};
 const add=(type,fn)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);};
 const remove=(type,fn)=>listeners.get(type)?.delete(fn);
 const ctx=new Proxy({createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),drawImage(){stats.draws++;trace.push('draw');}}, {get:(o,k)=>k in o?o[k]:()=>{}});
 function element(tag='div'){
  const ownedAnimations=[];
  const node={tag,style:{},isConnected:true,width:0,height:0,children:[],setAttribute(){},getContext:()=>ctx,
   appendChild(child){child.isConnected=true;this.children.push(child);nodes.add(child);},
   remove(){this.isConnected=false;nodes.delete(this);for(const a of ownedAnimations)a.cancel();},
   animate(){const a={cancelled:false,cancel(){this.cancelled=true;},finished:new Promise(()=>{})};ownedAnimations.push(a);animations.push(a);return a;}};
  return node;
 }
 const player=element(),enemy=element(),stage=element();
 for(const [node,who]of [[player,'player'],[enemy,'enemy'],[stage,'stage']])node.getBoundingClientRect=()=>{
  stats.rects++;trace.push('read');const x=who==='stage'?layout.left:layout.left+(who==='player'?layout.playerX:layout.enemyX),w=who==='stage'?layout.width:172,h=who==='stage'?layout.height:258;
  return {left:x,top:20,width:w,height:h};
 };
 Object.defineProperties(stage,{clientWidth:{get:()=>layout.width},clientHeight:{get:()=>layout.height},offsetWidth:{get:()=>layout.width},offsetHeight:{get:()=>layout.height},clientLeft:{value:0},clientTop:{value:0}});
 stage.querySelector=s=>s.includes('.player')?player:s.includes('.enemy')?enemy:null;
 const document={hidden:false,querySelector:()=>stage,createElement:element,addEventListener:add,removeEventListener:remove};
 Object.assign(globalThis,{document,addEventListener:add,removeEventListener:remove,devicePixelRatio:1,matchMedia:()=>({matches:false}),
  requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id)});
 const manifest=JSON.parse(readFileSync(new URL(`../public/vfx/real-mode/chapter-${chapter}.json`,import.meta.url),'utf8')).manifest;
 const image={width:512,height:512},pose={width:512,height:512,spriteWidth:384,spriteHeight:384,spritePadding:64};
 const sprites={manifest,images:new Map(Object.keys(manifest).map(k=>[k,image])),cavalryFrame:()=>pose,mawTexture:()=>pose,houndTextures:()=>[]};
 const renderer=installRealMonsterRenderer(sprites),emit=(type,detail)=>{for(const fn of listeners.get(type)??[])fn({detail});};
 return {emit,stats,trace,frames,nodes,animations,layout,player,enemy,stage,
  frame(){const callbacks=[...frames.values()];frames.clear();for(const fn of callbacks)fn();},
  resetStats(){stats.rects=stats.draws=0;trace.length=0;},
  cleanup(){renderer.dispose();for(const[k,v]of original){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}},
 };
}

test('overlapping serpent cast/status read one shared stage geometry before drawing, and resize is fresh next frame',()=>{
 const h=harness();try{
  const s=createRealMonster('serpent','serpentHex','normal',1);s.clock=2700;s.fractureUntil=5600;s.fractureAbility='serpentHex';s.serpentGrip={start:1500,mask:1};
  s.pending={castId:'cast',ability:'serpentHex',tier:'normal',start:1500,endsAt:3340,pauseMs:0,cursor:1,hitAt:[1040,1280],hits:[{landed:true,damage:10}]};
  h.emit('dark-world-monster-state',realMonsterSnapshot(s));h.frame();
  assert.equal(h.nodes.size,2,'cast and successful first serpent attachment coexist');
  assert.equal(h.stats.rects,3,'one stage and two portrait reads per frame');
  assert.ok(h.stats.draws>0);assert.equal(h.trace.lastIndexOf('read'),2,'all layout reads precede Canvas work');
  h.layout.width=380;h.layout.playerX=24;h.resetStats();h.frame();assert.equal(h.stats.rects,3);
  for(const canvas of h.nodes)assert.equal(canvas.width,380,'new dimensions apply to every layer on the next frame');
 }finally{h.cleanup();}
});

test('renderer never invents damage or shake for miss/zero/old identity; actual landed segments trigger once',()=>{
 const h=harness(1);try{
  const s=createRealMonster('target','charge','boss',30);h.emit('dark-world-monster-state',realMonsterSnapshot(s));
  const hit={identity:'target',castId:'none',ability:'charge',tier:'boss',index:0,at:2000,damage:10,landed:true};
  for(const detail of [{...hit,identity:'old'},{...hit,landed:false},{...hit,damage:0}])h.emit('dark-world-monster-hit',detail);
  assert.equal(h.animations.length,0);h.emit('dark-world-monster-hit',hit);assert.ok(h.animations.length>0);
  h.emit('dark-world-monster-target',{id:null});assert.equal(h.nodes.size,0);assert.equal(h.frames.size,0);assert.ok(h.animations.every(a=>a.cancelled));
 }finally{h.cleanup();}
});

test('engine advances and settles all charge segments without RAF; background and disposal clear all visual work',()=>{
 const h=harness(1);try{
  const s=createRealMonster('charge','charge','boss',30),hits=[];
  for(let at=0;at<3100;at+=50)advanceRealMonster(s,50,false,{alive:()=>true,heal(){},notify:h.emit,hit:(r,id)=>{hits.push({id,at:s.clock,scale:r.scale});return {landed:true,damage:10};}});
  assert.equal(hits.length,5);assert.equal(new Set(hits.map(h=>h.id)).size,5);
  assert.deepEqual(hits.map(h=>h.at),[1750,2000,2200,2450,2700]);assert.deepEqual(hits.map(h=>h.scale),[1,1,1,1,1]);
  assert.equal(h.frames.size,1,'multiple simulation ticks may queue only one visual RAF');
  document.hidden=true;h.emit('visibilitychange');assert.equal(h.nodes.size,0);assert.equal(h.frames.size,0);
  h.emit('dark-world-monster-target',{id:null});assert.equal(h.player.style.translate??'','');assert.equal(h.enemy.style.opacity??'','');
 }finally{h.cleanup();}
});
