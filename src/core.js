import {stylesA} from './styles-a.js';
import {stylesB} from './styles-b.js';
import {renderPrimitive3D} from './primitives3d.js';

export const styles=[...stylesA,...stylesB].sort((a,b)=>a.number-b.number);
const styleMap=new Map(styles.map(s=>[s.id,s]));
let layerCanvas,layerContext;
let serial=0;
const uid=p=>`${p}-${Date.now().toString(36)}-${(++serial).toString(36)}`;
export const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const finite=(n,f=0)=>Number.isFinite(Number(n))?Number(n):f;
const color=(x,f='#142c35')=>/^#[0-9a-f]{3,8}$/i.test(x||'')?x:f;

export function createLayer(type,sceneDuration=10,params={}){
 const style=styleMap.get(type);
 const base=type==='text'?{text:'让想法动起来',color:'#ffffff',fontSize:80,fontFamily:'sans-serif',align:'center',fontWeight:600}:type==='shape'?{shape:'circle',color:'#f49d69',stroke:'#ffffff',strokeWidth:0,width:240,height:160,radius:70}:type==='path'?{color:'#efb76a',lineWidth:8,closed:false,reveal:true,brush:'solid'}:type==='image'?{assetId:'',fit:'contain',width:480,height:360}:type==='object3d'?{geometry:'box',color:'#e7a076',metalness:.3,roughness:.35,rotateX:10,rotateY:25,rotateZ:0,width:1,height:1,depth:1,camera:.25,turnSpeed:18}:{};
 return {id:uid('layer'),name:style?.name||({text:'文字',shape:'形状',image:'图片',path:'手绘路径',object3d:'三维物体'}[type]||type),type,x:.5,y:.5,scale:1,rotation:0,opacity:1,start:0,end:sceneDuration,hidden:false,locked:false,params:{...(style?.defaults||base),...params},motion:{kind:'none',amount:.12,speed:1},path:[],keyframes:[],bounds:type==='text'?[.15,.36,.7,.28]:type==='shape'?[.38,.36,.24,.28]:type==='image'?[.3,.23,.4,.54]:type==='object3d'?[.25,.08,.5,.84]:[0,0,1,1]};
}
export function createScene(styleId,duration=10){
 const s=styleMap.get(styleId),scene={id:uid('scene'),name:s?.name||'自由创作',duration,background:s?.background||'#102a34',layers:[]};
 if(s){
  for(const part of s.parts?.length?s.parts:[{id:'all',name:s.name}]){
   const l=createLayer(s.id,duration,{part:part.id,...(part.params||{})});l.name=part.name;l.bounds=part.bounds||[0,0,1,1];scene.layers.push(l);
  }
 }
 return scene;
}
export function createProject(styleId){return {version:2,name:styleMap.get(styleId)?.name||'我的动画',width:1280,height:720,fps:30,scenes:[createScene(styleId)],audio:null,sound:{enabled:true,volume:.18},subtitles:[],assets:[]};}
export function getDuration(project){return project.scenes.reduce((sum,s)=>sum+s.duration,0);}
export function getSceneAt(project,time){let start=0;for(let index=0;index<project.scenes.length;index++){const scene=project.scenes[index];if(time<start+scene.duration||index===project.scenes.length-1)return {scene,index,start,localTime:clamp(time-start,0,scene.duration)};start+=scene.duration;}return {scene:null,index:-1,start:0,localTime:0};}
const smooth=t=>t*t*(3-2*t);
export function getLayerPose(layer,t){
 const pose={x:layer.x,y:layer.y,scale:layer.scale,rotation:layer.rotation,opacity:layer.opacity};
 const keys=(layer.keyframes||[]).filter(k=>Number.isFinite(k.time)).slice().sort((a,b)=>a.time-b.time);
 if(keys.length){
  let a=keys[0],b=keys[0];
  if(t>=keys.at(-1).time)a=b=keys.at(-1);else if(t>keys[0].time){for(let i=1;i<keys.length;i++)if(keys[i].time>=t){a=keys[i-1];b=keys[i];break;}}
  const q=a===b?0:smooth(clamp((t-a.time)/(b.time-a.time),0,1));
  for(const k of Object.keys(pose)){const av=finite(a[k],pose[k]),bv=finite(b[k],av);pose[k]=av+(bv-av)*q;}
 }
 const m=layer.motion||{},u=Math.max(0,t-layer.start),speed=finite(m.speed,1),amp=finite(m.amount,.12);
 if(m.kind==='float'){pose.y-=Math.sin(u*speed*2)*amp*.22;pose.x+=Math.sin(u*speed*.9)*amp*.07;}
 if(m.kind==='spin')pose.rotation+=u*speed*30;
 if(m.kind==='pulse')pose.scale*=1+Math.sin(u*speed*3)*amp;
 if(m.kind==='bounce')pose.y-=Math.abs(Math.sin(u*speed*2.5))*amp;
 if(m.kind==='reveal')pose.opacity*=smooth(clamp(u/Math.max(.1,1/speed),0,1));
 if(m.kind==='path'&&layer.type!=='path'&&layer.path?.length){
  const path=layer.path;const total=Math.max(.1,layer.end-layer.start),minT=finite(path[0].t,0),maxT=Math.max(minT+.01,...path.map(p=>finite(p.t,0)));const pt=minT+clamp(u*speed/total,0,1)*(maxT-minT);
  let a=path[0],b=path.at(-1);for(let i=1;i<path.length;i++)if(finite(path[i].t,i/(path.length-1)*maxT)>=pt){a=path[i-1];b=path[i];break;}
  const q=clamp((pt-finite(a.t,0))/Math.max(.001,finite(b.t,maxT)-finite(a.t,0)),0,1);pose.x=a.x+(b.x-a.x)*q;pose.y=a.y+(b.y-a.y)*q;
 }
 return pose;
}

