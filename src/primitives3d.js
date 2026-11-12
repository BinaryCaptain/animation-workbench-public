import * as THREE from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
let renderer,world;
const n=(v,f)=>Number.isFinite(+v)?+v:f;
export function renderPrimitive3D(ctx,env,p){
 if(!renderer){
  renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(37,16/9,.1,50),material=new THREE.MeshStandardMaterial({color:0xe7a076,roughness:.35,metalness:.3});
  const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(new RoomEnvironment(),.04).texture;pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xd6e7ff,0x605046,2));const key=new THREE.DirectionalLight(0xffeddf,3.4);key.position.set(-3,5,4);key.castShadow=true;scene.add(key);const rim=new THREE.DirectionalLight(0xabbcff,2);rim.position.set(4,1,-4);scene.add(rim);
  const geometries={box:new THREE.BoxGeometry(1.5,1.5,1.5),sphere:new THREE.SphereGeometry(1,48,32),cylinder:new THREE.CylinderGeometry(.85,.85,1.7,48),cone:new THREE.ConeGeometry(.95,1.8,48),torus:new THREE.TorusGeometry(.9,.28,24,72)};
  const object=new THREE.Mesh(geometries.box,material);object.castShadow=true;object.receiveShadow=true;scene.add(object);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.ShadowMaterial({opacity:.18}));floor.rotation.x=-Math.PI/2;floor.position.y=-1.15;floor.receiveShadow=true;scene.add(floor);
  world={scene,camera,object,material,geometries,floor};
 }
 const width=Math.max(240,Math.min(3840,ctx.canvas.width)),height=Math.round(width*9/16);if(renderer.domElement.width!==width||renderer.domElement.height!==height)renderer.setSize(width,height,false);
 const {scene,camera,object,material,geometries,floor}=world;object.geometry=geometries[p.geometry]||geometries.box;object.scale.set(n(p.width,1),n(p.height,1),n(p.depth,1));object.rotation.set(n(p.rotateX,10)*Math.PI/180,(n(p.rotateY,25)+env.t*n(p.turnSpeed,18))*Math.PI/180,n(p.rotateZ,0)*Math.PI/180);material.color.set(p.color||'#e7a076');material.roughness=n(p.roughness,.35);material.metalness=n(p.metalness,.3);floor.position.y=-Math.max(1.1,n(p.height,1)*1.1);const orbit=n(p.camera,.25);camera.position.set(Math.sin(orbit*1.4)*5.8,2.2,Math.cos(orbit*1.4)*5.8);camera.lookAt(0,0,0);renderer.render(scene,camera);ctx.drawImage(renderer.domElement,0,0,env.w,env.h);
}
