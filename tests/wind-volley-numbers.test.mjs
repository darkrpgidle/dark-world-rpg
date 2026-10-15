import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
const source=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
const ast=ts.createSourceFile("page.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let initializer;
function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==="queueVolleyNumbers")initializer=node.initializer.getText(ast);ts.forEachChild(node,visit);}
visit(ast);assert.ok(initializer);
const compiled=ts.transpileModule(`return (${initializer});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(){const pending={current:new Map()},groups=[];let extras=0;
const queue=new Function("pendingVolleyDamageRef","setBattleHitGroups","window",compiled)(pending,(update)=>groups.splice(0,groups.length,...update(groups)),{setTimeout(){}});
return {queue,groups,pending,extra:()=>extras++,extras:()=>extras};}
test("actual hit weights conserve settled integer damage and exclude misses",()=>{
const f=fixture(),arrows=[{hit:false,critical:false,damagePercent:0},{hit:true,critical:false,damagePercent:55},{hit:true,critical:true,damagePercent:82.5},{hit:true,critical:false,damagePercent:90,sixth:true}];
f.queue(42,{volleyArrows:arrows},101,f.extra);const publish=f.pending.current.get(42);
publish(0);assert.equal(f.extras(),0);for(let i=1;i<4;i++)publish(i);
assert.equal(f.extras(),1);assert.equal(f.groups.length,3);assert.equal(f.groups.reduce((sum,g)=>sum+g.hits[0].damage,0),101);
assert.equal(f.groups[1].hits[0].critical,true);assert.equal(f.groups[2].hits[0].label,"六重風葬");
for(let i=0;i<4;i++)publish(i);assert.equal(f.groups.length,3);assert.equal(f.extras(),1);
});
test("all misses finish secondary display once without invented damage numbers",()=>{
const f=fixture();f.queue(42,{volleyArrows:Array.from({length:5},()=>({hit:false,damagePercent:0}))},0,f.extra);
const publish=f.pending.current.get(42);for(let i=0;i<5;i++)publish(i);
assert.equal(f.groups.length,0);assert.equal(f.extras(),1);
});
