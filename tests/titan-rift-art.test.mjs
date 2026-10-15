import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import sharp from 'sharp';
import {TITAN_HD_ART} from '../app/titan-rift-frames.ts';
test('native HD titan cells keep complete ghost and strict transparent gutters',async()=>{
 for(const name of ['normal','ascended','impact']){
  const {data,info}=await sharp('public'+TITAN_HD_ART[name]).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const columns=name==='impact'?2:3;assert.equal(info.width,columns*768);assert.equal(info.height,1536);
  for(let cell=0;cell<columns*2;cell++){
   let visible=0;for(let y=0;y<768;y++)for(let x=0;x<768;x++){
    const a=data[((Math.floor(cell/columns)*768+y)*info.width+cell%columns*768+x)*4+3];
    if(x<36||x>=732||y<36||y>=732)assert.equal(a,0);else if(a>100)visible++;
   }assert.ok(visible>10000);
  }
 }
});
test('giant stays behind portraits and slash plus wound cover enemy beneath common damage text',()=>{
 const css=readFileSync('app/globals.css','utf8');
 assert.match(css,/\.titan-spirit-canvas\s*\{[^}]*z-index:\s*1/);
 assert.match(css,/\.titan-ultimate-slash\s*\{\s*z-index:\s*4/);
 assert.match(css,/\.titan-ultimate-wound\s*\{\s*z-index:\s*5/);
 assert.match(css,/\.titan-ultimate-wound\s*\{[^}]*pointer-events:\s*none/);
 const source=readFileSync('app/webgl-titan-rift-vfx.tsx','utf8');assert.equal((source.match(/<canvas/g)||[]).length,1);
});