function textLines(ctx,text,maxWidth){const out=[];for(const para of String(text).split('\n')){let line='';for(const char of para){if(line&&ctx.measureText(line+char).width>maxWidth){out.push(line);line=char;}else line+=char;}out.push(line);}return out;}
function drawBase(ctx,layer,env,p){
 const {w,h,images,progress}=env;
 if(layer.type==='object3d'){renderPrimitive3D(ctx,env,p);}
 else if(layer.type==='text'){
  const fs=clamp(finite(p.fontSize,80),10,340);ctx.font=`${finite(p.fontWeight,600)} ${fs}px ${p.fontFamily||'sans-serif'}`;ctx.fillStyle=p.color||'#fff';ctx.textAlign=p.align||'center';ctx.textBaseline='middle';
  const lines=textLines(ctx,p.text||'',w*.86);const x=p.align==='left'?w*.1:p.align==='right'?w*.9:w*.5;
  if(p.shadow){ctx.shadowColor='#0009';ctx.shadowBlur=10;ctx.shadowOffsetY=4;}
  lines.slice(0,12).forEach((line,i)=>ctx.fillText(line,x,h*.5+(i-(lines.length-1)/2)*fs*1.3));
 }else if(layer.type==='shape'){
  const sw=clamp(finite(p.width,240),1,2400),sh=clamp(finite(p.height,160),1,1350),r=clamp(finite(p.radius,70),1,600);ctx.fillStyle=p.color||'#f49d69';ctx.strokeStyle=p.stroke||'#fff';ctx.lineWidth=finite(p.strokeWidth,0);ctx.beginPath();
  if(p.shape==='circle')ctx.ellipse(w/2,h/2,r,r,0,0,Math.PI*2);
  else if(p.shape==='triangle'){ctx.moveTo(w/2,h/2-sh/2);ctx.lineTo(w/2+sw/2,h/2+sh/2);ctx.lineTo(w/2-sw/2,h/2+sh/2);ctx.closePath();}
  else if(p.shape==='star'){for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,rr=i%2?r*.43:r;const x=w/2+Math.cos(a)*rr,y=h/2+Math.sin(a)*rr;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();}
  else ctx.roundRect(w/2-sw/2,h/2-sh/2,sw,sh,Math.min(24,sh/5));ctx.fill();if(ctx.lineWidth>0)ctx.stroke();
 }else if(layer.type==='image'){
  const im=images?.get(p.assetId||p.imageId);if(im){let sw=finite(p.width,480),sh=finite(p.height,360);const iw=im.width||im.naturalWidth,ih=im.height||im.naturalHeight;const ratio=p.fit==='cover'?Math.max(sw/iw,sh/ih):Math.min(sw/iw,sh/ih);ctx.save();ctx.beginPath();ctx.rect(w/2-sw/2,h/2-sh/2,sw,sh);ctx.clip();ctx.drawImage(im,w/2-iw*ratio/2,h/2-ih*ratio/2,iw*ratio,ih*ratio);ctx.restore();}
 }else if(layer.type==='path'){
  const pts=layer.path||[];if(!pts.length)return;const n=p.reveal===false?pts.length:Math.max(1,Math.ceil(progress*pts.length));ctx.lineJoin=ctx.lineCap='round';ctx.strokeStyle=p.color||'#ffcb72';const lineWidth=clamp(finite(p.lineWidth,8),1,100);ctx.lineWidth=lineWidth;
  if(p.brush==='glow'){ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=lineWidth*3;}
  const repeats=p.brush==='ink'?6:1;for(let j=0;j<repeats;j++){ctx.globalAlpha=p.brush==='ink'?(j? .19:.58):1;ctx.lineWidth=lineWidth*(p.brush==='ink'?1-j*.12:1);ctx.beginPath();pts.slice(0,n).forEach((pt,i)=>{const dx=p.brush==='ink'?Math.sin(i*13.7+j*5)*lineWidth*.16:0,dy=p.brush==='ink'?Math.cos(i*7.2+j*3)*lineWidth*.12:0;i?ctx.lineTo(pt.x*w+dx,pt.y*h+dy):ctx.moveTo(pt.x*w+dx,pt.y*h+dy);});if(p.closed)ctx.closePath();ctx.stroke();}
 }
}

