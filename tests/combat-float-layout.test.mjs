import assert from 'node:assert/strict';
import test from 'node:test';
import { CombatFloatLayout,floatEnvelope,floatsOverlap,flowNumbersConflict } from '../app/combat-float-layout.ts';
import { collectCombatFloats } from '../app/combat-float-events.ts';
const inputs=()=>({groups:[],elementals:[],dots:[],player:null,enemy:null,miss:null,counter:null,boss:false});
const view=(width=360)=>({width,height:width<600?280:390,enemy:{x:width*.73,y:82},player:{x:width*.27,y:82}});
const measure=(e,v)=>({width:e.channel==='ultimate'?v.width*.70:112,height:e.channel==='ultimate'?76:42,font:22,text:String(e.damage),caption:e.label??''});
const event=(id,channel='primary',target='enemy')=>({id:String(id),channel,target,damage:12345});
test('skill display colors follow effect families while basic hits remain neutral',()=>{
 const i=inputs();i.groups=['','血刃斬','追風箭','裂地斬','奧術回響','天罰箭雨'].map((skillName,key)=>({key,skillName,hits:[{damage:10,critical:false}]}));
 assert.deepEqual(collectCombatFloats(i).map(e=>e.tone),['normal','bleed','ice','gold','violet','violet']);
});
function valid(layout,v){
 assert.ok(layout.active.length<=(v.width<600?6:10));
 for(const item of layout.active){assert.ok(item.x>=0&&item.y>=0&&item.x+item.width<=v.width&&item.y+item.height<=v.height);}
 for(let i=0;i<layout.active.length;i++)for(let j=i+1;j<layout.active.length;j++)
 if(!(layout.active[i].column&&layout.active[j].column))
 assert.equal(floatsOverlap(floatEnvelope({...layout.active[i],travel:layout.active[i].column&&layout.active[j].column?0:layout.active[i].travel}),floatEnvelope({...layout.active[j],travel:layout.active[i].column&&layout.active[j].column?0:layout.active[j].travel})),false,`${layout.active[i].id}/${layout.active[j].id}`);
}
test('adapter keeps each segment and impact delay with exact raw amounts',()=>{
 const i=inputs();i.groups=[{key:1,hits:[{damage:99999999,critical:true,delayMs:0},{damage:12,critical:false,delayMs:70},{damage:0,critical:false}]}];
 const e=collectCombatFloats(i);assert.equal(e.length,2);assert.deepEqual(e.map(x=>x.damage),[99999999,12]);assert.deepEqual(e.map(x=>x.delayMs),[0,70]);assert.equal(e[0].critical,true);
});
test('adapter combines incoming, DOT, elemental and ultimate without duplicate tower injury',()=>{
 const i=inputs();i.groups=[{key:1,titan:true,hits:[{damage:888,critical:true}]},{key:2,hits:[{damage:77,critical:false,label:'新增技能'}]}];
 i.elementals=[{key:3,volley:false,hits:[{damage:32,label:'元素'}]}];i.dots=[{key:4,kind:'burn',damage:17}];
 i.player={key:5,damage:9,dodged:false};i.enemy={key:5,damage:9,dodged:false};
 const e=collectCombatFloats(i);assert.equal(e.length,5);assert.equal(e.filter(x=>x.target==='player').length,1);
 assert.deepEqual(e.map(x=>x.channel),['ultimate','primary','extra','dot','primary']);assert.equal(e.reduce((sum,x)=>sum+(x.damage??0),0),1023);
});
test('boss outgoing feedback is not displayed as another injury; miss/block are status channels',()=>{
 const i=inputs();i.boss=true;i.enemy={key:1,damage:400,dodged:false};assert.equal(collectCombatFloats(i).length,0);
 i.player={key:2,damage:0,dodged:false,blocked:true};i.miss=3;
 assert.deepEqual(collectCombatFloats(i).map(x=>x.text),['格擋！','未命中！']);
});
test('source identities distinguish new real events even when legacy numeric keys repeat',()=>{
 const ids=new WeakMap();let seq=0;const identity=(o)=>{if(!ids.has(o))ids.set(o,String(++seq));return ids.get(o);};
 const a=inputs();a.groups=[{key:1,hits:[{damage:3,critical:false}]}];const first=collectCombatFloats(a,identity);
 assert.deepEqual(collectCombatFloats(a,identity),first);a.groups=[{key:1,hits:[{damage:3,critical:false}]}];assert.notEqual(collectCombatFloats(a,identity)[0].id,first[0].id);
});
for(const width of [360,972])test(`dense mixed damage at ${width}px appears on the due tick without text envelope collisions`,()=>{
 const l=new CombatFloatLayout(),v=view(width);let n=0;
 for(let time=0;time<1600;time+=70){const e=event(++n,time%3===0?'dot':time%2===0?'extra':'primary',time%7===0?'player':'enemy');
 l.enqueue([e],time);l.tick(time,v,measure);assert.ok(l.active.some(x=>x.id===e.id));valid(l,v);
 for(const item of l.active)if(item.channel!=="ultimate")assert.ok(item.target==="enemy"?item.x>=v.width*.50:item.x+item.width<=v.width*.48);}
 l.tick(2600,v,measure);assert.equal(l.active.length,0);assert.equal(l.pending.length,0);
});
for(const width of [360,972])test(`ultimate gets protected space while every new ordinary number finds room at ${width}px`,()=>{
 const l=new CombatFloatLayout(),v=view(width);l.enqueue([event('ultimate','ultimate')],0);l.tick(0,v,measure);
 for(let t=50;t<1000;t+=70){const e=event(t,t%2?'extra':'primary');l.enqueue([e],t);l.tick(t,v,measure);
 assert.ok(l.active.some(x=>x.id==='ultimate'));assert.ok(l.active.some(x=>x.id===e.id));valid(l,v);}
});
test('queued segment timing and duplicate ingestion never create extra numbers',()=>{
 const l=new CombatFloatLayout(),v=view();const e={...event(1),delayMs:70};l.enqueue([e,e],1000);l.tick(1069,v,measure);assert.equal(l.active.length,0);
 l.tick(1070,v,measure);assert.equal(l.active.length,1);assert.equal(l.active[0].born,1070);l.enqueue([e],1100);assert.equal(l.pending.length,0);
});
test('resize retains birth times and valid mobile positions; reset cancels delayed numbers',()=>{
 const l=new CombatFloatLayout();l.enqueue([event(1),event(2,'dot')],1000);l.tick(1000,view(972),measure);
 l.reflow(1120,view(),measure);valid(l,view());assert.ok(l.active.every(x=>x.born===1000));
 l.enqueue([{...event(3),delayMs:1000}],1120);l.clear();l.tick(2200,view(),measure);assert.equal(l.active.length,0);assert.equal(l.pending.length,0);
});
test('a suspended tab retires visual backlog without replaying old floating text',()=>{
 const l=new CombatFloatLayout();l.enqueue([event(1),{...event(2),delayMs:100}],0);l.tick(10000,view(),measure);assert.equal(l.active.length,0);
});
for(const width of [360,972])test(`rapid multihits tightly push old numbers upward from the head at ${width}px`,()=>{
 const l=new CombatFloatLayout(),v=view(width);const previous=new Map();
 for(let n=0;n<6;n++){
  l.enqueue([event(`column-${n}`)],n*110);l.tick(n*110,v,measure);valid(l,v);
  const newest=l.active.find(item=>item.id===`column-${n}`);
  assert.ok(newest?.column);assert.ok(newest.y<=v.enemy.y);assert.equal(newest.x+newest.width/2,v.enemy.x);
  for(let a=0;a<l.active.length;a++)for(let b=a+1;b<l.active.length;b++)assert.equal(flowNumbersConflict(l.active[a],l.active[b],n*110),false);
  assert.equal(newest.travel,newest.duration*.0225);
  for(const item of l.active){
   if(previous.has(item.id)){const old=previous.get(item.id);assert.ok(item.y<old.y);assert.equal(item.born,old.born);assert.equal(item.duration,old.duration);assert.equal(item.damage,old.damage);assert.equal(item.x,old.x);}
   previous.set(item.id,{...item});
  }
 }
});
test('simultaneous hits push the first hit upward without restarting its lifetime',()=>{
 const l=new CombatFloatLayout(),v=view();l.enqueue([event('a')],0);l.tick(0,v,measure);const first={...l.active[0]};
 l.enqueue([event('b')],0);l.tick(0,v,measure);
 const pushed=l.active.find(item=>item.id==='a');assert.ok(pushed.y<first.y);assert.equal(pushed.born,first.born);
 const second=l.active.find(item=>item.id==='b');assert.equal(second.y,v.enemy.y);assert.equal(second.y-pushed.y-pushed.height,6);assert.equal(flowNumbersConflict(pushed,second,0),false);
});
test('ordinary spaced attacks use the same column entry without replaying old hits',()=>{
 const l=new CombatFloatLayout(),v=view();
 for(let n=0;n<3;n++){l.enqueue([event(n)],n*1000);l.tick(n*1000,v,measure);assert.equal(l.active.length,1);assert.ok(l.active.every(item=>item.column));assert.equal(l.active[0].born,n*1000);}
});
for(const width of [360,972])test(`mixed critical and extra rapid hits stay on one vertical axis without overlap at ${width}px`,()=>{
 const l=new CombatFloatLayout(),v=view(width);
 const varied=(e)=>({width:e.critical?128:92,height:42,font:e.critical?29:18,text:String(e.damage),caption:''});
 for(let t=0;t<1800;t+=50){
  const e={...event(t,t%150===0?'extra':'primary'),critical:t%100===0};
  l.enqueue([e],t);l.tick(t,v,varied);
  assert.ok(l.active.some(item=>item.id===e.id));
  for(const item of l.active){assert.equal(item.x+item.width/2,v.enemy.x);assert.equal(item.travel,item.duration*.0225);}
  for(let a=0;a<l.active.length;a++)for(let b=a+1;b<l.active.length;b++){
   assert.equal(flowNumbersConflict(l.active[a],l.active[b],t),false);
   const end=Math.min(l.active[a].born+l.active[a].duration,l.active[b].born+l.active[b].duration);
   for(let sample=t;sample<end;sample+=16){
    const at=(item)=>({...item,y:item.y-item.travel*Math.min(1,(sample-item.born)/item.duration),travel:0});
    assert.equal(floatsOverlap(floatEnvelope(at(l.active[a])),floatEnvelope(at(l.active[b]))),false);
   }
  }
 }
});

