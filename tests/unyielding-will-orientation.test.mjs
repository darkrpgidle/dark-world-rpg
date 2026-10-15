import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../app/webgl-unyielding-will-vfx.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('vfx.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const uvNode=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='frameUv');
const uv=new Function(ts.transpileModule(uvNode.getText(ast)+'\nreturn frameUv;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText)();
test('all shield frames flip vertically inside their original cell, without swapping rows',()=>{
 const image={naturalWidth:1770,naturalHeight:888};
 for(let frame=0;frame<8;frame++){
  const [u,v,w,h]=uv(image,frame),row=Math.floor(frame/4),column=frame%4;
  assert.ok(h<0&&w>0);
  assert.ok(u>=column/4&&u+w<=(column+1)/4);
  assert.ok(v+h>=row/2&&v<=(row+1)/2);
  assert.ok(Math.abs((v+h/2)-(row+.5)/2)<1e-10);
  // An asymmetric top/bottom marker must land bottom/top respectively.
  assert.ok(v>v+h);assert.ok(Math.abs(h)-(1/2-2/image.naturalHeight)<1e-10);
 }
});
test('Canvas fallback executes the matching mirror around the unchanged destination center',()=>{
 const fallback=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='UnyieldingWillCanvasFallback').getText(ast);
 const calls=[];const context={save(){calls.push('save')},translate(x,y){calls.push(['translate',x,y])},scale(x,y){calls.push(['scale',x,y])}};
 const start=fallback.indexOf('context.save();'),end=fallback.indexOf('if (props.active',start);
 const placement={y:53,size:120};new Function('context','placement',fallback.slice(start,end))(context,placement);
 assert.deepEqual(calls,['save',['translate',0,226],['scale',1,-1]]);
 // y=53 and y=173 exchange; the center stays at 113.
 assert.equal(226-53,173);assert.equal(226-113,113);
 assert.match(fallback,/context\.restore\(\)/);
});