export function renderProject(ctx,project,time,options={}){
 const {scene,localTime}=getSceneAt(project,time);if(!scene)return;const cw=ctx.canvas.width,ch=ctx.canvas.height,w=1200,h=675,stageH=ch/cw*w;
 ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,cw,ch);ctx.fillStyle=scene.background;ctx.fillRect(0,0,cw,ch);
 // Each effect keeps its own proportions; objects may occupy the entire chosen canvas.
 const fit=cw/w;ctx.scale(fit,fit);
 ctx.save();ctx.beginPath();ctx.rect(0,0,w,stageH);ctx.clip();
 for(const layer of scene.layers){
  if(layer.hidden||localTime<layer.start||localTime>layer.end)continue;
  const pose=getLayerPose(layer,localTime),style=styleMap.get(layer.type),duration=Math.max(.01,layer.end-layer.start),t=localTime-layer.start;
  const sourceH=layer.type==='path'?stageH:h;
  ctx.save();ctx.translate(pose.x*w,pose.y*stageH);ctx.rotate(pose.rotation*Math.PI/180);ctx.scale(pose.scale,pose.scale);ctx.translate(-w/2,-sourceH/2);ctx.globalAlpha=clamp(pose.opacity,0,1);
  const env={w,h:sourceH,t,progress:clamp(t/duration,0,1),duration,seed:finite(layer.params.seed,73),images:options.images,layerId:layer.id,pixelRatio:fit};
  if(!layerCanvas){layerCanvas=document.createElement('canvas');layerContext=layerCanvas.getContext('2d');}if(layerCanvas.width!==cw)layerCanvas.width=cw;if(layerCanvas.height!==Math.ceil(sourceH*fit))layerCanvas.height=Math.ceil(sourceH*fit);
  layerContext.save();layerContext.setTransform(fit,0,0,fit,0,0);layerContext.clearRect(0,0,w,sourceH);
  try{if(style)style.render(layerContext,env,{...style.defaults,...layer.params});else drawBase(layerContext,layer,env,layer.params||{});}finally{layerContext.restore();}
  ctx.drawImage(layerCanvas,0,0,w,sourceH);ctx.restore();
 }
 ctx.restore();
 if(options.selectionId){
  const layer=scene.layers.find(l=>l.id===options.selectionId);if(layer){const pose=getLayerPose(layer,localTime),b=layer.bounds||[0,0,1,1],sourceH=layer.type==='path'?stageH:h;ctx.save();ctx.translate(pose.x*w,pose.y*stageH);ctx.rotate(pose.rotation*Math.PI/180);ctx.scale(pose.scale,pose.scale);ctx.translate(-w/2,-sourceH/2);ctx.strokeStyle='#e48c54';ctx.lineWidth=1.5/fit;ctx.setLineDash([7/fit,4/fit]);ctx.strokeRect(b[0]*w,b[1]*sourceH,b[2]*w,b[3]*sourceH);ctx.restore();
   if(options.showPath&&layer.path?.length){ctx.save();ctx.strokeStyle='#eeb684';ctx.lineWidth=2/fit;ctx.setLineDash([5/fit,5/fit]);ctx.beginPath();layer.path.forEach((p,i)=>i?ctx.lineTo(p.x*w,p.y*stageH):ctx.moveTo(p.x*w,p.y*stageH));ctx.stroke();ctx.setLineDash([]);for(const p of [layer.path[0],layer.path.at(-1)]){ctx.beginPath();ctx.arc(p.x*w,p.y*stageH,5/fit,0,Math.PI*2);ctx.fillStyle='#eeb684';ctx.fill();}ctx.restore();}
  }
 }
 const caption=(project.subtitles||[]).find(s=>time>=s.start&&time<s.end);if(caption){ctx.save();ctx.font='500 30px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';const lines=textLines(ctx,caption.text,w*.85);const bh=lines.length*42+20;ctx.fillStyle='#061014c7';ctx.beginPath();ctx.roundRect(w*.05,stageH-bh-24,w*.9,bh,10);ctx.fill();ctx.fillStyle='#fff';lines.forEach((l,i)=>ctx.fillText(l,w/2,stageH-bh-24+30+i*42));ctx.restore();}
 ctx.restore();
}

