import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {EventEmitter} from 'node:events';
import {createWorkbenchServer} from '../server.mjs';
import {ownerSession,loginCookie,publicOrigin} from '../server/cloud-access.mjs';

const origin='https://demo.example';
const env={PUBLIC_ORIGIN:origin,WORKBENCH_OWNER_PASSWORD:'test-password-not-for-deployment-123',ARK_API_KEY:'test-api-key-not-real',ARK_MODEL:'test-model',ARK_BASE_URL:'https://model.example/api/v3',ARK_VISION_ENABLED:'true'};
let calls=0;
const upstream=async()=>{calls++;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({summary:'改为蓝色',changes:[{path:'params.color',after:'#4488ee'}]})},finish_reason:'stop'}]}),{headers:{'content-type':'application/json'}});};
const server=createWorkbenchServer({env,fetchImpl:upstream});
export function dispatch(server,{url='/',method='GET',headers={},body=''}={}){
 return new Promise((resolve,reject)=>{
  const req=Readable.from(body?[Buffer.from(body)]:[]);req.url=url;req.method=method;req.headers={host:'demo.example',...headers};req.socket={remoteAddress:'unit-test'};
  const res=new EventEmitter();res.headers={};res.statusCode=200;res.destroyed=false;res.writableEnded=false;
  res.writeHead=(status,values)=>{res.statusCode=status;res.headers=values;return res;};
  res.end=value=>{res.writableEnded=true;clearTimeout(timer);resolve({status:res.statusCode,headers:res.headers,body:value==null?'':Buffer.isBuffer(value)?value.toString():String(value)});};
  const timer=setTimeout(()=>reject(Error('Handler timed out')),3000);server.emit('request',req,res);
 });
}
const form=password=>new URLSearchParams({password}).toString();
let cookie;
const ctx={version:1,revision:0,project:{name:'test',width:1280,height:720,fps:30},scene:{id:'s1',name:'scene',duration:10,start:0},sceneId:'s1',layerId:'l1',layer:{id:'l1',type:'shape',name:'circle',x:.5,y:.5,scale:1,rotation:0,opacity:1,start:0,end:10,params:{color:'#ffffff'},motion:{kind:'none',speed:1,amount:0},path:[],keyframes:[]},pose:{x:.5,y:.5,scale:1,rotation:0,opacity:1},time:3,globalTime:3,localTime:3,sampleTime:3,sampleLocalTime:3,range:null,controls:[],parameterRules:{color:{type:'color'}},locks:{layerLocked:false},relatedLayers:[],assets:[],recentManual:[]};

