// @ts-nocheck
import {createAssetWorkBudget} from './asset-work-budget';
// The approved pixel cleanup/registrations run only at the map loading gate.
// Returned canvases and padded cells are reused across combat/view remounts.
export async function prepareRealMonsterSheets(sheets,onProgress,signal){
 const M=sheets.manifest,images=new Map(),isolatedFrames=new Map();
 function check(){if(signal?.aborted)throw new DOMException('Aborted','AbortError');}
 const yieldWork=createAssetWorkBudget(signal);
 function smooth(t){t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);}
 async function decode(url){
  check();const img=new Image();img.src=url;
  let abort;try{await Promise.race([img.decode(),new Promise((_,reject)=>{abort=()=>{img.src='';reject(new DOMException('Aborted','AbortError'));};signal?.addEventListener('abort',abort,{once:true});})]);check();return img;}
  finally{if(abort)signal?.removeEventListener('abort',abort);}
 }
 async function prepare(img,meta,key,portrait){if(key==='ironShell'&&portrait)return prepareIronShell(img,meta,portrait);const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0);const pixels=x.getImageData(0,0,c.width,c.height),d=pixels.data;for(let y=0;y<c.height;y++){if(y%32===0)await yieldWork();for(let px=0;px<c.width;px++){
  const at=(y*c.width+px)*4,a=d[at+3];if(a===0)continue;
  const u=(px/c.width*meta.cols)%1,v=(y/c.height*meta.rows)%1;
  const border=Math.min(u,1-u,v,1-v);const edge=Math.max(0,Math.min(1,(border-.018)/.045));
  // Display-only removal of low-luminance ambient veil; retain original raster assets.
  if(key==='mireBreathStorm'){const light=Math.max(d[at],d[at+1],d[at+2]),v=Math.max(0,Math.min(1,(light-40)/95));d[at+3]=Math.round(a*v*v*(3-2*v));}
  const q=Math.max(0,Math.min(1,(a-24)/96));d[at+3]=Math.round((key==='mireBreathStorm'?d[at+3]:a)*q*q*(3-2*q)*edge);if(key==='bleedLoop')d[at+3]=Math.round(d[at+3]*Math.max(0,Math.min(1,(Math.max(d[at],d[at+1],d[at+2])-45)/70)));
 }}x.putImageData(pixels,0,0);
 if(key==='bleedLoop'){
  const centers=[];
  for(let frame=0;frame<meta.frames;frame++){
   const col=frame%meta.cols,row=Math.floor(frame/meta.cols),x0=Math.round(col*c.width/meta.cols),x1=Math.round((col+1)*c.width/meta.cols),y0=Math.round(row*c.height/meta.rows),y1=Math.round((row+1)*c.height/meta.rows);
   let sum=0,cx=0,cy=0;
   for(let y=y0;y<y1;y++)for(let px=x0;px<x1;px++){const i=(y*c.width+px)*4;if((y-y0)/(y1-y0)<.64&&d[i]>100&&d[i]>d[i+1]*1.8&&d[i]>d[i+2]*1.5&&d[i+3]>100){const weight=d[i+3];sum+=weight;cx+=(px-x0)/(x1-x0)*weight;cy+=(y-y0)/(y1-y0)*weight;}}
   centers.push(sum?{x:cx/sum,y:cy/sum}:{x:.5,y:.5});
  }
  c.woundRegistration=centers.map(v=>({x:centers[0].x-v.x,y:centers[0].y-v.y}));
 }

 // Measure display-only registrations; preserve the embedded source PNGs.
 if(['executionAsh','executionShards','ironWhip'].includes(key)){
  c.effectRegistration=[];
  for(let frame=0;frame<meta.frames;frame++){
   const col=frame%meta.cols,row=Math.floor(frame/meta.cols),x0=Math.round(col*c.width/meta.cols),x1=Math.round((col+1)*c.width/meta.cols),y0=Math.round(row*c.height/meta.rows),y1=Math.round((row+1)*c.height/meta.rows),w=x1-x0,h=y1-y0;
   let minX=w,maxX=0,minY=h,maxY=0,sum=0,cx=0,cy=0;
   for(let y=y0;y<y1;y++)for(let px=x0;px<x1;px++){
    const i=(y*c.width+px)*4,u=(px-x0)/w,v=(y-y0)/h,a=d[i+3];
    if(a<110)continue;
    if(key==='ironWhip'&&(u<.82||u>.985||d[i]<70||d[i]<d[i+1]*1.15||d[i]<d[i+2]*1.15))continue;
    const weight=a*a;sum+=weight;cx+=u*weight;cy+=v*weight;minX=Math.min(minX,px-x0);maxX=Math.max(maxX,px-x0);minY=Math.min(minY,y-y0);maxY=Math.max(maxY,y-y0);
   }
   c.effectRegistration.push(sum?{x:cx/sum,y:cy/sum,centerX:(minX+maxX)/2/w,bottom:(maxY+1)/h,width:Math.max(.1,(maxX-minX+1)/w),height:Math.max(.1,(maxY-minY+1)/h)}:{x:.92,y:.5,centerX:.5,bottom:.94,width:1,height:1});
  }
 }

 if(['bossBrandPress','bossBrandImpact','bossBrandLoop'].includes(key)){
  c.bossBrandRegistration=[];
  for(let frame=0;frame<meta.frames;frame++){
   const col=frame%meta.cols,row=Math.floor(frame/meta.cols),x0=Math.round(col*c.width/meta.cols),x1=Math.round((col+1)*c.width/meta.cols),y0=Math.round(row*c.height/meta.rows),y1=Math.round((row+1)*c.height/meta.rows);let sum=0,cx=0,cy=0;
   for(let y=y0;y<y1;y++)for(let px=x0;px<x1;px++){const i=(y*c.width+px)*4,u=(px-x0)/(x1-x0),v=(y-y0)/(y1-y0);if(key==='bossBrandPress'&&(u>.62||v<.20||v>.85))continue;if(d[i]>130&&d[i+1]>50&&d[i]>d[i+1]*1.08&&d[i]>d[i+2]*1.5&&d[i+3]>64){const weight=(d[i+1]+20)**4*d[i+3];sum+=weight;cx+=u*weight;cy+=v*weight;}}
   c.bossBrandRegistration.push(sum?[cx/sum,cy/sum]:key==='bossBrandPress'?[.28,.55]:[.5,.56]);
  }
 }
 if(['brandFlight','brandImpact','brandLoop'].includes(key)){
  c.brandRegistration=[];
  for(let frame=0;frame<meta.frames;frame++){
   const col=frame%meta.cols,row=Math.floor(frame/meta.cols),x0=Math.round(col*c.width/meta.cols),x1=Math.round((col+1)*c.width/meta.cols),y0=Math.round(row*c.height/meta.rows),y1=Math.round((row+1)*c.height/meta.rows);let sum=0,cx=0,cy=0;
   for(let y=y0;y<y1;y++)for(let px=x0;px<x1;px++){const i=(y*c.width+px)*4;if(d[i]>120&&d[i]>d[i+1]*1.4&&d[i]>d[i+2]*1.4&&d[i+3]>100){const w=d[i+3]*d[i];sum+=w;cx+=(px-x0)/(x1-x0)*w;cy+=(y-y0)/(y1-y0)*w;}}
   c.brandRegistration.push(sum?[cx/sum,cy/sum]:[.5,.5]);
  }
 }
 return c;}
 // Register the sheen to the original portrait's own metal facets. Generated
 // lighting modulates these pixels; it cannot paint a second displaced beetle.
 async function prepareIronShell(img,meta,portrait){
  const w=384,h=576,c=document.createElement('canvas');c.width=w*3;c.height=h*2;
  const original=document.createElement('canvas');original.width=w;original.height=h;const ox=original.getContext('2d',{willReadFrequently:true});ox.drawImage(portrait,0,0,w,h);const source=ox.getImageData(0,0,w,h).data;
  const atlas=document.createElement('canvas');atlas.width=img.naturalWidth;atlas.height=img.naturalHeight;const ax=atlas.getContext('2d',{willReadFrequently:true});ax.drawImage(img,0,0);const light=ax.getImageData(0,0,atlas.width,atlas.height).data,fw=atlas.width/3,fh=atlas.height/2;
  const regions=[[[.51,.20],[.66,.24],[.78,.32],[.83,.43],[.77,.50],[.60,.56],[.46,.60],[.29,.57],[.19,.47],[.23,.34],[.38,.26]],[[.28,.49],[.54,.49],[.57,.60],[.43,.65],[.27,.60]],[[.02,.45],[.19,.43],[.28,.52],[.25,.65],[.12,.77],[.03,.69]],[[.65,.44],[.89,.44],[.99,.58],[.91,.72],[.67,.85],[.56,.77],[.64,.63],[.59,.55]]];
  const inside=(u,v,poly)=>{let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const[a,b]=poly[i],[d,e]=poly[j];if((b>v)!==(e>v)&&u<(d-a)*(v-b)/(e-b)+a)hit=!hit;}return hit;};
  const out=c.getContext('2d');
  for(let frame=0;frame<6;frame++){
   const data=ox.createImageData(w,h),d=data.data;
   for(let y=1;y<h-1;y++){if(y%32===0)await yieldWork();for(let x=1;x<w-1;x++){
    const u=x/w,v=y/h;if(!regions.some(poly=>inside(u,v,poly)))continue;
    const i=(y*w+x)*4,R=source[i],G=source[i+1],B=source[i+2],luma=.2126*R+.7152*G+.0722*B;
    // Remove orange eye/fire pixels and deep shadow, retaining actual steel edges.
    if(luma<28||R>G*1.5)continue;
    const contrast=Math.abs(luma-(source[i-4]+source[i+4]+source[i-w*4]+source[i+w*4])/4);
    const edge=Math.min(1,.18+Math.max(0,(luma-42)/140)+Math.max(0,contrast-7)/70);
    const sx=Math.max(0,Math.min(fw-1,Math.floor((u-.05)/.90*fw))),sy=Math.max(0,Math.min(fh-1,Math.floor((v-.11)/.78*fh))),j=((Math.floor(frame/3)*fh+sy)*atlas.width+(frame%3)*fw+sx)*4;
    const glow=(.2126*light[j]+.7152*light[j+1]+.0722*light[j+2])/255*(light[j+3]/255);
    const band=frame<2?(frame===0?.45:.75):.45+.55*Math.exp(-(((v-[.30,.43,.55,.68][frame-2])/.10)**2));
    d[i]=186;d[i+1]=219;d[i+2]=246;d[i+3]=Math.round(255*(.42+.58*edge)*(.72+.28*glow)*band);
   }}out.putImageData(data,(frame%3)*w,Math.floor(frame/3)*h);
  }return c;
 }
 function cavalryFrame(image,m,n){
  let cache=isolatedFrames.get(image);if(!cache){cache=new Map();isolatedFrames.set(image,cache);}if(cache.has(n))return cache.get(n);
  const col=n%m.cols,row=Math.floor(n/m.cols),x0=Math.round(col*image.width/m.cols),x1=Math.round((col+1)*image.width/m.cols),y0=Math.round(row*image.height/m.rows),y1=Math.round((row+1)*image.height/m.rows);
  const w=x1-x0,h=y1-y0,pad=Math.max(4,Math.ceil(Math.max(w,h)*.20));
  const c=document.createElement('canvas');c.width=w+2*pad;c.height=h+2*pad;
  c.spriteKey=m.file;c.spriteFrame=n;c.spritePadding=pad;c.spriteWidth=w;c.spriteHeight=h;
  const x=c.getContext('2d');x.drawImage(image,x0,y0,w,h,pad,pad,w,h);
  cache.set(n,c);return c;
 }
 function mawTexture(n,part){
  const image=images.get('boneMaw');if(!image)return null;
  let cache=isolatedFrames.get(image);if(!cache){cache=new Map();isolatedFrames.set(image,cache);}
  const key='maw:'+n+':'+part;if(cache.has(key))return cache.get(key);
  const pose=cavalryFrame(image,M.boneMaw,n),c=document.createElement('canvas');c.width=pose.width;c.height=pose.height;
  c.mawFrame=n;c.mawPart=part;c.spritePadding=pose.spritePadding;c.spriteWidth=pose.spriteWidth;c.spriteHeight=pose.spriteHeight;
  const x=c.getContext('2d'),pad=pose.spritePadding,w=pose.spriteWidth,h=pose.spriteHeight;
  const box=part==='upper'?[0,0,1,.5]:part==='lower'?[0,.5,1,.5]:[0,0,1,1];
  x.beginPath();x.rect(pad+box[0]*w,pad+box[1]*h,box[2]*w,box[3]*h);x.clip();x.drawImage(pose,0,0);cache.set(key,c);return c;
 }
 function houndTextures(pose){
  const image=images.get('houndHaste'),m=M.houndHaste;if(!image)return;
  let cache=isolatedFrames.get(image);if(!cache){cache=new Map();isolatedFrames.set(image,cache);}
  let eyes=cache.get('eyes:'+pose);
  if(!eyes){
   const x0=Math.round(pose%3*image.width/3),x1=Math.round((pose%3+1)*image.width/3),y0=Math.round(Math.floor(pose/3)*image.height/2),w=x1-x0,h=image.height/2;
   const [left,right]=m.eyeAnchors[pose],mx=(left[0]+right[0])/2,my=(left[1]+right[1])/2;
   eyes=[0,1].map(eye=>{
    const c=document.createElement('canvas');c.width=w;c.height=h;c.eyeIndex=eye;c.eyeCore=m.eyeAnchors[pose][eye];
    const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(image,x0,y0,w,h,0,0,w,h);
    const pixels=x.getImageData(0,0,w,h),d=pixels.data;
    for(let y=0;y<h;y++)for(let px=0;px<w;px++){
     const i=(y*w+px)*4,split=mx+.32*(my-y),side=eye===0?split-px:px-split;
     const edge=smooth((side+1)/3),luma=Math.max(d[i],d[i+1],d[i+2]);
     d[i+3]=Math.round(d[i+3]*edge*smooth((luma-18)/65));
    }
    x.putImageData(pixels,0,0);return c;
   });cache.set('eyes:'+pose,eyes);
  }
  return eyes;
 }

 let done=0;const total=Object.keys(M).length;
 onProgress({done,total});
 const entries=Object.entries(M),prefetched=new Map();
 // Start a small window of image decodes while the current atlas is processed.
 // Settled results prevent an early rejection from becoming unhandled.
 function prefetch(index){
  if(index>=entries.length)return;
  const key=entries[index][0];
  prefetched.set(index,decode(sheets.images[key]).then(image=>({image}),error=>({error})));
 }
 for(let i=0;i<Math.min(4,entries.length);i++)prefetch(i);
 try{for(let index=0;index<entries.length;index++){
  const [key,meta]=entries[index];await yieldWork();
  const result=await prefetched.get(index);prefetched.delete(index);
  if(result.error)throw result.error;
  const img=result.image;prefetch(index+4);
  const portrait=key==='ironShell'?await decode('/monsters/鐵殼蟲.webp'):null;
  const prepared=await prepare(img,meta,key,portrait);images.set(key,prepared);
  // All texture work, including first-hit jaw/eye extraction, finishes here.
  if(key.startsWith('mire')||['bossBrandPress','bossBrandImpact','bossBrandLoop','soldierCleave','stoneStrike','rotClaw','mineScreech','ironCharge','ironShell','minerPick','rockFist','rockFracture','brandFlight','brandImpact','brandLoop','executionActor','executionTool','executionImpact','executionWave','executionAsh','executionShards','cavalry','wraithWave','wraithImpact','boneStomp','boneImpact','boneFinal','boneMaw'].includes(key)){
   for(let frame=0;frame<meta.frames;frame++){cavalryFrame(prepared,meta,frame);if(key==='boneMaw')for(const part of ['upper','lower','all'])mawTexture(frame,part);if(frame%4===3)await yieldWork();}
  }
  if(key==='houndHaste')for(let frame=0;frame<meta.frames;frame++){houndTextures(frame);await yieldWork();}
  // Discard duplicate full atlas pixels after all sampled textures are warm.
  // Registrations/dimensions remain available without retaining two GPU copies.
  if(isolatedFrames.has(prepared)){
   const info={width:prepared.width,height:prepared.height,woundRegistration:prepared.woundRegistration,effectRegistration:prepared.effectRegistration,bossBrandRegistration:prepared.bossBrandRegistration,brandRegistration:prepared.brandRegistration};
   isolatedFrames.set(info,isolatedFrames.get(prepared));isolatedFrames.delete(prepared);images.set(key,info);prepared.width=prepared.height=1;
  }
  img.src='';if(portrait)portrait.src='';onProgress({done:++done,total});
 }}finally{for(const pending of prefetched.values())pending.then(result=>{if(result.image)result.image.src='';});}
 check();return {manifest:M,images,isolatedFrames,cavalryFrame,mawTexture,houndTextures};
}