test('volley segments remain readable on one vertical axis without replay or additional delay',()=>{
 const v=view(),l=new CombatFloatLayout(),i=inputs();
 let hp=100;
 for(let n=0;n<6;n++){
  i.groups=[{key:n,skillName:'疾風連射',hits:[{damage:10,critical:n%2===0,label:n===5?'六重風葬':undefined,delayMs:0}]}];
  const events=collectCombatFloats(i);assert.equal(events[0].volley,true);
  l.enqueue(events,n*70);const shown=l.tick(n*70,v,(event)=>({width:100,height:32,font:event.label==='六重風葬'?30:event.critical?26:23,text:'10',caption:''}));
  assert.equal(shown.length,1);hp-=shown[0].damage;
  const newest=l.active.find(x=>x.id===events[0].id);
  assert.equal(newest.y,v.enemy.y);assert.equal(newest.duration,950);assert.equal(newest.travel,18);
  assert.ok(l.active.every(x=>x.x+x.width/2===v.enemy.x));
  for(let a=0;a<l.active.length;a++)for(let b=a+1;b<l.active.length;b++)assert.equal(flowNumbersConflict(l.active[a],l.active[b],n*70),false);
 }
 assert.equal(hp,40);
});
test('impact-published volley elementals do not inherit the legacy 495ms wait',()=>{
 const i=inputs();i.elementals=[{key:42,volley:true,hits:[{damage:12,label:'元素',delayMs:0},{damage:24,label:'元素爆發',delayMs:0}]}];
 assert.deepEqual(collectCombatFloats(i).map(x=>x.delayMs),[0,0]);
});
