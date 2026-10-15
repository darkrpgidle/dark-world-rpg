import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import {skyRainDisplayAmounts} from '../app/sky-queen-rain-timing.ts';
import {collectCombatFloats} from '../app/combat-float-events.ts';
import {presentEnemyDamage} from '../app/combat-health-presentation.ts';
const source=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let initializer;
function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='queueSkyRainNumbers')initializer=n.initializer.getText(ast);ts.forEachChild(n,visit);}visit(ast);
const compiled=ts.transpileModule(`return (${initializer});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(){const pending={current:new Map()},groups=[];let extras=0;
 const queue=new Function('pendingSkyDamageRef','setBattleHitGroups','window','skyRainDisplayAmounts',compiled)(pending,
  update=>groups.splice(0,groups.length,...update(groups)),{setTimeout(){}},skyRainDisplayAmounts);
 return {pending,groups,queue,extra:()=>extras++,extras:()=>extras};
}
function events(groups){return collectCombatFloats({groups,elementals:[],dots:[],player:null,enemy:null,miss:null,counter:null,boss:false});}
for(const ascended of [false,true])test(`each missed arrow and main arrow reports on its own impact (${ascended?'ascended':'normal'})`,()=>{
 const f=fixture(),arrows=Array.from({length:9},(_,i)=>({hit:![1,4,8].includes(i),critical:false,damagePercent:[1,4,8].includes(i)?0:30}));
 f.queue(42,{skyArrows:arrows,damagePercent:180},60,f.extra,ascended);assert.equal(f.groups.length,0);
 const publish=f.pending.current.get(42);for(let i=0;i<9;i++){
  publish(i);const last=events([f.groups.at(-1)])[0];assert.equal(last.delayMs,0);
  if(!arrows[i].hit){assert.equal(last.text,'未命中！');assert.equal(last.damage,undefined);assert.equal(last.channel,'status');}
  else assert.equal(last.damage,10);
 }
 const all=events(f.groups);assert.equal(all.filter(e=>e.text==='未命中！').length,3);
 assert.equal(all.reduce((sum,e)=>sum+(e.damage??0),0),60);
 assert.equal(all.at(-1).label,ascended?'天罰主箭':'蒼穹主箭');
 assert.equal(presentEnemyDamage(100,100,all,40),40);
 for(let i=0;i<9;i++)publish(i);assert.equal(f.groups.length,9);assert.equal(f.extras(),1);
});
test('all nine misses show individually without reducing HP or inventing damage',()=>{
 const f=fixture(),arrows=Array.from({length:9},()=>({hit:false,critical:false,damagePercent:0}));
 f.queue(42,{skyArrows:arrows,damagePercent:0},0,f.extra);
 for(let i=0;i<9;i++)f.pending.current.get(42)(i);
 assert.equal(events(f.groups).length,9);assert.ok(events(f.groups).every(e=>e.text==='未命中！'&&e.damage===undefined));
 assert.equal(presentEnemyDamage(100,100,events(f.groups),100),100);
 assert.match(source,/if\(liveAction.name==="蒼穹箭雨"\)\s*queueSkyRainNumbers\(next,liveAction,0/);
 assert.match(source,/setMissFeedback\(liveAction.name!=="蒼穹箭雨"/);
 assert.match(source,/setMissFeedback\(liveAction\?\.name!=="蒼穹箭雨"/);
});
test('overkill-rounded zero shares do not turn successfully hit arrows into misses',()=>{
 const f=fixture(),arrows=Array.from({length:9},()=>({hit:true,critical:false,damagePercent:30}));
 f.queue(42,{skyArrows:arrows,damagePercent:270},1,f.extra);
 for(let i=0;i<9;i++)f.pending.current.get(42)(i);
 assert.equal(events(f.groups).length,1);assert.equal(events(f.groups)[0].damage,1);assert.equal(events(f.groups)[0].text,undefined);
});
