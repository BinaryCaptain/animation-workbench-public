import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadArkConfig,requestArkEdit,PublicError} from './server/ark-provider.mjs';
import {publicOrigin,requestAllowed,ownerConfigured,ownerSession,passwordValid,loginCookie,logoutCookie,loginPage} from './server/cloud-access.mjs';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.txt':'text/plain; charset=utf-8'};
const STATIC=new Set(['index.html','app.js','styles.css','doubao-shell.css','vendor/THREE-LICENSE.txt']);
function json(res,status,data){if(res.destroyed||res.writableEnded)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
function redirect(res,url,cookie){res.writeHead(303,{Location:url,'Cache-Control':'no-store',...(cookie?{'Set-Cookie':cookie}:{})});res.end();}
function readBody(req,max=2_000_000){return new Promise((resolve,reject)=>{
 const chunks=[];let length=0,done=false;
 const finish=(error,value)=>{if(done)return;done=true;req.off('data',data);req.off('end',end);req.off('aborted',aborted);req.off('error',failed);if(error){req.resume();reject(error);}else resolve(value);};
 const data=chunk=>{length+=chunk.length;if(length>max)return finish(new PublicError(413,'REQUEST_TOO_LARGE','请求内容过大。'));chunks.push(chunk);};
 const end=()=>finish(null,Buffer.concat(chunks).toString('utf8'));
 const aborted=()=>finish(new DOMException('Request cancelled','AbortError'));
 const failed=()=>finish(new PublicError(400,'INVALID_REQUEST','请求未完整发送。'));
 req.on('data',data);req.once('end',end);req.once('aborted',aborted);req.once('error',failed);
});}
async function staticFile(req,res,root,route){
 if(!['GET','HEAD'].includes(req.method)){json(res,405,{error:'METHOD_NOT_ALLOWED'});return;}
 let name;try{name=decodeURIComponent(route==='/'?'index.html':route.slice(1));}catch{json(res,400,{error:'INVALID_PATH'});return;}
 if(!STATIC.has(name)){json(res,404,{error:'NOT_FOUND'});return;}
 try{const [realRoot,file]=await Promise.all([fs.realpath(root),fs.realpath(path.join(root,name))]);if(!file.startsWith(realRoot+path.sep))throw Error('Outside root');const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':MIME[path.extname(name)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Cross-Origin-Resource-Policy':'same-origin'});res.end(req.method==='HEAD'?undefined:bytes);}catch{json(res,404,{error:'NOT_FOUND'});}
}
export function createWorkbenchServer({root=ROOT,env=process.env,fetchImpl=globalThis.fetch}={}){
 const requests=new Set(),modelStarts=[],loginAttempts=new Map();let active=0;
 const quota=Math.max(1,Math.min(120,Number(env.MODEL_REQUESTS_PER_MINUTE)||10));
 const server=http.createServer(async(req,res)=>{
  let url;try{url=new URL(req.url,'http://request.local');}catch{json(res,400,{error:'INVALID_PATH'});return;}
  const route=url.pathname;
  if(route==='/healthz'&&['GET','HEAD'].includes(req.method)){json(res,200,{ok:true,service:'animation-workbench'});return;}
  if(!requestAllowed(req,env,{api:route.startsWith('/api/')})){json(res,403,{error:'ORIGIN_DENIED',message:'请求来源不匹配，请检查 PUBLIC_ORIGIN 或托管平台域名配置。'});return;}
  const authenticated=ownerSession(req,env);
  try{
   if(route==='/owner'&&req.method==='GET'){
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'same-origin','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"});res.end(loginPage({authenticated,configured:ownerConfigured(env),error:url.searchParams.get('error')==='1'}));return;
   }
   if(route==='/api/session'){
    if(req.method!=='POST'){json(res,405,{error:'METHOD_NOT_ALLOWED'});return;}
    if(!/^application\/x-www-form-urlencoded(?:;|$)/i.test(req.headers['content-type']||'')){json(res,415,{error:'FORM_REQUIRED'});return;}
    if(!ownerConfigured(env)){json(res,503,{error:'OWNER_NOT_CONFIGURED',message:'所有者登录尚未配置。'});return;}
    const now=Date.now(),ip=req.socket?.remoteAddress||'local';for(const [key,value]of loginAttempts)if(now-value.since>300000)loginAttempts.delete(key);
    const attempts=loginAttempts.get(ip)||{since:now,count:0};if(attempts.count>=30){json(res,429,{error:'LOGIN_RATE_LIMIT',message:'尝试过于频繁，请五分钟后重试。'});return;}
    const fields=new URLSearchParams(await readBody(req,4096));
    if(!passwordValid(fields.get('password'),env)){attempts.count++;loginAttempts.set(ip,attempts);redirect(res,'/owner?error=1');return;}
    loginAttempts.delete(ip);redirect(res,'/',loginCookie(req,env));return;
   }
   if(route==='/api/session/logout'){
    if(req.method!=='POST'){json(res,405,{error:'METHOD_NOT_ALLOWED'});return;}
    redirect(res,'/',logoutCookie(req,env));return;
   }
   if(route==='/api/model/status'){
    if(req.method!=='GET'){json(res,405,{error:'METHOD_NOT_ALLOWED'});return;}
    if(!authenticated){json(res,200,{provider:'ark',configured:false,model:null,visionEnabled:false,requiresAuth:true,ownerAuthenticated:false,ownerLoginEnabled:ownerConfigured(env),message:'编辑器公开使用；模型功能仅向登录的所有者开放。'});return;}
    const config=await loadArkConfig({env,root});json(res,200,{provider:'ark',configured:config.configured,model:config.configured?config.model:null,visionEnabled:config.configured&&config.visionEnabled,requiresAuth:false,ownerAuthenticated:true,...(config.message?{message:config.message}:{})});return;
   }
   if(route==='/api/model/edit'){
    if(req.method!=='POST'){json(res,405,{error:'METHOD_NOT_ALLOWED'});return;}
    if(!authenticated){req.resume();json(res,401,{error:'OWNER_LOGIN_REQUIRED',message:'模型功能仅供所有者使用，请先登录。',changes:[]});return;}
    if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||'')){req.resume();json(res,415,{error:'JSON_REQUIRED',message:'请求必须使用 JSON。',changes:[]});return;}
    const now=Date.now();while(modelStarts.length&&modelStarts[0]<now-60000)modelStarts.shift();
    if(active>=2||modelStarts.length>=quota){req.resume();json(res,429,{error:'MODEL_RATE_LIMIT',message:'模型请求较多，请稍后再试。',changes:[]});return;}
    let input;try{input=JSON.parse(await readBody(req));}catch(error){if(error instanceof PublicError)throw error;throw new PublicError(400,'INVALID_JSON','请求不是有效 JSON。');}
    const config=await loadArkConfig({env,root});if(!config.configured)throw new PublicError(503,'MODEL_NOT_CONFIGURED',config.message||'模型尚未配置。');
    modelStarts.push(now);active++;const controller=new AbortController();requests.add(controller);
    const cancel=()=>{if(!res.writableEnded)controller.abort();};req.once('aborted',cancel);res.once('close',cancel);
    try{json(res,200,await requestArkEdit(input,config,{signal:controller.signal,fetchImpl}));}
    catch(error){if(controller.signal.aborted||error?.name==='AbortError')return;throw error;}
    finally{active--;requests.delete(controller);req.off('aborted',cancel);res.off('close',cancel);}return;
   }
   if(route.startsWith('/api/')){json(res,404,{error:'NOT_FOUND'});return;}
   await staticFile(req,res,root,route);
  }catch(error){if(error?.name==='AbortError')return;const safe=error instanceof PublicError?error:new PublicError(500,'SERVER_ERROR','服务暂时无法完成请求，当前作品未被修改。');json(res,safe.status,{error:safe.code,message:safe.message,changes:[]});}
 });
 server.requestTimeout=30000;server.headersTimeout=15000;server.on('close',()=>{for(const controller of requests)controller.abort();});return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const port=Number(process.env.PORT||4173),host=process.env.HOST||'0.0.0.0';if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid PORT');
 const server=createWorkbenchServer();server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'Port already in use.':'Server failed to start.');process.exitCode=1;});
 server.listen(port,host,()=>console.log(`Animation workbench listening on ${host}:${port}; origin: ${publicOrigin(process.env)||'localhost only until PUBLIC_ORIGIN is configured'}`));
}
