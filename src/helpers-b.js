import * as THREE from 'three';

export const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(+v)?+v:a));
export const mix=(a,b,t)=>a+(b-a)*t;
export const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
export const hash=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453123;return v-Math.floor(v);};
export const part=(p,id)=>!p.part||p.part==='all'||p.part===id;
export const phase=(e,p)=>clamp(e.t*(Number(p.speed)||1)/Math.max(.1,e.duration||10));
export const path=(c,points,close=false)=>{c.beginPath();points.forEach((v,i)=>i?c.lineTo(v[0],v[1]):c.moveTo(v[0],v[1]));if(close)c.closePath();};
export function round(c,x,y,w,h,r=12){c.beginPath();c.roundRect(x,y,w,h,r);}
export function font(c,size,weight=500,family='Arial, "PingFang SC", sans-serif'){c.font=`${weight} ${size}px ${family}`;}
export function fitText(c,text,x,y,max,size=70,weight=700,family){text=String(text||'');font(c,size,weight,family);const measured=c.measureText(text).width;if(measured>max)font(c,size*max/measured,weight,family);c.fillText(text,x,y);}
export function grain(c,seed=1,color='#000',alpha=.035,count=1500){c.save();c.fillStyle=color;c.globalAlpha=alpha;for(let i=0;i<count;i++){const a=hash(i+seed*37),b=hash(i*7+seed*11);c.fillRect(a*1200,b*675,1+hash(i*3+seed)*2,1);}c.restore();}
export function glow(c,x,y,r,color){const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);}
export function star(c,x,y,r,color='#fff'){c.save();c.fillStyle=color;c.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4,rr=i%2?r*.22:r;c.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr);}c.closePath();c.fill();c.restore();}
export const range=(key,label,min,max,step=.05)=>({key,label,type:'range',min,max,step});
export const color=(key,label)=>({key,label,type:'color'});
export const text=(key,label)=>({key,label,type:'text'});
export const select=(key,label,values)=>({key,label,type:'select',options:values.map(v=>typeof v==='string'?{value:v,label:v}:v)});

let renderer;
export function renderThree(ctx,world,p,env,update){
 if(!renderer){renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});renderer.setSize(960,540,false);renderer.setPixelRatio(1);renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;}
 const rw=Math.max(240,Math.min(3840,ctx.canvas.width)),rh=Math.round(rw*9/16);if(renderer.domElement.width!==rw||renderer.domElement.height!==rh)renderer.setSize(rw,rh,false);
 update(world,p,env);
 Object.entries(world.parts).forEach(([name,g])=>{g.visible=part(p,name);});
 renderer.render(world.scene,world.camera);ctx.drawImage(renderer.domElement,0,0,1200,675);
}
export function scene3(position=[5,4,7],target=[0,0,0]){const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(38,16/9,.1,100);camera.position.set(...position);camera.lookAt(...target);const ambient=new THREE.HemisphereLight(0xcbdcff,0x33303a,2);scene.add(ambient);const key=new THREE.DirectionalLight(0xffe8cc,4);key.position.set(-4,7,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-8;key.shadow.camera.right=8;key.shadow.camera.top=8;key.shadow.camera.bottom=-8;scene.add(key);const rim=new THREE.DirectionalLight(0x8598ed,2);rim.position.set(4,3,-5);scene.add(rim);return{scene,camera,ambient,key,rim,parts:{}};}
export function group(world,id){const g=new THREE.Group();world.scene.add(g);world.parts[id]=g;return g;}
export function material(color='#fff',roughness=.65,metalness=0){return new THREE.MeshStandardMaterial({color,roughness,metalness});}
export function mesh(parent,geo,mat,pos=[0,0,0],scale){const m=new THREE.Mesh(geo,mat);m.position.set(...pos);if(scale)m.scale.set(...scale);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
export function ball(parent,mat,pos,scale){return mesh(parent,new THREE.SphereGeometry(1,24,16),mat,pos,scale);}
export function box(parent,mat,pos,size){return mesh(parent,new THREE.BoxGeometry(...size),mat,pos);}
export function cylinder(parent,mat,a,b,r1=.1,r2=r1){const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),d=vb.clone().sub(va);const m=mesh(parent,new THREE.CylinderGeometry(r2,r1,d.length(),20),mat,va.clone().add(vb).multiplyScalar(.5).toArray());m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return m;}
export function canvasTexture(width=512,height=512){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return{canvas,ctx:canvas.getContext('2d'),texture};}
export { THREE };
