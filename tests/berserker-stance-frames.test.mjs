import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
const js=ts.transpile(readFileSync('app/berserker-stance-frames.ts','utf8'),{module:ts.ModuleKind.ESNext});
const {stanceFrame,stanceUv}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
test('stance idle never consumes attack cells and attack reaches all six frames',()=>{
 for(let i=0;i<6;i++) {assert.equal(stanceFrame(i*620/6,'attack'),i);const [x,y,w,h]=stanceUv(i);assert.ok(x>=0&&y>=0&&x+w<=1&&y+h<=1);}
 for(let t=0;t<10000;t+=100)assert.ok([2,3].includes(stanceFrame(t,'idle')));
 assert.equal(stanceFrame(0,'pulse'),4);assert.equal(stanceFrame(0,'fade'),5);
 assert.equal(stanceFrame(0,'attack',true),stanceFrame(10000,'attack',true));
});
