import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
test('red and gold remake atlases retain ten cells with transparent safe borders',async()=>{
 const pixels=[];
 for(const name of ['normal','ascended']){
  const {data,info}=await sharp(`public/vfx/armor-smash-v2/${name}.webp`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,2560);assert.equal(info.height,1024);pixels.push(data);
  for(let cell=0;cell<10;cell++){
   let visible=0;for(let y=0;y<512;y++)for(let x=0;x<512;x++){
    const a=data[((Math.floor(cell/5)*512+y)*info.width+cell%5*512+x)*4+3];
    if(x<56||x>=456||y<56||y>=456)assert.equal(a,0);else if(a>100)visible++;
   }assert.ok(visible>1000);
  }
 }
 assert.notDeepEqual(pixels[0],pixels[1]);
});
