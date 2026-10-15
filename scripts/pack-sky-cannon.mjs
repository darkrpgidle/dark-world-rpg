// Technical atlas packing only: preserve approved RGBA pixels, never enlarge source art.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
const input=process.argv[2];if(!input)throw new Error('Pass approved transparent PNG path');
const dir='public/vfx/sky-queen-rain-v7';await mkdir(`${dir}/frames`,{recursive:true});
const cells=[
 [0,0,512,340,488,206,.82,.85], [512,0,512,365,483,205,.82,.85],
 [0,370,512,360,487,185,.82,.85], [512,370,512,330,490,185,.82,.85],
 [0,740,512,360,455,190,.5,.5], [512,710,512,410,370,220,.65,.5],
 [0,1100,512,436,256,225,.85,.5], [512,1120,512,416,265,215,.85,.5],
];
const packed=[];
for(let i=0;i<cells.length;i++){
 const [left,top,width,height,tipX,tipY,scale,anchor]=cells[i];
 const w=Math.round(width*scale),h=Math.round(height*scale);
 const art=await sharp(input).extract({left,top,width,height}).resize(w,h).png().toBuffer();
 const x=Math.round(512*anchor-tipX*w/width),y=Math.round(256-tipY*h/height);
 if(x<0||y<0||x+w>512||y+h>512)throw new Error(`Frame ${i} outside cell`);
 const cell=await sharp({create:{width:512,height:512,channels:4,background:'#00000000'}}).composite([{input:art,left:x,top:y}]).png().toBuffer();
 await sharp(cell).webp({lossless:true}).toFile(`${dir}/frames/cannon-${String(i+1).padStart(2,'0')}.webp`);
 packed.push({input:cell,left:i%2*512,top:Math.floor(i/2)*512});
}
await sharp({create:{width:1024,height:2048,channels:4,background:'#00000000'}}).composite(packed).webp({lossless:true}).toFile(`${dir}/cannon.webp`);
const {data,info}=await sharp(`${dir}/cannon.webp`).raw().toBuffer({resolveWithObject:true});
let transparent=0;for(let i=3;i<data.length;i+=4)if(data[i]===0)transparent++;
console.log(JSON.stringify({width:info.width,height:info.height,frames:8,transparentPixels:transparent}));