test('public editor accepts navigation from external sites',async()=>{const r=await dispatch(server,{headers:{'sec-fetch-site':'cross-site','sec-fetch-mode':'navigate'}});assert.equal(r.status,200);assert.match(r.body,/id="app"/);});
test('health probe needs no model credentials',async()=>{const r=await dispatch(server,{url:'/healthz',headers:{host:'internal-probe'}});assert.equal(r.status,200);assert.equal(JSON.parse(r.body).ok,true);});
test('visitor model status never exposes configuration or model ID',async()=>{const r=await dispatch(server,{url:'/api/model/status'}),s=JSON.parse(r.body);assert.equal(s.configured,false);assert.equal(s.requiresAuth,true);assert.equal(s.model,null);assert(!r.body.includes(env.ARK_API_KEY));});
test('visitor cannot spend model quota by calling API directly',async()=>{const n=calls;const r=await dispatch(server,{url:'/api/model/edit',method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({instruction:'变蓝',context:ctx})});assert.equal(r.status,401);assert.equal(calls,n);});
test('owner login page is public and does not contain either secret',async()=>{const r=await dispatch(server,{url:'/owner'});assert.equal(r.status,200);assert(r.body.includes('type="password"'));assert(!r.body.includes(env.ARK_API_KEY));assert(!r.body.includes(env.WORKBENCH_OWNER_PASSWORD));});
test('wrong password does not set a session cookie',async()=>{const r=await dispatch(server,{url:'/api/session',method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:form('wrong')});assert.equal(r.status,303);assert.equal(r.headers.Location,'/owner?error=1');assert(!r.headers['Set-Cookie']);});
test('owner receives Secure HttpOnly same-site signed cookie',async()=>{const r=await dispatch(server,{url:'/api/session',method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:form(env.WORKBENCH_OWNER_PASSWORD)});assert.equal(r.status,303);const value=r.headers['Set-Cookie'];for(const flag of ['Secure','HttpOnly','SameSite=Lax'])assert(value.includes(flag));assert(!value.includes(env.WORKBENCH_OWNER_PASSWORD));cookie=value.split(';')[0];});
test('owner can discover configured model',async()=>{const r=await dispatch(server,{url:'/api/model/status',headers:{cookie}}),s=JSON.parse(r.body);assert.equal(s.configured,true);assert.equal(s.ownerAuthenticated,true);assert.equal(s.visionEnabled,true);assert.equal(s.model,'test-model');assert(!r.body.includes(env.ARK_API_KEY));});
test('owner edit reaches provider and returns bounded structured plan',async()=>{const n=calls;const r=await dispatch(server,{url:'/api/model/edit',method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify({instruction:'改成蓝色',context:ctx})});assert.equal(r.status,200);const plan=JSON.parse(r.body);assert.equal(plan.layerId,'l1');assert.equal(plan.changes[0].before,'#ffffff');assert.equal(plan.changes[0].after,'#4488ee');assert.equal(calls,n+1);});
test('forged cookie does not authenticate',async()=>{const r=await dispatch(server,{url:'/api/model/status',headers:{cookie:cookie.slice(0,-3)+'xxx'}});assert.equal(JSON.parse(r.body).configured,false);});
test('expired cookie is rejected and password rotation invalidates old sessions',()=>{const req={headers:{}},old=loginCookie(req,env,Date.now()-9*3600000).split(';')[0];assert.equal(ownerSession({headers:{cookie:old}},env),false);assert.equal(ownerSession({headers:{cookie}},{...env,WORKBENCH_OWNER_PASSWORD:'a-different-password-123456789'}),false);});
test('cross-origin POST is rejected even with owner cookie',async()=>{const n=calls;const r=await dispatch(server,{url:'/api/model/edit',method:'POST',headers:{origin:'https://evil.example',cookie,'content-type':'application/json'},body:'{}'});assert.equal(r.status,403);assert.equal(calls,n);});
test('cross-site API request without Origin is also rejected',async()=>{const r=await dispatch(server,{url:'/api/model/status',headers:{cookie,'sec-fetch-site':'cross-site'}});assert.equal(r.status,403);});
test('untrusted Host is rejected',async()=>{const r=await dispatch(server,{headers:{host:'evil.example'}});assert.equal(r.status,403);});
test('owner logout expires cookie',async()=>{const r=await dispatch(server,{url:'/api/session/logout',method:'POST',headers:{origin,cookie}});assert.equal(r.status,303);assert(r.headers['Set-Cookie'].includes('Max-Age=0'));});
test('static routing never serves secrets, backend code or dotfiles',async()=>{for(const url of ['/.env','/server.mjs','/server/ark-provider.mjs','/../.env','/%2e%2e%2f.env','/src/ark-client.js','/Dockerfile']){assert.equal((await dispatch(server,{url})).status,404,url);}});
test('unset owner password is fail-closed for model but leaves editor public',async()=>{const s=createWorkbenchServer({env:{PUBLIC_ORIGIN:origin},fetchImpl:upstream});assert.equal((await dispatch(s)).status,200);const r=await dispatch(s,{url:'/api/model/status'});assert.equal(JSON.parse(r.body).ownerLoginEnabled,false);assert.equal((await dispatch(s,{url:'/api/session',method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:form('anything')})).status,503);});
test('Render external URL is used without trusting arbitrary Host headers',()=>{assert.equal(publicOrigin({RENDER_EXTERNAL_URL:'https://demo.onrender.com'}),'https://demo.onrender.com');assert.equal(publicOrigin({PUBLIC_ORIGIN:'https://example.com/path'}),null);assert.equal(publicOrigin({PUBLIC_ORIGIN:'http://evil.example'}),null);});