export async function loadAssets(project){
 const map=new Map();await Promise.all((project.assets||[]).map(a=>new Promise((resolve,reject)=>{if(!/^data:image\//.test(a.dataUrl||'')){resolve();return;}const im=new Image();im.onload=()=>{map.set(a.id,im);resolve();};im.onerror=()=>reject(new Error(`图片“${a.name||a.id}”无法读取`));im.src=a.dataUrl;})));return map;
}
export function validateProject(raw){
 if(!raw||!Array.isArray(raw.scenes)||!raw.scenes.length)throw new Error('项目需要至少一个镜头');
 if(raw.scenes.length>100)throw new Error('单个项目最多支持 100 个镜头');
 const p=JSON.parse(JSON.stringify(raw));p.version=2;p.name=String(p.name||'我的动画').slice(0,120);p.width=clamp(Math.round(finite(p.width,1280)/2)*2,320,3840);p.height=clamp(Math.round(finite(p.height,720)/2)*2,180,2160);p.fps=clamp(Math.round(finite(p.fps,30)),12,60);
 const ids=new Set();for(const s of p.scenes){s.id=String(s.id||uid('scene'));s.name=String(s.name||'镜头').slice(0,120);s.duration=clamp(finite(s.duration,10),.2,300);s.background=color(s.background);if(!Array.isArray(s.layers)||s.layers.length>150)throw new Error('镜头图层数量不正确');for(const l of s.layers){if(!styleMap.has(l.type)&&!['text','shape','image','path','object3d'].includes(l.type))throw new Error(`未知图层类型：${l.type}`);if(!l.id||ids.has(l.id))l.id=uid('layer');ids.add(l.id);l.name=String(l.name||l.type).slice(0,120);l.x=clamp(finite(l.x,.5),-5,5);l.y=clamp(finite(l.y,.5),-5,5);l.scale=clamp(finite(l.scale,1),.01,10);l.rotation=finite(l.rotation,0);l.opacity=clamp(finite(l.opacity,1),0,1);l.start=clamp(finite(l.start,0),0,s.duration);l.end=clamp(finite(l.end,s.duration),l.start+.01,s.duration);l.params=l.params&&typeof l.params==='object'?l.params:{};l.motion={kind:'none',amount:.12,speed:1,...l.motion};l.path=Array.isArray(l.path)?l.path.slice(0,3000).map((pt,i)=>({x:clamp(finite(pt.x,.5),-3,4),y:clamp(finite(pt.y,.5),-3,4),t:finite(pt.t,i)})):[];l.keyframes=Array.isArray(l.keyframes)?l.keyframes.slice(0,200):[];l.bounds=Array.isArray(l.bounds)&&l.bounds.length===4?l.bounds:[0,0,1,1];}}
 p.assets=Array.isArray(p.assets)?p.assets.slice(0,200):[];p.subtitles=Array.isArray(p.subtitles)?p.subtitles.filter(s=>finite(s.end,0)>finite(s.start,0)).map(s=>({start:Math.max(0,finite(s.start,0)),end:finite(s.end,1),text:String(s.text||'').slice(0,2000)})):[];p.sound={enabled:false,volume:.18,...p.sound};if(p.audio&&!/^data:audio\//.test(p.audio.dataUrl||''))p.audio=null;return p;
}
