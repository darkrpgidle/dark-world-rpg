// @ts-nocheck
// Approved playtest renderer; artwork only, never settles combat.
export function installRealMonsterRenderer(sprites){
 const listeners=[];
 function addEventListener(type,handler){globalThis.addEventListener(type,handler);listeners.push(()=>globalThis.removeEventListener(type,handler));}
 function listenDocument(type,handler){document.addEventListener(type,handler);listeners.push(()=>document.removeEventListener(type,handler));}
 const {manifest:M,images,cavalryFrame,mawTexture,houndTextures}=sprites;
 let state=null,active=new Map(),raf=0,flash=null,shake=null,identity=null,curseReaction=null,chargeRecovery=null;
 function reduced(){return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;}
 const renderedAbilities=new Set(['venomPierce','mudPalm','miasmaBreath','serpentHex','mireTail','mireTide','claw','curse','guard','bleed','knight','charge','hound','boneArrows','boneSoldier','boneCurse','boneBeast','boneBurial','mineScreech','ironCharge','minerPick','rockFist','ironWhip','ironExecution']);
 const frameGeometry=new Map();
 const stage=()=>document.querySelector('.phase2-stage');
 function geometry(el){const r=el.getBoundingClientRect(),w=el.clientWidth,h=el.clientHeight,sx=r.width/(el.offsetWidth||w),sy=r.height/(el.offsetHeight||h);const anchor=who=>{const f=el.querySelector(`.fighter.${who} .fighter-frame`)?.getBoundingClientRect();return f?{x:(f.left-r.left+f.width*.5)/sx-(el.clientLeft||0),y:(f.top-r.top+f.height*.5)/sy-(el.clientTop||0),width:f.width/sx,height:f.height/sy}:null;};const player=anchor('player'),enemy=anchor('enemy');return player&&enemy?{width:w,height:h,player,enemy}:null;}
 function make(key,data){const el=stage();if(!el)return null;const canvas=document.createElement('canvas');canvas.className='monster-sprite-canvas';canvas.setAttribute('aria-hidden','true');el.appendChild(canvas);const fx={...data,key,canvas,stage:el};active.set(key,fx);return fx;}
 function chargePush(fx,g,age){
  if(!fx.playerEl||!fx.playerEl.isConnected){chargeRecovery?.cancel();chargeRecovery=null;fx.playerEl=fx.stage.querySelector('.fighter.player .fighter-frame');fx.playerBaseTranslate=fx.playerEl?.style.translate??'';fx.playerOffsetX=0;}
  const base=g.player.x-(fx.playerOffsetX??0),step=Math.max(0,Math.min(g.width<600?4:6,(base-g.player.width/2-4)/5));
  let offset=0;if(!reduced())for(let index=0;index<5;index++){const hit=fx.hits?.[index];if(hit?.landed&&hit.damage>0){const at=fx.chargeHitAt?.[index],since=Number.isFinite(at)?clock()-at:age-(220+index*240);offset-=step*smooth(since/70);}}
  if(fx.playerEl?.style)fx.playerEl.style.translate=offset?`${offset}px 0px`:fx.playerBaseTranslate;
  fx.playerOffsetX=offset;return{...g,player:{...g.player,x:base+offset}};
 }
 function resetChargePush(fx){
  if(!fx.playerEl?.style)return;const offset=fx.playerOffsetX??0,original=fx.playerBaseTranslate??'';
  fx.playerEl.style.translate=original;
  if(fx.chargeFinished&&offset&&!reduced()){
   chargeRecovery?.cancel();const animation=fx.playerEl.animate?.([{translate:`${offset}px 0px`},{translate:original||'0px 0px'}],{duration:220,easing:'ease-out'});chargeRecovery=animation??null;
   animation?.finished.then(()=>{if(chargeRecovery===animation)chargeRecovery=null;}).catch(()=>{});
  }fx.playerOffsetX=0;
 }
 function remove(fx){resetChargePush(fx);fx.actorCanvas?.remove();fx.toolCanvas?.remove();if(fx.monsterEl?.style)fx.monsterEl.style.translate="";if(fx.hideMonster&&fx.monsterEl?.style)fx.monsterEl.style.opacity=fx.originalOpacity??'';fx.dim?.remove();fx.canvas.remove();active.delete(fx.key);}
 function stopFlash(){curseReaction?.cancel();curseReaction=null;flash?.remove();flash=null;shake?.cancel();shake=null;}
 function clear(){for(const fx of [...active.values()])remove(fx);chargeRecovery?.cancel();chargeRecovery=null;stopFlash();cancelAnimationFrame(raf);raf=0;}
 function impact(event){
  if(!event.landed||event.damage<=0||document.hidden||reduced()||!renderedAbilities.has(event.ability))return;
  const el=stage();if(!el)return;if(event.ability==='ironExecution'&&event.index>0)return;stopFlash();
  if(chapter4Impact(event,el))return;
  if(chapter3Impact(event,el))return;
  if(event.ability==='curse'){
   const portrait=el.querySelector('.fighter.player .fighter-frame'),sink=el.clientWidth<600?2:3;
   const reaction=portrait?.animate?.([
    {filter:'brightness(1) saturate(1)',translate:'0px 0px'},
    {filter:'brightness(.72) saturate(.40)',translate:`0px ${sink}px`,offset:.23},
    {filter:'brightness(.80) saturate(.55)',translate:`0px ${sink}px`,offset:.42},
    {filter:'brightness(1) saturate(1)',translate:'0px 0px'}
   ],{duration:650,easing:'ease-in-out'});
   curseReaction=reaction;
   reaction?.finished.then(()=>{if(curseReaction===reaction)curseReaction=null;}).catch(()=>{});
   return;
  }
  if(event.ability==='guard'||event.ability==='bleed'||event.ability==='boneArrows'||event.ability==='boneCurse'){
   const portrait=el.querySelector('.fighter.player .fighter-frame'),arrow=event.ability==='boneArrows',d=el.clientWidth<600?(arrow?2:3):(arrow?3:5);
   curseReaction=portrait?.animate?.([{translate:'0px 0px'},{translate:`${-d}px ${d*.35}px`,offset:.14},{translate:`${d*.65}px ${-d*.25}px`,offset:.35},{translate:`${-d*.35}px ${d*.12}px`,offset:.58},{translate:'0px 0px'}],{duration:arrow?140:event.ability==='boneCurse'?190:180,easing:'ease-out'});
  }
  if(event.ability==='boneCurse')return;
  if(event.ability==='boneBeast'){
   const portrait=el.querySelector('.fighter.player .fighter-frame'),lift=el.clientWidth<600?4:7;
   curseReaction=portrait?.animate?.([{translate:'0px 0px'},{translate:`0px ${-lift}px`,offset:.18},{translate:`0px ${-lift*.8}px`,offset:.36},{translate:'0px 1px',offset:.72},{translate:'0px 0px'}],{duration:320,easing:'ease-out'});
  }
  const boss=['knight','charge','boneBeast','boneBurial'].includes(event.ability);
  const final=boss&&event.index===(event.ability==='charge'?4:0);
  const overlay=document.createElement('div');flash=overlay;overlay.className='monster-screen-impact';
  overlay.style.background=['claw','bleed'].includes(event.ability)?'#6d001f':['guard','boneSoldier','boneBeast','boneBurial'].includes(event.ability)?'#e7e0cc':boss?'#a2ffd1':event.ability==='curse'?'#352049':'#123b2e';el.appendChild(overlay);
  overlay.animate?.([{opacity:0},{opacity:event.ability==='claw'?.38:event.ability==='boneBurial'?(final?.40:.14):event.ability==='charge'?(final?.36:.18):boss?(final?.34:.22):.2,offset:.18},{opacity:0}],{duration:boss?110:150,fill:'forwards'}).finished.then(()=>{overlay.remove();if(flash===overlay)flash=null;}).catch(()=>{});
  if(event.ability==='claw'||event.ability==='hound'||event.ability==='boneSoldier'||event.ability==='guard'||boss){
   const d=(el.clientWidth<600?4:7)*(event.ability==='boneBurial'?2.2:event.ability==='boneBeast'?2.0:event.ability==='guard'?.60:event.ability==='boneSoldier'?1.15:event.ability==='charge'?(final?1.5:.70):boss?(final?1.45:1.05):1);
   shake=el.animate?.(event.ability==='boneBeast'?[{transform:'translate(0,0)'},{transform:`translate(0,${-d}px)`,offset:.12},{transform:`translate(0,${d*.60}px)`,offset:.32},{transform:`translate(0,${-d*.28}px)`,offset:.58},{transform:'translate(0,0)'}]:[{transform:'translate(0,0)'},{transform:`translate(${-d}px,${d*.5}px)`,offset:.16},{transform:`translate(${d}px,${-d*.65}px)`,offset:.32},{transform:`translate(${-d*.65}px,${d*.3}px)`,offset:.5},{transform:`translate(${d*.35}px,${-d*.2}px)`,offset:.72},{transform:'translate(0,0)'}],{duration:event.ability==='boneBurial'?320:event.ability==='boneBeast'?280:event.ability==='guard'?125:event.ability==='charge'?(final?230:115):boss?(final?240:180):210});
  }
 }
 // Cache cavalry poses as separate padded textures. Canvas interpolation can
 // never sample an adjacent pose. A 20-percent empty gutter preserves all
 // lance tips and explosion shards, without enlarging the visible sprite.
 function paint(ctx,key,frame,point,size,alpha=1,anchorX=.5,displayHeight=size){
  const image=images.get(key),m=M[key];if(!image)return;
  const n=Math.max(0,Math.min(m.frames-1,Math.floor(frame))),col=n%m.cols,row=Math.floor(n/m.cols);
  const x0=Math.round(col*image.width/m.cols),x1=Math.round((col+1)*image.width/m.cols),y0=Math.round(row*image.height/m.rows),y1=Math.round((row+1)*image.height/m.rows);
  const registration=key==='bleedLoop'?image.woundRegistration?.[n]:null;if(registration)point={x:point.x+registration.x*size,y:point.y+registration.y*displayHeight};
  ctx.save();ctx.globalAlpha=alpha;
  if(key.startsWith('mire')||['bossBrandPress','bossBrandImpact','bossBrandLoop','soldierCleave','stoneStrike','rotClaw','mineScreech','ironCharge','ironShell','minerPick','rockFist','rockFracture','brandFlight','brandImpact','brandLoop','executionActor','executionTool','executionImpact','executionWave','executionAsh','executionShards'].includes(key)||key==='cavalry'||key==='wraithWave'||key==='wraithImpact'||key==='boneStomp'||key==='boneImpact'||key==='boneFinal'){
   const pose=cavalryFrame(image,m,n),ratio=size/pose.spriteWidth,vertical=key.startsWith('mire')?displayHeight/pose.spriteHeight:['boneFinal','ironShell','rockFracture','ironWhip','executionActor','executionTool','executionAsh','executionShards'].includes(key)?displayHeight/pose.spriteHeight:ratio,height=pose.spriteHeight*vertical,pad=pose.spritePadding*ratio,padY=pose.spritePadding*vertical;
   ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
   ctx.drawImage(pose,0,0,pose.width,pose.height,point.x-size*anchorX-pad,point.y-height*(key==='cavalry'?.52:.5)-padY,pose.width*ratio,pose.height*vertical);
  }else ctx.drawImage(image,x0,y0,x1-x0,y1-y0,point.x-size*anchorX,point.y-displayHeight*.5,size,displayHeight);
  ctx.restore();
 }
 // Cache jaw halves and individual fang regions from the approved PNG.
 // Bone and glow stay separate from the damage pipeline.
 function mawPaint(ctx,n,part,point,w,h,alpha){
  const pose=mawTexture(n,part);if(!pose)return;
  const sx=w/pose.spriteWidth,sy=h/pose.spriteHeight;
  ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(pose,0,0,pose.width,pose.height,point.x-w/2-pose.spritePadding*sx,point.y-h/2-pose.spritePadding*sy,pose.width*sx,pose.height*sy);ctx.restore();
 }
 // Register each fire core independently, then map the original portrait through
 // object-fit:cover (including the frame border) on desktop and mobile.
 function houndEyes(ctx,pose,p,alpha){
  const image=images.get('houndHaste'),m=M.houndHaste;if(!image)return;
  const eyes=houndTextures(pose);
  const cover=Math.max((p.width-2)/m.portraitWidth,(p.height-2)/m.portraitHeight),iw=m.portraitWidth*cover,ih=m.portraitHeight*cover;
  const scale=iw*.75/(image.width/3);
  ctx.save();ctx.globalAlpha=alpha;
  for(const eye of eyes){const uv=m.sockets[eye.eyeIndex],tx=p.x+(uv[0]-.5)*iw,ty=p.y+(uv[1]-.5)*ih;
   ctx.drawImage(eye,0,0,eye.width,eye.height,tx-eye.eyeCore[0]*scale,ty-eye.eyeCore[1]*scale,eye.width*scale,eye.height*scale);
  }ctx.restore();
 }
 // Portrait-relative border draw, with an explicit empty face opening.
 function armor(ctx,key,pose,p,alpha,formAge=null){
  const w=p.width*1.06,h=p.height*1.06,forming=formAge!==null&&formAge<300&&!reduced(),spread=p.width*.13;
  ctx.save();ctx.beginPath();ctx.rect(p.x-w/2-spread,p.y-h/2-spread,w+2*spread,h+2*spread);
  ctx.rect(p.x-p.width*.45,p.y-p.height*.45,p.width*.90,p.height*.90);ctx.clip('evenodd');
  if(forming){
   // Eight clipped pieces assemble once, then lock to one stationary silhouette.
   for(let part=0;part<8;part++){
    const col=part%4,row=Math.floor(part/4),t=smooth((formAge-part*14)/190),dx=(col-1.5)/1.5*spread*(1-t),dy=(row?1:-1)*spread*(1-t);
    ctx.save();ctx.beginPath();ctx.rect(p.x-w/2+col*w/4+dx,p.y-h/2+row*h/2+dy,w/4+.5,h/2+.5);ctx.clip();
    paint(ctx,key,0,{x:p.x+dx,y:p.y+dy},w,alpha*smooth((formAge-part*14+25)/90),.5,h);ctx.restore();
   }
  }else{
   ctx.filter=reduced()?'none':`brightness(${1.10+.15*Math.sin(clock()/180)})`;
   paint(ctx,key,0,p,w,alpha,.5,h);ctx.filter='none';
  }
  // Two opposed highlights travel on the frame; the stones never bob or scale.
  if(!reduced())for(let sweep=0;sweep<2;sweep++){
   const x=w*.46,y=h*.46,perimeter=4*(x+y),d=((clock()%1100)/1100+sweep*.5)%1*perimeter;
   let light;if(d<2*x)light={x:p.x-x+d,y:p.y-y};else if(d<2*x+2*y)light={x:p.x+x,y:p.y-y+d-2*x};else if(d<4*x+2*y)light={x:p.x+x-(d-2*x-2*y),y:p.y+y};else light={x:p.x-x,y:p.y+y-(d-4*x-2*y)};
   ctx.save();ctx.beginPath();ctx.arc(light.x,light.y,Math.min(w,h)*.27,0,Math.PI*2);ctx.clip();ctx.filter='brightness(3.2) saturate(1.45)';ctx.globalCompositeOperation='screen';
   paint(ctx,key,0,p,w,alpha*(forming?smooth(formAge/300):1)*.78,.5,h);ctx.restore();
  }ctx.restore();
 }
 function smooth(t){t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);}
 function curseDim(fx,age,opacity){
  if(!fx.dim){const el=document.createElement('div');el.className=fx.ability==='boneBurial'?'monster-maw-dim':fx.ability==='charge'?'monster-charge-dim':'monster-curse-dim';el.setAttribute('aria-hidden','true');fx.stage.appendChild(el);fx.dim=el;}
  const outStart=fx.ability==='ironWhip'?800:fx.ability==='boneBurial'?980:fx.ability==='charge'?1250:fx.ability==='boneCurse'?220:440,outMs=fx.ability==='ironWhip'?300:fx.ability==='boneBurial'?340:fx.ability==='charge'?230:fx.ability==='boneCurse'?140:280;
  const envelope=smooth(age/(fx.ability==='ironWhip'?180:fx.ability==='boneBurial'?200:fx.ability==='boneCurse'?120:240))*(1-smooth((age-outStart)/outMs));
  fx.dim.style.opacity=String(envelope*(fx.ability==='ironWhip'?.46:fx.ability==='boneBurial'?.66:.58)*opacity);
 }
 function clock(){return state?.clock??0;}
  // Chapter 3 sprites use registered contact pivots and isolated atlas cells.
 function c3paint(ctx,key,pose,target,w,alpha=1,core=[.5,.5],h=w){
  paint(ctx,key,pose,{x:target.x+(.5-core[0])*w,y:target.y+(.5-core[1])*h},w,alpha,.5,h);
 }
 function bossBrandTier(tier){return tier==='guardian'||tier==='boss';}
 function bossBrandPaint(ctx,key,pose,target,w,alpha){
  const m=M[key];if(!m)return;const col=pose%m.cols,row=Math.floor(pose/m.cols),cw=Math.round((col+1)*m.width/m.cols)-Math.round(col*m.width/m.cols),ch=Math.round((row+1)*m.height/m.rows)-Math.round(row*m.height/m.rows),core=images.get(key)?.bossBrandRegistration?.[pose]??(key==='bossBrandPress'?[.28,.55]:[.5,.56]);
  c3paint(ctx,key,pose,target,w,alpha,core,w*ch/cw);
 }
 function bossBrandMark(ctx,g,until,visualUntil,opacity=1){
  const local=clock()-(until-3000);if(local<0||clock()>=visualUntil)return;
  const cycle=((local%1000)+1000)%1000,pose=reduced()?0:[2,3,4,5,0,0][Math.min(5,Math.floor(cycle/65))],remaining=Math.max(0,Math.min(1,(until-clock())/3000));
  const alpha=.72*smooth(local/120)*(1-smooth((clock()-until)/400))*opacity;
  ctx.save();ctx.filter=`saturate(${.45+.55*remaining}) brightness(${.85+.15*remaining})`;
  bossBrandPaint(ctx,'bossBrandLoop',pose,{x:g.player.x,y:g.player.y+g.player.height*.08},g.player.width*.95,alpha);ctx.restore();
 }
 function bossBrandAttack(ctx,fx,g,age,opacity){
  curseDim(fx,age,opacity);
  const contact={x:g.player.x,y:g.player.y+g.player.height*.08},w=g.player.width*1.65,from={x:Math.min(g.enemy.x-g.enemy.width*.30,g.width-w*.78-8),y:g.enemy.y};
  const press=reduced()?1:Math.max(0,Math.min(1,(age-220)/300))**2.6,withdraw=smooth((age-610)/240);
  const point=age<520?{x:from.x+(contact.x-from.x)*press,y:from.y+(contact.y-from.y)*press}:{x:contact.x+g.player.width*.15*withdraw,y:contact.y};
  const pose=reduced()?2:age<90?0:age<150?1:age<220?2:age<370?3:age<520?4:age<610?5:age<680?6:age<750?7:age<850?8:age<930?9:age<1010?10:11;
  const hit=fx.hits?.[0],missed=hit?.landed===false,landed=hit?.landed===true;
  if(missed&&age>=520){bossBrandPaint(ctx,'bossBrandPress',4,{x:contact.x+g.player.width*.35*smooth((age-520)/200),y:contact.y},w,opacity*.32*(1-smooth((age-520)/220)));return;}
  if(age<520||landed)bossBrandPaint(ctx,'bossBrandPress',pose,point,w,opacity*smooth(age/100)*(1-smooth((age-850)/250)));
  if(landed&&age>=520){
   const after=age-520;
   if(after<500)bossBrandPaint(ctx,'bossBrandImpact',reduced()?2:Math.min(7,Math.floor(after/62.5)),contact,g.player.width*1.05,opacity*.80*(1-smooth((after-180)/320)));
   const until=state?.brandUntil>0?state.brandUntil:fx.start+(fx.pauseMs??0)+520+3000,visualUntil=state?.brandVisualUntil>0?state.brandVisualUntil:until+400;
   bossBrandMark(ctx,g,until,visualUntil,opacity*smooth((age-640)/140));
  }
 }
 function chapter3Impact(event,el){
  if(!['mineScreech','ironCharge','minerPick','rockFist','ironWhip','ironExecution'].includes(event.ability))return false;
  const soft=event.ability==='mineScreech',last=false;
  const portrait=el.querySelector('.fighter.player .fighter-frame'),mobile=el.clientWidth<600;
  if(soft){
   curseReaction=portrait?.animate?.([{filter:'brightness(1) saturate(1)',translate:'0px 0px'},{filter:'brightness(.76) saturate(.45)',translate:`0px ${mobile?2:3}px`,offset:.25},{filter:'brightness(1) saturate(1)',translate:'0px 0px'}],{duration:600,easing:'ease-in-out'});
   return true;
  }
  const bossBrand=event.ability==='ironWhip'&&bossBrandTier(event.tier),execution=event.ability==='ironExecution',heavy=bossBrand||execution||event.ability==='rockFist'||last,vertical=execution||event.ability==='minerPick'||event.ability==='rockFist'||last,d=(mobile?3:5)*(execution?2.2:bossBrand?1.8:heavy?1.5:1);
  const dx=event.ability==='rockFist'?-d*.82:vertical?-d*.30:-d,dy=vertical?d:d*.18;
  shake=el.animate?.([{transform:'translate(0,0)'},{transform:`translate(${dx}px,${dy}px)`,offset:.18},{transform:`translate(${-dx*.5}px,${-dy*.5}px)`,offset:.42},{transform:'translate(0,0)'}],{duration:heavy?240:150,easing:'ease-out'});
  const push=mobile?(bossBrand?3:2):(bossBrand?5:4);
  if(bossBrand)curseReaction=portrait?.animate?.([{translate:'0px 0px',scale:'1 1'},{translate:`${-push}px 0px`,scale:'.97 1',offset:.18},{translate:`${-push*.6}px 0px`,scale:'.98 1',offset:.45},{translate:'0px 0px',scale:'1 1'}],{duration:280,easing:'ease-out'});
  else curseReaction=portrait?.animate?.([{translate:'0px 0px'},{translate:vertical?`${-push*.3}px ${push}px`:`${-push}px 0px`,offset:.22},{translate:'0px 0px'}],{duration:heavy?320:230,easing:'ease-out'});
  const overlay=document.createElement('div');flash=overlay;overlay.className='monster-screen-impact';overlay.style.background=event.ability==='ironWhip'?'#6d001f':'#b9a58a';el.appendChild(overlay);
  overlay.animate?.([{opacity:0},{opacity:execution?.32:heavy?.22:.12,offset:.15},{opacity:0}],{duration:heavy?150:100,fill:'forwards'}).finished.then(()=>{overlay.remove();if(flash===overlay)flash=null;}).catch(()=>{});
  return true;
 }
  function executionLayer(fx,name,z,g){
  const key=name+'Canvas';if(!fx[key]){const c=document.createElement('canvas');c.className='monster-sprite-canvas';c.style.zIndex=String(z);c.setAttribute('aria-hidden','true');fx.stage.appendChild(c);fx[key]=c;}
  const c=fx[key],dpr=Math.min(2,devicePixelRatio||1),w=Math.round(g.width*dpr),h=Math.round(g.height*dpr);if(c.width!==w||c.height!==h){c.width=w;c.height=h;}
  const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,g.width,g.height);return ctx;
 }
 function ironExecution(ctx,fx,g,age,opacity){
  fx.canvas.style.zIndex='12';
  const back=executionLayer(fx,'actor',1,g),tool=executionLayer(fx,'tool',9,g);
  if(!fx.dim){const dim=document.createElement('div');dim.className='monster-maw-dim';dim.setAttribute('aria-hidden','true');dim.style.zIndex='4';fx.stage.appendChild(dim);fx.dim=dim;}
  fx.dim.style.opacity=String(.50*smooth(age/200)*(1-smooth((age-1100)/400))*opacity);
  const center=(g.player.x+g.enemy.x)/2,ground=Math.min(g.height-12,g.player.y+g.player.height*.44);
  const actorH=Math.min(g.player.height*1.65,g.height*.72,(ground-16)/1.02),actorW=actorH*.82;
  const bodyPose=age<80?0:age<160?1:age<240?2:age<300?3:age<360?4:age<420?5:age<540?6:age<640?7:age<700?8:age<940?9:age<1120?10:11;
  const hands=[[.41,.51],[.36,.47],[.35,.40],[.39,.23],[.50,.055],[.49,.05],[.49,.05],[.37,.78],[.36,.72],[.36,.72],[.36,.72],[.36,.72]];
  const bodyPoint={x:center+actorW*.12,y:ground},bodyAlpha=.62*smooth(age/140)*(1-smooth((age-980)/420))*opacity;
  c3paint(back,'executionActor',bodyPose,bodyPoint,actorW,bodyAlpha,[.5,.95],actorH);
  if(age<1220){
   const hand=hands[bodyPose],grip={x:bodyPoint.x+(hand[0]-.5)*actorW,y:ground+(hand[1]-.95)*actorH};
   const pose=age<240?0:age<320?1:age<480?2:age<560?3:age<640?4:age<800?5:age<940?6:7;
   const h=actorH*.55,w=h*.90,core=[.5,pose<4?.46:pose===4?.48:.45];
   // The lower tool pose is locked to the ground for the impact hold.
   const point=age>=640?{x:center,y:ground-(.89-core[1])*h}:grip;
   c3paint(tool,'executionTool',pose,point,w,opacity*(1-smooth((age-980)/240)),core,h);
  }
  if(age>=640){
   // The authoritative 640ms main hit owns the one strong impact feedback.
   const after=age-640;if(after<480){const pose=Math.min(7,Math.floor(after/60));c3paint(tool,'executionImpact',pose,{x:center,y:ground},Math.min(g.width*.68,actorW*1.8),opacity*(1-smooth((after-360)/120)),[.5,pose<4?.92:.72]);}
   if(after<860){
    const pose=Math.min(7,Math.floor(after/108)),reg=images.get('executionShards')?.effectRegistration?.[pose]??{x:.5,y:.72,width:1,height:1};
    const spread=.22+.78*smooth(after/280),fall=g.height*.23*smooth((after-240)/620),lift=g.height*.15*smooth(after/220);
    c3paint(ctx,'executionShards',pose,{x:center,y:ground-12-lift+fall},g.width*.94*spread/reg.width,opacity*(1-smooth((after-440)/420)),[reg.x,reg.y],g.height*.70*spread/reg.height);
   }
  }
  for(let wave=0;wave<4;wave++){
   const begin=640+wave*180,hitAt=begin+180,local=age-begin,after=age-hitAt;if(local<0||after>=140)continue;
   const hit=fx.hits?.[wave+1],landed=hit?.landed===true,missed=hit?.landed===false,t=Math.min(1,local/180);
   const p={x:center+(g.player.x-center)*t-(missed?g.player.width*.25*smooth(after/140):0),y:ground};
   const pose=local<180?Math.min(2,Math.floor(local/60)):missed?2:Math.min(5,3+Math.floor(after/47));
   const cores=[[.18,.85],[.15,.85],[.12,.85],[.12,.72],[.15,.65],[.20,.65]];
   if(local<180||landed||missed)c3paint(tool,'executionWave',reduced()?2:pose,p,Math.min(g.width*.42,g.player.width*1.30),opacity*(missed?.20:.55)*(1-smooth(Math.max(0,after)/140)),cores[reduced()?2:pose]);
   if(landed&&after>=0&&after<120){
    const dx=[-.12,.10,-.08,.05][wave]*g.player.width,dy=[-.18,.02,.15,.08][wave]*g.player.height;
    c3paint(ctx,'executionImpact',Math.min(2,Math.floor(after/40)),{x:g.player.x+dx,y:g.player.y+dy},g.player.width*.65,opacity*.48*(1-smooth(after/120)),[.5,.92]);
   }
  }
  if(age>=700){
   const local=age-700,pose=local<240?Math.min(3,Math.floor(local/60)):local<350?3:Math.min(7,4+Math.floor((local-350)/112));
   const alpha=.86*smooth(local/160)*(1-smooth((age-1130)/370))*opacity;
   const reg=images.get('executionAsh')?.effectRegistration?.[pose]??{centerX:.5,bottom:.94,width:1,height:1};
   const expansion=.35+.65*smooth(local/240);
   c3paint(ctx,'executionAsh',pose,{x:g.width*.5,y:g.height*1.02},g.width*1.2*expansion/reg.width,alpha,[reg.centerX,reg.bottom],g.height*1.20*expansion/reg.height);
  }
 }

 function chapter3Attack(ctx,fx,current,age,opacity){
  if(!['mineScreech','ironCharge','minerPick','rockFist','ironWhip','ironExecution'].includes(fx.ability))return false;
  const layout=[current.width,current.height,current.player.width,current.player.height].join(':');
  if(fx.c3layout!==layout){fx.c3layout=layout;fx.c3geometry=current;}
  const g=fx.c3geometry,end={x:g.player.x,y:g.player.y},start={x:g.enemy.x,y:g.enemy.y};
  if(fx.ability==='ironExecution'){ironExecution(ctx,fx,g,age,opacity);return true;}
  const miss=fx.hits?.[0]?.landed===false,landed=fx.hits?.[0]?.landed===true;
  if(fx.ability==='mineScreech'){
   if(!fx.monsterEl||!fx.monsterEl.isConnected)fx.monsterEl=fx.stage.querySelector('.fighter.enemy .fighter-frame');
   const envelope=smooth(age/40)*(1-smooth((age-220)/160)),amplitude=(g.width<600?2:3)*envelope;
   if(fx.monsterEl?.style)fx.monsterEl.style.translate=reduced()?'':`${Math.sin(age*.11)*amplitude}px ${Math.sin(age*.17)*amplitude*.40}px`;
   const flight=age<280,t=reduced()?1:Math.min(1,age/280),pose=flight?Math.min(3,Math.floor(age/70)):Math.min(7,4+Math.floor((age-280)/85));
   const w=Math.min(g.width*.50,g.player.height*1.18)*(flight?.65+.35*t:1),p=flight?{x:start.x+(end.x-start.x)*t,y:start.y+(end.y-start.y)*t}:end;
   if(flight||landed)c3paint(ctx,'mineScreech',reduced()?4:pose,p,w,opacity*(flight?1:1-smooth((age-480)/140)),flight?[.22,.52]:[.5,.5]);
  }
  if(fx.ability==='ironCharge'){
   const t=reduced()?1:Math.min(1,age/240)**1.8,after=Math.max(0,age-240),pose=age<240?Math.min(3,Math.floor(age/60)):Math.min(7,4+Math.floor(after/100));
   const cores=[[.30,.64],[.08,.64],[.06,.64],[.05,.64],[.22,.55],[.25,.55],[.3,.55],[.5,.55]],w=Math.min(g.width*.48,g.player.width*1.65);
   let p={x:start.x+(end.x-start.x)*t,y:start.y+(end.y-start.y)*t};
   if(miss&&age>=240){p.x-=g.player.width*.4*smooth(after/200);c3paint(ctx,'ironCharge',3,p,w,opacity*(1-smooth(after/250))*.4,cores[3]);}
   else if(age<240||landed)c3paint(ctx,'ironCharge',reduced()?4:pose,p,w,opacity*(1-smooth((age-530)/110)),cores[pose]);
  }
  if(fx.ability==='minerPick'){
   // Constant horizontal velocity and constant downward acceleration.
   // Counterclockwise tumble ends with the head down-left, matching contact pose 8.
   // Aim the airborne centre past the contact point so the head lands without a pivot jump.
   const flight=age<480,t=reduced()?1:Math.max(0,Math.min(1,age/480)),w=Math.min(g.width*.53,g.player.height*.98);
   const lift=Math.max(0,Math.min(90,g.player.height*.30,Math.min(start.y,end.y)-w*.35-10));
   const landing={x:end.x+(.5-.32)*w,y:end.y+(.5-.70)*w};
   const p=flight&&!reduced()?{x:start.x+(landing.x-start.x)*t,y:start.y+(landing.y-start.y)*t-4*lift*t*(1-t)}:end;
   const after=age-480,pose=flight?[6,5,4,3,2,1,0,7][Math.min(7,Math.floor(age/60))]:after<70?8:after<150?9:after<230?10:11;
   if(miss&&!flight){c3paint(ctx,'minerPick',7,{x:end.x-g.player.width*.3*smooth(after/200),y:end.y+20*smooth(after/200)},w,opacity*(1-smooth(after/230))*.4,[.32,.70]);}
   else if(flight||landed)c3paint(ctx,'minerPick',reduced()?8:pose,p,w,opacity*(1-smooth((age-710)/110)),reduced()?[.32,.70]:flight?[.5,.5]:pose===8?[.32,.70]:pose===9?[.32,.65]:[.5,.5]);
  }
  if(fx.ability==='rockFist'){
   // Charge at the target's upper right; every pose uses a registered contact
   // pivot so atlas motion cannot add a second flight or jump at impact.
   const baseSize=Math.min(g.player.width*.90,g.width*.34,g.height*.26),w=baseSize*2.25,hit={x:end.x,y:end.y+4};
   const high={x:hit.x+g.player.width*.65,y:Math.max(w*.48+8,hit.y-Math.min(100,g.player.height*.45))};
   const drop=reduced()?1:Math.max(0,Math.min(1,(age-460)/160))**2.3;
   let p=age<460?high:{x:high.x+(hit.x-high.x)*drop,y:high.y+(hit.y-high.y)*drop};
   const pose=reduced()?(age<620?4:8):age<80?0:age<160?1:age<240?2:age<340?3:age<460?4:age<520?5:age<570?6:age<620?7:age<700?8:age<780?9:age<900?10:11;
   const cores=[[.66,.68],[.57,.65],[.60,.69],[.51,.72],[.53,.70],[.54,.73],[.59,.86],[.52,.88],[.51,.80],[.50,.65],[.51,.62],[.53,.60]];
   const angle=Math.atan2(high.x-hit.x,hit.y-high.y);
   if(age>=620)p=hit;
   let frame=pose,alpha=opacity*smooth(age/70)*(1-smooth((age-960)/140));
   if(miss&&age>=620){const t=smooth((age-620)/200);p={x:hit.x-g.player.width*.22*t,y:hit.y+30*t};frame=6;alpha=opacity*.35*(1-smooth((age-620)/220));}
   if(age<620||landed||miss){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(angle);c3paint(ctx,'rockFist',frame,{x:0,y:0},w,alpha,cores[frame]);ctx.restore();}
  }
  if(fx.ability==='ironWhip'){
   if(fx.presentation==='boss-brand-press-v1'||bossBrandTier(fx.tier)){bossBrandAttack(ctx,fx,g,age,opacity);return true;}
   const flight=age<320,t=reduced()?1:smooth(Math.min(1,age/320)),key=flight?'brandFlight':'brandImpact';
   const pose=reduced()?(flight?7:2):flight?Math.min(7,Math.floor(age/40)):Math.min(7,Math.floor((age-320)/60));
   const p=flight?{x:start.x+(end.x-start.x)*t,y:start.y+(end.y+g.player.height*.08-start.y)*t}:{x:end.x,y:end.y+g.player.height*.08};
   const w=Math.min(g.player.width*1.10,g.width*.43),core=images.get(key)?.brandRegistration?.[pose]??[.5,.5];
   if(flight||landed)c3paint(ctx,key,pose,p,w,opacity*(flight?1:1-smooth((age-680)/120)),core);
   else if(miss)c3paint(ctx,'brandFlight',7,{x:p.x-g.player.width*.30*smooth((age-320)/220),y:p.y},w,opacity*.35*(1-smooth((age-320)/250)),images.get('brandFlight')?.brandRegistration?.[7]??[.5,.5]);
  }
  return true;
 }
 // Chapter 4: one attack canvas per skill and separate registered status layers.
 const chapter4Abilities=new Set(['venomPierce','mudPalm','miasmaBreath','serpentHex','mireTail','mireTide']);
 function c4paint(ctx,key,pose,p,w,alpha=1,core=[.5,.5],h=w){
  ctx.save();if(key==='mireBreath')ctx.filter='brightness(1.9) saturate(1.15)';
  c3paint(ctx,key,pose,p,w,Math.max(0,Math.min(1,alpha)),core,h);ctx.restore();
 }
 function c4Egg(ctx,group,pose,point,w,alpha=1,core=[.5,.5]){
  // Each pose is its own image; sampling cannot reach an adjacent frame.
  const key='venomEgg'+group+String(pose+1).padStart(2,'0');
  c4paint(ctx,key,0,point,w*2,alpha,core,w*2);
 }
 function c4Shadow(ctx,group,pose,point,size,alpha=1){
  // Crossfade independent, padded frames; never sample a neighboring pose.
  const value=Math.max(0,Math.min(7,pose)),first=Math.floor(value),mix=reduced()?0:value-first;
  c4paint(ctx,'miasmaShadow'+group+String(first+1).padStart(2,'0'),0,point,size,alpha*(1-mix));
  if(mix)c4paint(ctx,'miasmaShadow'+group+String(Math.min(7,first+1)+1).padStart(2,'0'),0,point,size,alpha*mix);
 }
 function c4Python(ctx,group,pose,point,size,alpha=1,invert=false){
  const value=Math.max(0,Math.min(7,pose)),first=Math.floor(value),mix=reduced()?0:value-first;
  ctx.save();ctx.translate(point.x,point.y);if(invert)ctx.scale(1,-1);
  for(const [index,weight]of [[first,1-mix],[Math.min(7,first+1),mix]]){
   if(weight<=0)continue;
   const key='twinPython'+group+String(index+1).padStart(2,'0');
   c4paint(ctx,key,0,{x:0,y:0},size,alpha*weight,M[key].core??[.5,.5]);
  }ctx.restore();
 }
 function c4Monster(fx){
  if(!fx.monsterEl||!fx.monsterEl.isConnected)fx.monsterEl=fx.stage.querySelector('.fighter.enemy .fighter-frame');
  return fx.monsterEl;
 }
 function c4Dim(fx,age,opacity,boss=false){
  if(!fx.dim){const dim=document.createElement('div');dim.className='monster-curse-dim';dim.style.background='#08170d';dim.setAttribute('aria-hidden','true');fx.stage.appendChild(dim);fx.dim=dim;}
  const end=boss?1660:1000,out=boss?1260:740;
  fx.dim.style.opacity=String((boss?.58:.37)*smooth(age/(boss?220:200))*(1-smooth((age-out)/(end-out)))*opacity);
 }
 function chapter4Impact(event,el){
  if(!chapter4Abilities.has(event.ability))return false;
  const p=el.querySelector('.fighter.player .fighter-frame'),mobile=el.clientWidth<600;
  if(event.ability==='venomPierce'){
   if(event.index===0){
    const d=mobile?1:1.5;
    curseReaction=p?.animate?.([{translate:'0px 0px',filter:'brightness(1)'},{translate:`${-d}px 0px`,filter:'brightness(.92)',offset:.28},{translate:'0px 0px',filter:'brightness(1)'}],{duration:150,easing:'ease-out'});
    return true;
   }
   const d=mobile?3.5:5;
   curseReaction=p?.animate?.([{translate:'0px 0px',filter:'brightness(1)'},{translate:`${-d}px ${d*.18}px`,filter:'brightness(.80) saturate(.76)',offset:.18},{translate:`${d*.28}px 0px`,filter:'brightness(.94)',offset:.46},{translate:'0px 0px',filter:'brightness(1)'}],{duration:210,easing:'ease-out'});
   shake=el.animate?.([{transform:'translate(0,0)'},{transform:`translate(${-d*.7}px,${d*.22}px)`,offset:.18},{transform:`translate(${d*.32}px,0)`,offset:.46},{transform:'translate(0,0)'}],{duration:140,easing:'ease-out'});
   const f=document.createElement('div');f.className='monster-screen-impact';f.style.background='#344b19';flash=f;el.appendChild(f);
   f.animate?.([{opacity:0},{opacity:.17,offset:.2},{opacity:0}],{duration:110,fill:'forwards'}).finished.then(()=>{f.remove();if(flash===f)flash=null;}).catch(()=>{});
   return true;
  }
  if(event.ability==='mireTail'){
   const d=mobile?4:6,up=mobile?5:8;
   curseReaction=p?.animate?.([{translate:'0px 0px'},{translate:`${-d}px ${-up}px`,offset:.20},{translate:`${-d*.45}px ${-up*.3}px`,offset:.56},{translate:'0px 0px'}],{duration:330,easing:'ease-out'});
   shake=el.animate?.([{transform:'translate(0,0)'},{transform:`translate(${-d}px,${-d*.3}px)`,offset:.15},{transform:`translate(${d*.5}px,${d*.25}px)`,offset:.36},{transform:`translate(${-d*.2}px,0)`,offset:.60},{transform:'translate(0,0)'}],{duration:210,easing:'ease-out'});
   const f=document.createElement('div');f.className='monster-screen-impact';f.style.background='#34471e';flash=f;el.appendChild(f);
   f.animate?.([{opacity:0},{opacity:.23,offset:.2},{opacity:0}],{duration:120,fill:'forwards'}).finished.then(()=>{f.remove();if(flash===f)flash=null;}).catch(()=>{});return true;
  }
  if(event.ability==='mireTide'){
   const d=mobile?3.5:5;
   curseReaction=p?.animate?.([{translate:'0px 0px',filter:'brightness(1)'},{translate:`${-d}px 0px`,filter:'brightness(.82) saturate(.72)',offset:.20},{translate:`${d*.25}px 0px`,filter:'brightness(.95)',offset:.48},{translate:'0px 0px',filter:'brightness(1)'}],{duration:160,easing:'ease-out'});
   shake=el.animate?.([{transform:'translate(0,0)'},{transform:`translate(${-d*.65}px,${d*.15}px)`,offset:.18},{transform:`translate(${d*.30}px,0)`,offset:.45},{transform:'translate(0,0)'}],{duration:110,easing:'ease-out'});
   const f=document.createElement('div');f.className='monster-screen-impact';f.style.background='#7f9b25';flash=f;el.appendChild(f);
   f.animate?.([{opacity:0},{opacity:.11,offset:.2},{opacity:0}],{duration:95,fill:'forwards'}).finished.then(()=>{f.remove();if(flash===f)flash=null;}).catch(()=>{});
   return true;
  }
  if(event.ability==='serpentHex'){
   const d=mobile?2.5:4,side=event.index===0?-1:1;
   curseReaction=p?.animate?.([{translate:'0px 0px',scale:'1 1',filter:'brightness(1)'},{translate:`${side*d}px 0px`,scale:event.index===1?'.97 1.015':'.99 1',filter:'brightness(.78) saturate(.75)',offset:.24},{translate:`${side*d*.35}px 0px`,scale:'.99 1',filter:'brightness(.91)',offset:.60},{translate:'0px 0px',scale:'1 1',filter:'brightness(1)'}],{duration:event.index===0?220:320,easing:'ease-out'});
   return true;
  }
  if(event.ability==='miasmaBreath'){
   const sink=mobile?2:4;
   curseReaction=p?.animate?.([{translate:'0px 0px',filter:'saturate(1) brightness(1)'},{translate:`0px ${sink}px`,filter:'saturate(.45) brightness(.78)',offset:.32},{translate:`0px ${sink*.6}px`,filter:'saturate(.65) brightness(.88)',offset:.64},{translate:'0px 0px',filter:'saturate(1) brightness(1)'}],{duration:680,easing:'ease-in-out'});
   return true;
  }
  const tide=event.ability==='mireTide',main=tide&&event.index===0,heavy=main||event.ability==='mudPalm'||event.ability==='mireTail',d=(mobile?3:5)*(main?2.2:event.ability==='mireTail'?1.5:heavy?1.2:.65);
  curseReaction=p?.animate?.([{translate:'0px 0px',scale:'1 1'},{translate:`${-d}px ${event.ability==='mudPalm'?d*.3:0}px`,scale:heavy?'.97 1':'1 1',offset:.16},{translate:`${-d*.7}px 0px`,scale:'1 1',offset:.42},{translate:'0px 0px',scale:'1 1'}],{duration:heavy?330:170,easing:'ease-out'});
  // Only heavy physical contact shakes the stage. Poison and the two residual tides do not.
  if(heavy)shake=el.animate?.([{transform:'translate(0,0)'},{transform:`translate(${-d}px,${d*.25}px)`,offset:.13},{transform:`translate(${d*.5}px,${-d*.18}px)`,offset:.35},{transform:`translate(${-d*.22}px,0)`,offset:.56},{transform:'translate(0,0)'}],{duration:main?280:190,easing:'ease-out'});
  if(main){const fx=active.get(event.castId);if(fx)fx.contactHoldAt=clock();}
  const flashEl=document.createElement('div');flashEl.className='monster-screen-impact';flashEl.style.background=main?'#a8ad55':'#65701f';flash=flashEl;el.appendChild(flashEl);
  flashEl.animate?.([{opacity:0},{opacity:main?.27:heavy?.16:.08,offset:.16},{opacity:0}],{duration:main?130:95,fill:'forwards'}).finished.then(()=>{flashEl.remove();if(flash===flashEl)flash=null;}).catch(()=>{});
  return true;
 }
 function chapter4Attack(ctx,fx,current,age,opacity){
  if(!chapter4Abilities.has(fx.ability))return false;
  const monster=c4Monster(fx),steady=fx.ability==='mireTide'||fx.ability==='venomPierce'||fx.ability==='miasmaBreath'||fx.ability==='serpentHex';
  // Portrait rect dimensions include impact transforms and floating-point noise.
  // Keep breath anchored to its cast layout until the stage itself really resizes.
  const layout=(steady?[current.width,current.height]:[current.width,current.height,current.player.width,current.player.height]).join(':');
  if(fx.c4layout!==layout){
   if(steady){
    const enemy={...current.enemy};
    if(fx.c4geometry){
     // A real resize must not absorb the portrait's own concealment translation.
     const shift=String(monster?.style?.translate??'').trim().split(/\s+/);
     enemy.x-=Number.parseFloat(shift[0])||0;enemy.y-=Number.parseFloat(shift[1])||0;
    }
    fx.c4geometry={...current,player:{...current.player},enemy};
   }else fx.c4geometry=current;
   fx.c4layout=layout;
  }
  const g=fx.c4geometry,p=g.player,e=g.enemy,hit=fx.hits?.[0],landed=hit?.landed===true,missed=hit?.landed===false,small=g.width<600;
  if(fx.ability==='venomPierce'){
   const launchAt=240,contact=600,rupture=1200,blast=1320,end=1920;
   const tense=smooth(age/140)*(1-smooth((age-240)/180));
   const recoil=(small?1.5:2.5)*smooth((age-launchAt)/50)*(1-smooth((age-300)/150));
   if(monster?.style)monster.style.translate=reduced()?'':`${Math.sin(age*.07)*(small?.6:1)*tense+recoil}px 0px`;
   const abdomen={x:e.x,y:e.y-e.height*.22};
   if(age<420){
    const pose=reduced()?3:Math.min(5,Math.floor(age/60));
    const cores=[[.5,.5],[.5,.5],[.5,.5],[.5,.5],[.64,.51],[.54,.5]];
    c4Egg(ctx,'Cast',pose,abdomen,e.width*.92,opacity*.88*smooth(age/65)*(1-smooth((age-330)/90)),cores[pose]);
   }
   const origin={x:abdomen.x-e.width*.66,y:abdomen.y-e.width*.04};
   const target={x:p.x,y:p.y-p.height*.02},firstMiss=fx.hits?.[0]?.landed===false;
   const off={x:target.x-p.width*.24,y:target.y+p.height*.20};
   if(age>=launchAt&&age<contact){
    const t=Math.max(0,Math.min(1,(age-launchAt)/(contact-launchAt))),flight=reduced()?1:t*t;
    const point={x:origin.x+(target.x-origin.x)*flight,y:origin.y+(target.y-origin.y)*flight-(reduced()?0:Math.sin(Math.PI*flight)*p.height*.13)};
    const angle=reduced()?0:Math.atan2(origin.y-target.y,origin.x-target.x);
    ctx.save();ctx.translate(point.x,point.y);ctx.rotate(angle);
    c4Egg(ctx,'Flight',reduced()?0:Math.min(5,Math.floor((age-launchAt)/60)),{x:0,y:0},p.width*(.54+.16*smooth(t)),opacity*.96,[.4,.5]);ctx.restore();
   }
   if(age>=contact&&age<rupture){
    if(firstMiss){
     // A glancing egg passes the portrait and bursts nearby; the blast rolls independently.
     const t=smooth((age-contact)/280),point={x:target.x+(off.x-target.x)*t,y:target.y+(off.y-target.y)*t};
     c4Egg(ctx,'Flight',reduced()?0:Math.floor((age-contact)/90)%6,point,p.width*.68,opacity*.62,[.4,.5]);
    }else{
     const pose=reduced()?4:Math.min(7,Math.floor((age-contact)/75));
     const pulse=reduced()?1:1+.025*Math.sin((age-contact)*.018);
     c4Egg(ctx,'Attach',pose,target,p.width*.74*pulse,opacity*.96*smooth((age-contact)/55));
    }
   }
   if(age>=rupture&&age<end){
    const pose=reduced()?3:Math.min(11,Math.floor((age-rupture)/60)),miss=fx.hits?.[1]?.landed===false;
    const anchor=firstMiss?off:target,drift=miss?smooth((age-blast)/280):0;
    const point={x:anchor.x-p.width*.16*drift,y:anchor.y+p.height*.08*drift};
    c4Egg(ctx,'Burst',pose,point,p.width*(miss?.98:1.16),opacity*(miss?.48:.98)*(1-smooth((age-1740)/180)));
   }
  }
  if(fx.ability==='mudPalm'){
   const charge=smooth(age/280),push=(small?4:6)*charge*(1-smooth((age-520)/300));
   if(monster?.style)monster.style.translate=reduced()?'':`${-push}px 0px`;
   const t=reduced()?1:Math.max(0,Math.min(1,(age-280)/240))**2.3;
   const pose=reduced()?8:age<280?Math.min(3,Math.floor(age/70)):age<520?4+Math.min(3,Math.floor((age-280)/60)):age<600?8:age<660?9:age<740?10:11;
   const w=p.width*1.28,cores=[[.53,.56],[.53,.56],[.53,.56],[.53,.56],[.48,.53],[.47,.53],[.45,.53],[.44,.53],[.40,.53],[.40,.53],[.43,.53],[.47,.53]];
   const point=age<520?{x:e.x+(p.x-e.x)*t,y:e.y+(p.y-e.y)*t}:p;
   if(age<520||landed)c4paint(ctx,'mireMud',pose,point,w,opacity*smooth(age/80)*(1-smooth((age-750)/280)),cores[pose]);
   else if(missed)c4paint(ctx,'mireMud',7,{x:p.x-p.width*.25*smooth((age-520)/220),y:p.y+20*smooth((age-520)/220)},w,opacity*.3*(1-smooth((age-520)/250)),cores[7]);
   if(landed&&age>=520){const local=age-520;if(local<400)c4paint(ctx,'mireMud',12+Math.min(7,Math.floor(local/50)),p,p.width*1.12,opacity*.8*(1-smooth((local-240)/160)));if(local>=220)c4paint(ctx,'mireMud',20+Math.min(3,Math.floor((local-220)/85)),{x:p.x,y:p.y+p.height*.10},p.width*.72,opacity*.5*(1-smooth((local-300)/260)));}
  }
  if(fx.ability==='miasmaBreath'){
   const contact=1040;
   if(!fx.dim){fx.dim=document.createElement('div');fx.dim.className='monster-curse-dim';fx.dim.style.background='#10180a';fx.stage.appendChild(fx.dim);}
   fx.dim.style.opacity=String(.27*smooth(age/280)*(1-smooth((age-1120)/560))*opacity);
   if(monster?.style){
    if(!fx.hideMonster){fx.originalOpacity=monster.style.opacity??'';fx.hideMonster=true;}
    const base=fx.originalOpacity===''?1:Number(fx.originalOpacity);
    monster.style.opacity=String((Number.isFinite(base)?base:1)*(1-smooth(age/360))+(Number.isFinite(base)?base:1)*smooth((age-1360)/320));
   }
   const from={x:e.x,y:e.y-e.height*.015},target={x:p.x,y:p.y-p.height*.025};
   if(age<480)c4Shadow(ctx,'Dissolve',reduced()?3:Math.min(7,age/60),from,e.height*1.55,opacity*.95*smooth(age/90)*(1-smooth((age-380)/100)));
   if(age>=440&&age<contact){
    const t=Math.max(0,Math.min(1,(age-480)/560)),travel=reduced()?1:t*t*(2-t);
    const point={x:from.x+(target.x-from.x)*travel,y:from.y+(target.y-from.y)*travel-(reduced()?0:Math.sin(Math.PI*travel)*p.height*.06)};
    c4Shadow(ctx,'Invade',reduced()?4:t*7,point,p.height*1.35,opacity*.98*smooth((age-440)/100));
   }else if(age>=contact){
    const local=age-contact;
    // The status layer owns possession. A miss passes beside the player instead.
    if(missed){const t=smooth(local/500);c4Shadow(ctx,'Withdraw',reduced()?5:t*7,{x:target.x-p.width*.30*t,y:target.y+p.height*.16*t},p.height*1.18,opacity*.50*(1-smooth(local/560)));}
   }
  }
  if(fx.ability==='serpentHex'){
   const push=(small?2.5:4)*smooth(age/320)*(1-smooth((age-660)/380));
   if(monster?.style)monster.style.translate=reduced()?'':`${-push}px 0px`;
   for(let i=0;i<2;i++){
    const start=i*240,launch=320+i*240,contact=1040+i*240,local=age-start;
    const from={x:e.x-e.width*.06,y:e.y+e.height*(i?.16:-.16)},target={x:p.x,y:p.y+p.height*(i?.13:-.14)};
    if(local>=0&&age<launch+100){
     const phase=local/60;
     c4Python(ctx,'Form',reduced()?6:phase,from,e.height*.92,opacity*.84*smooth(local/110)*(1-smooth((age-launch)/100)),i===1);
    }
    if(age>=launch&&age<contact){
     const t=Math.max(0,Math.min(1,(age-launch)/(contact-launch))),travel=reduced()?1:t*t*(2-t);
     const point={x:from.x+(target.x-from.x)*travel,y:from.y+(target.y-from.y)*travel+(reduced()?0:Math.sin(Math.PI*travel)*p.height*(i?.16:-.16))};
     c4Python(ctx,'Travel',reduced()?3:t*7,point,p.width*1.75,opacity*.94*smooth((age-launch)/100),i===1);
    }else if(age>=contact&&fx.hits?.[i]?.landed===false){
     const t=smooth((age-contact)/560);
     c4Python(ctx,'Travel',7,{x:target.x-p.width*.38*t,y:target.y+p.height*(i?.18:-.18)*t},p.width*1.75,opacity*.40*(1-t),i===1);
    }
   }
  }
  if(fx.ability==='mireTail'){
   const contact=900,end=1760;fx.canvas.style.zIndex='11';
   if(!fx.dim){fx.dim=document.createElement('div');fx.dim.className='monster-curse-dim';fx.dim.style.background='#0c160b';fx.stage.appendChild(fx.dim);}
   fx.dim.style.opacity=String(.32*smooth(age/220)*(1-smooth((age-1240)/520))*opacity);
   if(monster?.style){
    if(!fx.hideMonster){fx.originalOpacity=monster.style.opacity??'';fx.hideMonster=true;}
    const hidden=smooth(age/240)*(1-smooth((age-1420)/340));
    const original=Number.parseFloat(fx.originalOpacity);
    monster.style.opacity=String((Number.isFinite(original)?original:1)*(1-hidden*opacity));
    monster.style.translate=reduced()?'':`0px ${e.height*.12*hidden*opacity}px`;
   }
   const ground=Math.min(g.height-10,p.y+p.height*.49),foot={x:p.x+p.width*.15,y:ground};
   if(age<650){
    const t=reduced()?1:Math.max(0,Math.min(1,(age-240)/360))**2;
    const point={x:e.x+(foot.x-e.x)*t,y:ground};
    c4paint(ctx,'mireAmbushWake',Math.min(7,Math.floor(age/81.25)),point,p.width*1.35,opacity*.85*smooth(age/70)*(1-smooth((age-560)/90)),[.26,.62],p.width*.85);
   }
   const target={x:p.x,y:p.y+p.height*.04};
   if(age>=600&&age<1330){
    const after=age-contact,pose=reduced()?6:age<contact?Math.min(5,Math.floor((age-600)/50)):age<980?6:7+Math.min(4,Math.floor((age-980)/70));
    const miss=missed?1:0,point={x:target.x-miss*p.width*.48*smooth(after/220),y:target.y};
    c4paint(ctx,'mireAmbushBite',pose,point,p.width*1.20,opacity*(miss?.50:.94)*smooth((age-600)/60)*(1-smooth((age-1240)/90)),[.30,.42],p.height*1.02);
   }
   if(age>=1130){
    const local=age-1130;
    c4paint(ctx,'mireAmbushReturn',Math.min(7,Math.floor(local/(630/8))),foot,p.width*1.20,opacity*.75*(1-smooth((age-1530)/230)),[.5,.72],p.width*.90);
   }
  }
  if(fx.ability==='mireTide'){
   const begin=800,finish=2000,end=2760;
   fx.canvas.style.zIndex='11';
   if(!fx.dim){fx.dim=document.createElement('div');fx.dim.className='monster-curse-dim';fx.dim.style.background='#07160c';fx.stage.appendChild(fx.dim);}
   fx.dim.style.opacity=String(.48*smooth(age/300)*(1-smooth((age-2180)/580))*opacity);
   if(monster?.style){
    if(!fx.hideMonster){fx.originalOpacity=monster.style.opacity??'';fx.hideMonster=true;}
    const visible=1-smooth(age/240)*(1-smooth((age-2600)/160));
    monster.style.opacity=String((Number.isFinite(Number.parseFloat(fx.originalOpacity))?Number.parseFloat(fx.originalOpacity):1)*(1-(1-visible)*opacity));
    monster.style.translate=reduced()?'':`0px ${e.height*.10*smooth(age/240)*(1-smooth((age-2600)/160))*opacity}px`;
   }
   // One complete authored creature per frame: no frozen chest/head splice.
   const baseMouth={x:e.x-e.width*.36,y:e.y-e.height*.025};
   const jawW=Math.min(e.width*1.65,(g.width-8-baseMouth.x)/.77,g.height*.68),jawH=jawW;
   const root={x:baseMouth.x+.30*jawW,y:baseMouth.y+.23*jawH};
   const jawPose=reduced()?22:age<300?Math.min(5,Math.floor(age/50)):age<560?6+Math.min(5,Math.floor((age-300)/(260/6))):age<begin?12+Math.min(8,Math.floor((age-560)/(240/9))):age<2180?(age>=2000?25:[21,22,23,24,25,24][Math.floor((age-begin)/60)%6]):age<2380?26+Math.min(3,Math.floor((age-2180)/50)):30+Math.min(5,Math.floor((age-2380)/(220/6)));
   const anchor=M.mireBreathActor.registration,uv=M.mireBreathActor.mouth[jawPose];
   const stablePaws={x:root.x,y:root.y+jawH*.13};
   const surface=Math.min(g.height-10,stablePaws.y+jawH*.06);
   const rise=reduced()?0:jawH*(.68*(1-smooth((age-80)/220))+.45*smooth((age-2380)/220));
   const paws={x:stablePaws.x,y:stablePaws.y+rise+2};
   const mouth={x:paws.x+(uv[0]-anchor[0])*jawW*1.25,y:paws.y+(uv[1]-anchor[1])*jawH*1.25};
   const fade=opacity*smooth((age-60)/160)*(1-smooth((age-2380)/220));
   const jawCtx=executionLayer(fx,'actor',9,g);
   // Build the complete creature offscreen, then composite it ABOVE the pool.
   fx.actorCanvas.style.visibility='hidden';
   c4paint(jawCtx,'mireBreathActor',jawPose,paws,jawW*1.25,fade*.96,anchor,jawH*1.25);
   // A soft stationary waterline removes the old visible horizontal cut.
   jawCtx.save();jawCtx.globalCompositeOperation='destination-in';
   const waterMask=jawCtx.createLinearGradient(0,surface-jawH*.13,0,surface+jawH*.02);
   const submerged=Math.min(1,1-smooth((age-180)/180)+smooth((age-2380)/220));
   waterMask.addColorStop(0,'rgba(0,0,0,1)');waterMask.addColorStop(1,`rgba(0,0,0,${1-submerged})`);
   jawCtx.fillStyle=waterMask;jawCtx.fillRect(0,0,g.width,g.height);jawCtx.restore();
   const waterW=Math.min(e.width*1.50,(g.width-stablePaws.x-5)*2),waterH=waterW*.50;
   if(age<2600){
    const returning=age>=2380,local=returning?age-2380:age;
    const pose=returning?Math.min(7,Math.floor(local/(220/8))):age<260?7-Math.min(7,Math.floor(age/(260/8))):age<1000?Math.min(7,Math.floor((age-260)/85)):7;
    const progress=Math.max(0,Math.min(1,local/220));
    const waterAlpha=opacity*(returning?(.42*(1-smooth(progress))+.30*Math.sin(Math.PI*progress)):(.42+.42*(1-smooth((age-650)/350)))*smooth(age/90));
    c4paint(ctx,'mireAmbushReturn',pose,{x:stablePaws.x,y:surface},waterW,waterAlpha,[.5,.72],waterH);
   }
   // Explicit back-to-front order on the visible attack canvas: pool, creature, breath.
   ctx.save();ctx.globalAlpha=1;ctx.drawImage(fx.actorCanvas,0,0,g.width,g.height);ctx.restore();
   const breathOrigin={x:mouth.x-1,y:mouth.y};
   const target={x:p.x+p.width*.10,y:p.y+p.height*.06},dx=breathOrigin.x-target.x,dy=breathOrigin.y-target.y;
   const angle=Math.atan2(dy,dx),jetH=p.height*1.10;
   if(age>=380&&age<680){
    // Inhale is a small, local cloud at the moving mouth, never a full-length jet.
    const pose=Math.min(5,Math.floor((age-380)/50)),radius=p.width*.28;
    const alpha=opacity*.58*smooth((age-380)/80)*(1-smooth((age-590)/90));
    ctx.save();ctx.beginPath();ctx.arc(mouth.x,mouth.y,radius,0,Math.PI*2);ctx.clip();
    c4paint(ctx,'mireBreathStorm',pose,mouth,p.width*.84,alpha,M.mireBreathStorm.outlet[pose],p.height*.40);ctx.restore();
   }
   // Emission begins ONLY with the completed left whip and fully opened maw.
   // Full breath reaches beyond the player's left edge, with its source pinned.
   if(age>=begin&&age<2180){
    const pose=age<920?6+Math.min(3,Math.floor((age-begin)/30)):age<finish?(reduced()?14:10+Math.floor((age-920)/80)%10):20+Math.min(3,Math.floor((age-finish)/45));
    const outlet=M.mireBreathStorm.outlet[pose],endX=Math.max(2,p.x-p.width*.65);
    const reach=(breathOrigin.x-endX)/Math.max(.75,Math.cos(angle)),jetW=reach/Math.max(.50,outlet[0]-.06);
    const power=opacity*.98*smooth((age-begin)/70)*(1-smooth((age-finish)/180));
    ctx.save();ctx.translate(breathOrigin.x,breathOrigin.y);ctx.rotate(angle);
    c4paint(ctx,'mireBreathStorm',pose,{x:0,y:0},jetW,power,outlet,jetH);ctx.restore();
   }

  }
  return true;
 }
 function chapter4Layers(){
  if(!state||state.phase!=='active')return;
  for(const kind of ['poison','miasma','serpentMark','mudSlow']){
   const until=kind==='poison'?state.poisonVisualUntil:kind==='miasma'?state.weakenUntil:kind==='serpentMark'&&state.fractureAbility==='serpentHex'?state.fractureUntil:kind==='mudSlow'&&state.slowAbility==='mireTail'?state.slowUntil:0;
   const key='status:'+kind;if(until>clock()&&!active.has(key))make(key,{kind,identity,fadeStart:clock()});
  }
 }
 function chapter4Status(ctx,fx,g){
  const kind=fx.kind,until=kind==='poison'?state.poisonVisualUntil:kind==='miasma'?state.weakenUntil:kind==='serpentMark'&&state.fractureAbility==='serpentHex'?state.fractureUntil:kind==='mudSlow'&&state.slowAbility==='mireTail'?state.slowUntil:0;
  if(state.phase!=='active'||!(until>clock()))return false;
  const p=g.player,age=clock()-fx.fadeStart,fade=smooth(age/180)*smooth((until-clock())/(kind==='poison'?400:450));
  if(kind==='poison'){
   const begin=(state.poisonUntil??until-400)-3000,cycle=((clock()-begin)%1000+1000)%1000,pose=reduced()?16:16+Math.floor(cycle/1000*6),pulse=fx.poisonPulseAt===undefined?0:1-smooth((clock()-fx.poisonPulseAt)/180);
   c4paint(ctx,'mireVenom',pose,{x:p.x,y:p.y+p.height*.03},p.width*.65,(.64+.20*pulse)*fade,[.5,.62]);
  }else if(kind==='miasma'){
   const layout=[g.width,g.height].join(':');
   if(fx.miasmaLayout!==layout){const cast=active.get(state.pending?.castId),fixed=cast?.c4geometry;fx.miasmaLayout=layout;fx.miasmaAnchor={...(fixed&&fixed.width===g.width&&fixed.height===g.height?fixed.player:p)};}
   const anchor=fx.miasmaAnchor,elapsed=3000-(until-clock()),left=until-clock();
   const point={x:anchor.x,y:anchor.y-anchor.height*.025};
   // One status canvas handles all three seconds, then the eight-frame withdrawal.
   if(left>640){
    const cycle=Math.max(0,elapsed-640)/130,loop=[7,6,5,4,5,6];
    const k=Math.floor(cycle),pose=reduced()?4:elapsed<640?Math.min(7,elapsed/80):loop[k%6]+(loop[(k+1)%6]-loop[k%6])*(cycle-k);
    const pulse=reduced()?1:.92+.08*Math.sin(elapsed*.008);
    c4Shadow(ctx,'Possess',pose,point,anchor.height*1.40,.56*pulse*smooth(elapsed/160));
   }else{
    const cross=smooth((640-left)/160);
    if(cross<1)c4Shadow(ctx,'Possess',reduced()?4:5,point,anchor.height*1.40,.52*(1-cross));
    c4Shadow(ctx,'Withdraw',reduced()?5:(640-left)/80,point,anchor.height*1.18,.48*cross*smooth(left/380));
   }
  }else if(kind==='serpentMark'){
   const layout=[g.width,g.height].join(':');
   if(fx.pythonLayout!==layout){const cast=active.get(state.pending?.castId),fixed=cast?.c4geometry;fx.pythonLayout=layout;fx.pythonAnchor={...(fixed&&fixed.width===g.width&&fixed.height===g.height?fixed.player:p)};}
   const anchor=fx.pythonAnchor,grip=state.serpentGrip;
   // Legacy weakness can expire without inventing a landed second serpent.
   const mask=grip?.mask??1,begin=grip?.start??until-3000-1040,left=until-clock();
   for(let i=0;i<2;i++){
    if(!(mask&(1<<i)))continue;
    const local=clock()-begin-(1040+i*240);if(local<0)continue;
    const point={x:anchor.x,y:anchor.y+anchor.height*(i?.13:-.14)};
    const size=anchor.width*1.92;
    if(left>640){
     const cycle=Math.max(0,local-560)/150,seq=[7,6,5,6],k=Math.floor(cycle);
     const pose=reduced()?6:local<560?local/80:seq[k%4]+(seq[(k+1)%4]-seq[k%4])*(cycle-k);
     c4Python(ctx,'Bind',pose,point,size,(i?.69:.74)*smooth(local/100)*(1-.40*smooth((local-700)/400)),i===1);
    }else{
     const cross=smooth((640-left)/160);
     if(cross<1)c4Python(ctx,'Bind',6,point,size,.42*(1-cross),i===1);
     c4Python(ctx,'Fade',reduced()?5:(640-left)/80,point,size,.44*cross*smooth(left/360),i===1);
    }
   }
  }else{
   c4paint(ctx,'mireTailSheet',20+Math.floor(clock()/180)%4,{x:p.x,y:p.y+p.height*.20},p.width*.65,.35*fade);
  }
  return true;
 }
 function chapter3Layers(){
  if(!state||state.phase!=='active')return;
  for(const kind of ['ironShell','rockFracture','brand']){
   if(kind==='brand'&&state.pending?.ability==='ironWhip'&&clock()<state.pending.endsAt)continue;
   const until=kind==='brand'?(bossBrandTier(state.tier)?(state.brandVisualUntil>0?state.brandVisualUntil:state.brandUntil>0?state.brandUntil+400:0):state.brandUntil):kind==='ironShell'?state.shellUntil:state.fractureAbility==='rockFist'?state.fractureUntil:0,key='status:'+kind;
   if(until>clock()&&!active.has(key))make(key,{kind,identity,fadeStart:clock()});
  }
 }
 function chapter3Status(ctx,fx,current){
  if(fx.kind==='brand'){
   const until=state.brandUntil;
   if(bossBrandTier(state.tier)){const visualUntil=state.brandVisualUntil>0?state.brandVisualUntil:until>0?until+400:0;if(state.phase!=='active'||!(visualUntil>clock()))return false;bossBrandMark(ctx,current,until,visualUntil);return true;}
   if(state.phase!=='active'||!(until>clock()))return false;
   const layout=[current.width,current.height,current.player.width,current.player.height].join(':');if(fx.layout!==layout){fx.layout=layout;fx.anchor={...current.player};}
   const p=fx.anchor,pose=reduced()?0:Math.floor(clock()/150)%6,remaining=Math.max(0,Math.min(1,(until-clock())/3000)),alpha=.38*smooth((clock()-fx.fadeStart)/180)*smooth((until-clock())/500);
   ctx.save();ctx.filter=`saturate(${.15+.85*remaining}) brightness(${.6+.4*remaining})`;
   c3paint(ctx,'brandLoop',pose,{x:p.x,y:p.y+p.height*.08},p.width*.82,alpha,images.get('brandLoop')?.brandRegistration?.[pose]??[.5,.5]);ctx.restore();return true;
  }

  const shell=fx.kind==='ironShell',until=shell?state.shellUntil:state.fractureAbility==='rockFist'?state.fractureUntil:0;
  if(state.phase!=='active'||!(until>clock()))return false;
  const layout=[current.width,current.height,current.player.width,current.player.height].join(':');
  if(fx.layout!==layout){fx.layout=layout;fx.anchor={...(shell?current.enemy:current.player)};}
  const p=fx.anchor,w=p.width*(shell?1.30:1.40),h=p.height*1.10,alpha=(shell?.96:.5)*smooth((clock()-fx.fadeStart)/180)*smooth((until-clock())/350),pose=reduced()?0:Math.floor(clock()/150)%6;
  if(shell){
   fx.canvas.style.zIndex='3';
   const m=M.ironShell,cover=Math.max((p.width-2)/m.portraitWidth,(p.height-2)/m.portraitHeight),iw=m.portraitWidth*cover,ih=m.portraitHeight*cover;
   const age=clock()-fx.fadeStart,loop=Math.max(0,(age-260)/190),first=age<130?0:age<260?1:2+Math.floor(loop)%4,next=2+(Math.floor(loop)+1)%4,mix=age<260||reduced()?0:loop%1;
   ctx.save();ctx.beginPath();ctx.rect(p.x-p.width/2+1,p.y-p.height/2+1,p.width-2,p.height-2);ctx.clip();ctx.globalCompositeOperation='screen';
   c3paint(ctx,'ironShell',reduced()?2:first,p,iw,alpha*(1-mix),[.5,.5],ih);
   if(mix)c3paint(ctx,'ironShell',next,p,iw,alpha*mix,[.5,.5],ih);
   ctx.restore();return true;
  }
  ctx.save();ctx.beginPath();ctx.rect(p.x-w/2,p.y-h/2,w,h);ctx.rect(p.x-p.width*.36,p.y-p.height*.40,p.width*.72,p.height*.80);ctx.clip('evenodd');
  c3paint(ctx,shell?'ironShell':'rockFracture',pose,p,w,alpha,[.5,.5],h);ctx.restore();return true;
 }

 function attack(ctx,fx,g){let age=Math.max(0,clock()-fx.start-(fx.pauseMs??0)),opacity=1;if(fx.cancelWall){opacity=Math.max(0,1-(performance.now()-fx.cancelWall)/180);age=fx.cancelAge;}
  if(age>=fx.endsAt-fx.start-(fx.pauseMs??0)&&!fx.cancelWall){if(fx.ability==='charge')fx.chargeFinished=true;return false;}if(opacity<=0)return false;if(fx.ability==='charge')g=chargePush(fx,g,age);
  const scale=fx.tier==='boss'?1.35:fx.tier==='guardian'?1.16:1;
  const size=Math.min(g.width*.91,g.player.height*1.8)*scale;
  const step=(key,ms,anchor=.32)=>{let frame=age/ms;if(reduced())frame=Math.min(M[key].frames-1,fx.ability==='claw'?2:1);let alpha=opacity;const hit=fx.hits?.[0];if(hit?.landed===false)alpha*=.38;paint(ctx,key,frame,g.player,size*(key==='stoneStrike'?.50:1),alpha,anchor);};
  if(chapter4Attack(ctx,fx,g,age,opacity))return true;
  if(chapter3Attack(ctx,fx,g,age,opacity))return true;
  if(fx.ability==='claw'){
   if(!fx.monsterEl||!fx.monsterEl.isConnected)fx.monsterEl=fx.stage.querySelector('.fighter.enemy .fighter-frame');
   const recoil=smooth(age/25)*(1-smooth((age-100)/100)),amp=(g.width<600?2:3)*recoil;
   if(fx.monsterEl?.style)fx.monsterEl.style.translate=reduced()?'':`${-amp*(.55+.45*Math.sin(age*.12)**2)}px 0px`;
   const t=smooth(age/180),travel=Math.min(26,g.player.width*.22),p={x:g.player.x+travel*(1-t),y:g.player.y};
   const fade=smooth(age/60)*(1-smooth((age-240)/120));
   paint(ctx,'bite',reduced()?2:age/90,p,size*.32,opacity*fade*(fx.hits?.[0]?.landed===false?.35:1),.32);
  }
  if(fx.ability==='curse'){
   if(!fx.monsterEl||!fx.monsterEl.isConnected){fx.monsterEl=fx.stage.querySelector('.fighter.enemy .fighter-frame');fx.originalOpacity=fx.monsterEl?.style.opacity??'';fx.hideMonster=true;}
   if(fx.monsterEl?.style)fx.monsterEl.style.opacity=String(reduced()?1:age<140?1-smooth(age/140):age<300?0:smooth((age-300)/280));
   curseDim(fx,age,opacity);
   if(age<480){const t=Math.min(1,age/360),p={x:g.enemy.x+(g.player.x-g.enemy.x)*t,y:g.player.y};paint(ctx,'ghostFlight',reduced()?5:age/60,p,Math.min(g.player.width*.95,g.width*.36)*2,opacity*smooth(age/65)*(1-smooth((age-390)/90)),.32);}
   if(age>=360&&fx.hits?.[0]?.landed===true){
    const elapsed=age-360,inward=smooth(elapsed/140),release=smooth((elapsed-140)/220);
    const extent=Math.min(g.player.width*1.05,g.width*.40)*2*(reduced()?.80:1-.30*inward+.14*release);
    const p={x:g.player.x,y:g.player.y+g.player.height*.04};
    paint(ctx,'ghostImpact',reduced()?2:elapsed/60,p,extent,opacity*.80*(1-smooth((elapsed-240)/120)),.5);
   }
  }
  if(fx.ability==='guard'){
   if(!fx.monsterEl||!fx.monsterEl.isConnected)fx.monsterEl=fx.stage.querySelector('.fighter.enemy .fighter-frame');
   const push=(g.width<600?3:5)*smooth(age/260)*(1-smooth((age-440)/220));
   if(fx.monsterEl?.style)fx.monsterEl.style.translate=reduced()?'':`${-push}px 0px`;
   const extent=size*.42,flight=reduced()?1:Math.max(0,Math.min(1,(age-260)/180))**2.4;
   const pose=reduced()?2:age<160?0:age<440?1:age<480?2:age<550?3:age<640?4:5;
   const cores=[[.12,.53],[.08,.50],[.22,.51],[.26,.52],[.35,.53],[.44,.55]],core=cores[pose];
   const target={x:g.enemy.x+(g.player.x-g.enemy.x)*flight,y:g.enemy.y+(g.player.y-3-g.enemy.y)*flight};
   const drawSize=extent*(age<260?.60+.40*smooth(age/260):1),p={x:target.x+(.32-core[0])*drawSize,y:target.y+(.5-core[1])*drawSize};
   paint(ctx,'stoneStrike',pose,p,drawSize,opacity*smooth(age/90)*(1-smooth((age-620)/100))*(fx.hits?.[0]?.landed===false?.3:1),.32);
   armor(ctx,'armorLoop',0,g.enemy,opacity,age);
  }
  if(fx.ability==='bleed'){
   if(!fx.monsterEl||!fx.monsterEl.isConnected)fx.monsterEl=fx.stage.querySelector('.fighter.enemy .fighter-frame');
   const effort=smooth(age/20)*(1-smooth((age-130)/90)),jolt=(g.width<600?3:5)*effort;
   if(fx.monsterEl?.style)fx.monsterEl.style.translate=reduced()?'':`${Math.sin(age*.14)*jolt}px ${Math.sin(age*.19)*jolt*.28}px`;
   // Hooked rake: local anticipation, quick pull, one held contact, then scars.
   const pose=reduced()?(age<130?1:8):age<30?0:age<65?1:age<95?2:age<130?3:age<180?4:age<220?5:age<280?6:age<340?7:age<420?8:age<500?9:age<600?10:11;
   const pull=smooth((age-65)/65),follow=smooth((age-180)/100),dx=Math.min(18,g.player.width*.14),dy=Math.min(14,g.player.height*.08);
   let p=age<130?{x:g.player.x+dx*(1-pull),y:g.player.y-dy*(1-pull)}:age<280?{x:g.player.x-6*follow,y:g.player.y+6*follow}:g.player;
   const cores=[[.65,.47],[.62,.48],[.62,.50],[.35,.68],[.45,.60],[.45,.61],[.48,.60],[.50,.62],[.50,.50],[.50,.50],[.50,.50],[.50,.50]],extent=Math.min(g.player.width*.80,g.width*.32)*2;
   const rake=(frame,target,alpha)=>{const m=M.rotClaw,col=frame%m.cols,row=Math.floor(frame/m.cols),cw=Math.round((col+1)*m.width/m.cols)-Math.round(col*m.width/m.cols),ch=Math.round((row+1)*m.height/m.rows)-Math.round(row*m.height/m.rows);c3paint(ctx,'rotClaw',frame,target,extent,alpha,cores[frame],extent*ch/cw);};
   let alpha=opacity*smooth(age/25)*(1-smooth((age-580)/120));
   if(fx.hits?.[0]?.landed===false&&age>=130){p={x:g.player.x-18*smooth((age-130)/160),y:g.player.y+12*smooth((age-130)/160)};rake(3,p,opacity*.35*(1-smooth((age-130)/180)));}
   else rake(pose,p,alpha);
  }
  if(fx.ability==='boneBeast'){
   if(!fx.monsterEl||!fx.monsterEl.isConnected)fx.monsterEl=fx.stage.querySelector('.fighter.enemy .fighter-frame');
   if(fx.monsterEl?.style){
    const lift=-3*smooth(age/80),slam=lift+12*smooth((age-80)/100),recoil=9*(1-smooth((age-190)/110));
    const y=reduced()?0:age<80?lift:age<190?slam:age<300?recoil:0;
    fx.monsterEl.style.translate=y?`0px ${y}px`:'';
   }
   const ground=g.player.y+g.player.height*.46,extent=Math.min(g.player.height*1.20,g.width*.68,(ground-8)/.96);
   const pose=reduced()?3:age<100?0:age<220?1:age<260?2:age<320?3:age<370?4:age<450?5:age<520?6:age<600?7:age<680?8:age<780?9:age<880?10:11;
   const p={x:g.player.x,y:ground-extent*.46+2},fade=1-smooth((age-850)/150);
   paint(ctx,'boneStomp',pose,p,extent,opacity*fade*(fx.hits?.[0]?.landed===false?.32:1),.5);
  }
  if(fx.ability==='boneBurial'){
   curseDim(fx,age,opacity);
   const end={x:g.player.x,y:g.player.y-4},w=Math.min(g.player.width*1.9,g.width*.86,(end.x-8)*2,(g.width-end.x-8)*2);
   // Register upper/lower inner fang tips at v=.44/.62. The clear opening
   // reaches 90% of the actual player portrait height, with room for both jaws.
   const gap=g.player.height*.90,h=Math.min(g.player.height*.78,(g.height-16-gap)/.82),spread=(gap-.18*h)/2,outer=h+2*spread;
   const openY=Math.max(8+outer/2,Math.min(g.height-8-outer/2,end.y));
   const form=smooth(age/180),missed=fx.hits?.[0]?.landed===false;
   // One bite: form -> open wider -> snap shut -> contact hold -> break apart.
   // Skip the four preliminary fang-strike frames from the original atlas.
   if(age<620){
    const opening=reduced()?1:smooth(age/180),closing=reduced()?0:smooth((age-480)/140);
    const shift=-spread*opening*(1-closing)+h*.13*closing,centerY=openY*(1-closing)+end.y*closing,pose=age<150?0:age<380?1:6;
    mawPaint(ctx,pose,'upper',{x:end.x,y:centerY+shift},w,h,opacity*form);
    mawPaint(ctx,pose,'lower',{x:end.x,y:centerY-shift},w,h,opacity*form);
   }else{
    const after=age-620;
    if(missed){
     const fade=1-smooth(after/440);
     mawPaint(ctx,6,'upper',{x:end.x,y:openY-spread},w,h,opacity*fade*.55);mawPaint(ctx,6,'lower',{x:end.x,y:openY+spread},w,h,opacity*fade*.55);
    }else{
     const pose=after<90?7:after<180?8:after<340?9:after<500?10:11,fade=1-smooth((after-500)/200);
     mawPaint(ctx,pose,'all',end,w,h,opacity*fade);
    }
   }
  }
  if(fx.ability==='boneSoldier'){
   const end={x:g.player.x,y:g.player.y-4},extent=Math.min(g.player.height*1.35,g.width*.70);
   const pose=reduced()?2:age<70?0:age<180?1:age<210?2:age<250?3:age<300?4:5;
   const cores=[{x:.5,y:.5},{x:.18,y:.88},{x:.350586,y:.717773},{x:.456055,y:.696289},{x:.403320,y:.694336},{x:.403320,y:.694336}];
   let target=end;
   if(age<180&&!reduced()){const t=smooth(age/180);target={x:end.x+g.player.width*.58*(1-t),y:end.y-g.player.height*.48*(1-t)};}
   const core=cores[pose],point={x:target.x-(core.x-.5)*extent,y:target.y-(core.y-.5)*extent};
   const miss=fx.hits?.[0]?.landed===false;
   if(miss&&age>=180){const away=smooth((age-180)/120),p={x:end.x-g.player.width*.20*away-(cores[1].x-.5)*extent,y:end.y+18*away-(cores[1].y-.5)*extent};paint(ctx,'soldierCleave',1,p,extent,opacity*.3*(1-away),.5);}
   else paint(ctx,'soldierCleave',pose,point,extent,opacity*(1-smooth((age-240)/120)),.5);
  }
  if(fx.ability==='boneCurse'){
   if(!fx.monsterEl||!fx.monsterEl.isConnected)fx.monsterEl=fx.stage.querySelector('.fighter.enemy .fighter-frame');
   const advance=(g.width<600?4:6)*smooth(age/100)*(1-smooth((age-180)/150));
   if(fx.monsterEl?.style)fx.monsterEl.style.translate=reduced()?'':`${-advance}px 0px`;
   curseDim(fx,age,opacity);
   const t=Math.min(1,age/180),end={x:g.player.x,y:g.player.y-4};
   const flight=age<180,p={x:flight?g.enemy.x+(end.x-g.enemy.x)*t:end.x,y:end.y};
   const pose=reduced()?3:Math.min(5,Math.floor(age/60)),extent=Math.min(g.player.height*1.2,g.width*.62);
   const visible=flight||fx.hits?.[0]?.landed!==false;
   if(visible)paint(ctx,'boneCurseCast',pose,p,extent,opacity*(age>=300?1-smooth((age-300)/60):1),flight?.30:.5);
  }
  if(fx.ability==='boneArrows'){
   if(!fx.monsterEl||!fx.monsterEl.isConnected)fx.monsterEl=fx.stage.querySelector('.fighter.enemy .fighter-frame');
   if(!fx.arrowSource)fx.arrowSource={...g.enemy};
   const step=g.width<600?2:3,kick=[0,150,300].reduce((sum,at)=>sum+step*smooth((age-at)/30),0)*(1-smooth((age-360)/200));
   if(fx.monsterEl?.style)fx.monsterEl.style.translate=reduced()?'':`${kick}px 0px`;
   const extent=Math.min(g.width*.55,g.player.height*1.2)*.70;
   // Register the leading arrowhead, then the contact flare in each pose.
   // Every arrow launches at the actual enemy portrait center, with separate
   // upper/middle/lower targets rather than three coincident explosions.
   const cores=[[.18,.55],[.10,.55],[.07,.55],[.44,.50],[.48,.50],[.54,.50],[.50,.50],[.50,.50],[.50,.50]];
   const lane=Math.min(20,g.player.height*.10);
   for(let index=0;index<3;index++){
    const elapsed=age-index*150;if(elapsed<0||elapsed>=480)continue;
    const flight=elapsed<180,t=Math.min(1,elapsed/180),end={x:g.player.x,y:g.player.y+[-lane,0,lane][index]};
    const launch={x:fx.arrowSource.x+(reduced()?0:index*step),y:fx.arrowSource.y},target={x:launch.x+(end.x-launch.x)*t,y:launch.y+(end.y-launch.y)*t};
    const pose=reduced()?3:flight?Math.min(2,Math.floor(elapsed/60)):Math.min(8,3+Math.floor((elapsed-180)/50)),core=cores[pose];
    const p={x:target.x+(.5-core[0])*extent,y:target.y+(.5-core[1])*extent};
    paint(ctx,'boneArrow',pose,p,extent,opacity*(fx.hits?.[index]?.landed===false?.3:1),.5);
   }
  }
  if(fx.ability==='hound'){
   const t=smooth(Math.min(1,age/140)),end={x:g.player.x,y:g.player.y-4};
   const p={x:g.enemy.x+(end.x-g.enemy.x)*t,y:end.y};
   const extent=Math.min(g.player.height*1.4,g.width*.72);
   paint(ctx,'houndPounce',reduced()?3:Math.min(5,Math.floor(age/70)),p,extent,opacity*(fx.hits?.[0]?.landed===false?.35:1),.30);
  }
  if(fx.ability==='knight'){
   const end={x:g.player.x,y:g.player.y-6},start=g.enemy.x-g.enemy.width*.35;
   const extent=Math.min(g.width*.62,g.player.height*1.32)*(fx.tier==='boss'?1.12:1)*.80;
   if(age<620){
    const progress=age<400?.15*(age/400):.15+.85*Math.pow(Math.min(1,(age-400)/220),2);
    const p={x:reduced()?end.x:start+(end.x-start)*progress,y:end.y};
    const pose=reduced()?6:age<400?Math.floor(age/100):Math.min(7,4+Math.floor((age-400)/55));
    paint(ctx,'wraithWave',pose,p,extent,opacity*smooth(age/120),.16);
   }else{
    const pose=reduced()?2:Math.min(5,Math.floor((age-620)/65));
    const extent2=extent*1.08,core=pose===0?{x:.40,y:.51}:{x:.5,y:.5};
    const p={x:end.x-(core.x-.5)*extent2,y:end.y-(core.y-.5)*extent2};
    const fade=1-smooth((age-850)/190),miss=fx.hits?.[0]?.landed===false?.25:1;
    paint(ctx,'wraithImpact',pose,p,extent2,opacity*fade*miss,.5);
   }
  }
  if(fx.ability==='charge'){
   curseDim(fx,age,opacity);
   // Stagger five independently timed squads. Their short aftermath overlaps
   // the next approach rather than restarting a full-screen explosion.
   const cores=[[.13,.52],[.12,.52],[.19,.48],[.47,.52],[.50,.50],[.50,.50]],lanes=[-8,5,-4,8,0];
   for(let wave=0;wave<5;wave++){
    const local=age-wave*240,after=local-220,tail=wave===4?300:260;if(local<0||after>=tail)continue;
    const missed=fx.hits?.[wave]?.landed===false;
    let pose=local<110?0:local<220?1:after<35?2:after<85?3:after<160?4:5;
    const extent=Math.min(g.width*.98,g.player.height*2.2),end={x:g.player.x,y:g.player.y-4};
    const t=reduced()?1:Math.min(1,local/220)**2.2;
    const startX=g.enemy.x+g.enemy.width*.12,travel=Math.min(42,g.player.width*.24);
    let x=startX+(end.x-startX)*t,y=end.y+lanes[wave]*(1-t);
    if(after>=0){x=end.x-(reduced()?0:travel*smooth((after-85)/(tail-85)));y=end.y;}
    if(missed&&after>=0){pose=1;x=end.x-travel*2*Math.min(1,after/180);}
    if(reduced())pose=after<0?1:3;
    const core=cores[pose],point={x:x+(.32-core[0])*extent,y:y+(.52-core[1])*extent};
    const fade=after<0?1:1-smooth((after-100)/(tail-100));
    paint(ctx,'cavalry',pose,point,extent,opacity*fade*(missed?.35:1),.32);
   }
  }
  return true;
 }
 function status(ctx,fx,g){if(['poison','miasma','serpentMark','mudSlow'].includes(fx.kind))return chapter4Status(ctx,fx,g);if(['ironShell','rockFracture','brand'].includes(fx.kind))return chapter3Status(ctx,fx,g);const until=fx.kind==='armor'?state.armorUntil:fx.kind==='haste'?state.hasteUntil:fx.kind==='fracture'?state.fractureUntil:fx.kind==='curse'?state.slowUntil:state.bleedUntil;if(state.phase!=='active'||!(until>clock()))return false;const key=fx.kind==='armor'?'armorLoop':fx.kind==='haste'?'houndHaste':fx.kind==='fracture'?'boneCurseLoop':fx.kind==='curse'?'ghostLoop':'bleedLoop';let p=fx.kind==='armor'||fx.kind==='haste'?g.enemy:g.player;
 if(fx.kind==='bleed'||fx.kind==='fracture'){
  const layout=[g.width,g.height,p.width,p.height].join(':');
  if(fx.layout!==layout){fx.layout=layout;fx.anchor={...p};}
  p=fx.anchor;
 }if(fx.kind==='fracture'){
  if(fx.fadeStart===undefined)fx.fadeStart=clock();
  const alpha=.45*smooth((clock()-fx.fadeStart)/350)*smooth((until-clock())/600),pose=reduced()?0:Math.floor(clock()/150)%6,w=p.width*1.04,h=p.height*.98;
  ctx.save();ctx.beginPath();ctx.rect(p.x-w/2,p.y-h/2,w,h);ctx.rect(p.x-w*.20,p.y-h*.40,w*.40,h*.70);ctx.clip('evenodd');
  paint(ctx,key,pose,p,w,alpha,.5,h);ctx.restore();return true;
 }if(fx.kind==='bleed'){
  if(fx.fadeStart===undefined)fx.fadeStart=clock();
  const origin=until-3000,cycle=((clock()-origin)%1000+1000)%1000,pose=reduced()?0:Math.min(5,Math.floor(cycle/1000*6));
  const alpha=(.78+.16*(1-smooth(cycle/160)))*smooth((clock()-fx.fadeStart)/180)*smooth((until-clock())/350),extent=p.width*1.20;
  paint(ctx,'bleedLoop',pose,{x:p.x,y:p.y+p.height*.05},extent,alpha,.5);return true;
 }if(fx.kind==='haste'){
 if(fx.fadeStart===undefined)fx.fadeStart=clock();
 if(!fx.monsterEl||!fx.monsterEl.isConnected)fx.monsterEl=fx.stage.querySelector('.fighter.enemy .fighter-frame');
 const envelope=smooth((clock()-fx.fadeStart)/80)*smooth((until-clock())/180),tremor=(g.width<600?1.2:2)*envelope;
 if(fx.monsterEl?.style)fx.monsterEl.style.translate=reduced()?'':`${Math.sin(clock()*.19)*tremor}px ${Math.sin(clock()*.23)*tremor*.35}px`;
 const alpha=.65*smooth((clock()-fx.fadeStart)/180)*smooth((until-clock())/350),pose=reduced()?0:Math.floor(clock()/120)%6;houndEyes(ctx,pose,p,alpha);return true;}const size=Math.min(p.height*(fx.kind==='bleed'?1.0:1.65),g.width*(fx.kind==='armor'?.5:.65));const frame=reduced()?0:Math.floor(clock()/150)%6;if(fx.kind==='curse'&&fx.fadeStart===undefined)fx.fadeStart=clock();
 const alpha=fx.kind==='curse'?smooth((clock()-fx.fadeStart)/350)*smooth((until-clock())/600):Math.min(1,(until-clock())/200);if(fx.kind==='armor')armor(ctx,key,0,p,alpha);else paint(ctx,key,frame,p,fx.kind==='curse'?p.width*1.64:size,alpha*(fx.kind==='curse'?.45:1),.5);return true;}
 function frame(){
  raf=0;const effects=[...active.values()];frameGeometry.clear();
  // Read all live anchors before any layer changes Canvas sizes or portrait
  // styles. Overlapping casts/statuses share this frame's geometry only.
  for(const fx of effects){
   if(!fx.stage.isConnected||!fx.canvas.isConnected||document.hidden||fx.identity!==identity){remove(fx);continue;}
   if(!frameGeometry.has(fx.stage))frameGeometry.set(fx.stage,geometry(fx.stage));
  }
  for(const fx of effects){
   if(active.get(fx.key)!==fx)continue;
   const g=frameGeometry.get(fx.stage);if(!g||g.width<80||g.height<80)continue;
   const dpr=Math.min(2,devicePixelRatio||1),w=Math.round(g.width*dpr),h=Math.round(g.height*dpr);
   if(fx.canvas.width!==w||fx.canvas.height!==h){fx.canvas.width=w;fx.canvas.height=h;}
   const ctx=fx.canvas.getContext('2d');if(!ctx)continue;
   ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,g.width,g.height);
   const keep=fx.kind?status(ctx,fx,g):attack(ctx,fx,g);if(!keep)remove(fx);
  }
  frameGeometry.clear();
 if(active.size&&(state?.running||[...active.values()].some(f=>f.cancelWall)))raf=requestAnimationFrame(frame);
 }
 function __monsterWake(){if(!raf&&active.size)raf=requestAnimationFrame(frame);}
 function statusLayers(){chapter4Layers();chapter3Layers();if(!state||state.phase!=='active')return;for(const kind of ['armor','curse','bleed','haste','fracture']){if(kind==='fracture'&&['rockFist','serpentHex'].includes(state.fractureAbility))continue;if(kind==='curse'&&state.slowAbility&&state.slowAbility!=='curse')continue;const until=kind==='armor'?state.armorUntil:kind==='haste'?state.hasteUntil:kind==='fracture'?state.fractureUntil:kind==='curse'?state.slowUntil:state.bleedUntil,key='status:'+kind;const pending=state.pending;if(pending&&((kind==='armor'&&pending.ability==='guard')||(kind==='curse'&&pending.ability==='curse')||(kind==='bleed'&&pending.ability==='bleed')||(kind==='fracture'&&pending.ability==='boneCurse'))&&clock()<pending.endsAt)continue;if(until>clock()&&!active.has(key))make(key,{kind,identity});}}
 addEventListener('dark-world-monster-poison-tick',e=>{if(e.detail.identity!==identity||e.detail.damage<=0)return;const fx=active.get('status:poison');if(fx)fx.poisonPulseAt=e.detail.at;__monsterWake();});
 addEventListener('dark-world-monster-target',()=>{clear();identity=null;state=null;});
 addEventListener('dark-world-monster-cast',e=>{if(document.hidden)return;const p=e.detail;if(!renderedAbilities.has(p.ability))return;identity=p.identity;make(p.castId,{...p,hits:[],identity});__monsterWake();});
 addEventListener('dark-world-monster-hit',e=>{const h=e.detail;if(h.identity!==identity)return;const fx=active.get(h.castId);if(fx){fx.hits[h.index]={landed:h.landed,damage:h.damage};if(h.ability==='charge'&&Number.isFinite(h.at)){fx.chargeHitAt??=[];fx.chargeHitAt[h.index]=h.at;}}impact(h);__monsterWake();});
 addEventListener('dark-world-monster-state',e=>{const next=e.detail;if(identity&&identity!==next.identity)clear();identity=next.identity;state=next;if(document.hidden)return;
  if(next.phase!=='active'){for(const fx of [...active.values()])if(fx.kind)remove(fx);else if(!fx.cancelWall){fx.cancelWall=performance.now();fx.cancelAge=Math.max(0,next.clock-fx.start-(fx.pauseMs??0));}}
  else if(next.pending&&renderedAbilities.has(next.pending.ability)){const old=active.get(next.pending.castId);if(old)Object.assign(old,next.pending);else make(next.pending.castId,{...next.pending,tier:next.tier,identity});}
  statusLayers();if(!next.running)stopFlash();__monsterWake();
 });
 listenDocument('visibilitychange',()=>{if(document.hidden)clear();});addEventListener('pagehide',clear);
 return {dispose(){for(const release of listeners)release();clear();}};
}
