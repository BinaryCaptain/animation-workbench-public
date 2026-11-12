import {planLocalEdit} from './collaboration.js';

const abortError=()=>new DOMException('已取消本次协作请求','AbortError');
const clone=v=>JSON.parse(JSON.stringify(v));

/** An application adapter, not an invented official Doubao SDK or endpoint. */
export function createDoubaoBridge({onStatus}={}){
 let adapter=null,disposed=false,generation=0;const pending=new Set();
 const getStatus=()=>({mode:adapter?'doubao':'local',connected:!!adapter,label:adapter?'豆包已连接':'本地指令 · 已预留豆包接入'});
 function setAdapter(next){if(next!==null&&typeof next!=='function')throw new TypeError('协作适配器必须是函数或 null');for(const controller of pending)controller.abort();adapter=next;generation++;onStatus?.(getStatus());return getStatus();}
 async function requestEdit(instruction,context,{signal}={}){
  if(disposed||signal?.aborted)throw abortError();
  if(context?.invalidRange)return {error:'INVALID_RANGE',message:'当前自定义时间范围无效，请先调整范围。',source:adapter?'doubao':'local'};
  const current=adapter,version=generation,controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});pending.add(controller);
  try{
   if(!current){await Promise.resolve();if(controller.signal.aborted)throw abortError();const plan=planLocalEdit(instruction,context);return {...plan,source:'local'};}
   const cancelled=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(abortError()),{once:true}));
   const output=await Promise.race([Promise.resolve().then(()=>{if(controller.signal.aborted)throw abortError();return current({instruction:String(instruction),context:clone(context),signal:controller.signal});}),cancelled]);
   if(controller.signal.aborted||disposed||version!==generation)throw abortError();
   if(!output||typeof output!=='object'||Array.isArray(output))return {error:'INVALID_PROVIDER_RESPONSE',message:'模型没有返回可执行的修改方案，当前作品保持原样。',source:'doubao'};
   const sameRange=(a,b)=>a==null&&b==null||a&&b&&a.start===b.start&&a.end===b.end;
   if(output.sceneId!=null&&output.sceneId!==context.sceneId||output.layerId!=null&&output.layerId!==context.layerId||Object.prototype.hasOwnProperty.call(output,'range')&&!sameRange(output.range,context.range))return {error:'INVALID_SCOPE',message:'模型方案超出了当前选中的对象或时间范围，当前作品保持原样。',source:'doubao'};
   return {sceneId:context.sceneId,layerId:context.layerId,range:clone(context.range??null),referenceTime:context.sampleTime,referenceLocalTime:context.sampleLocalTime,baseRevision:context.revision,...clone(output),instruction:String(instruction),source:'doubao'};
  }catch(e){if(e.name==='AbortError')throw e;return {error:'PROVIDER_UNAVAILABLE',message:'模型连接暂时不可用，当前作品保持原样。可重试，或切回本地指令。',source:'doubao'};}
  finally{pending.delete(controller);signal?.removeEventListener('abort',abort);}
 }
 function dispose(){disposed=true;for(const controller of pending)controller.abort();pending.clear();adapter=null;generation++;}
 return {requestEdit,setAdapter,getStatus,dispose};
}

/** Opt-in transport: the embedder must explicitly supply its trusted origin and token. */
export function createParentMessageAdapter({origin,token,targetWindow=globalThis.parent,timeoutMs=45000}={}){
 if(typeof origin!=='string'||!/^https?:\/\//.test(origin)||new URL(origin).origin!==origin||origin==='*')throw new TypeError('必须提供精确的受信任宿主 origin');
 if(typeof token!=='string'||token.length<16)throw new TypeError('必须提供会话通信 token');
 if(!targetWindow||targetWindow===globalThis)throw new TypeError('需要指定嵌入工作台的宿主窗口');
 return ({instruction,context,signal})=>new Promise((resolve,reject)=>{
  const requestId=globalThis.crypto?.randomUUID?.()||`request-${Date.now()}-${Math.random()}`,timer=setTimeout(()=>finish(new Error('Host timeout')),Math.max(1000,Math.min(timeoutMs,120000)));
  function cleanup(){clearTimeout(timer);globalThis.removeEventListener('message',receive);signal?.removeEventListener('abort',abort);}
  function finish(err,value){cleanup();err?reject(err):resolve(value);}
  function abort(){try{targetWindow.postMessage({channel:'animation-workbench-collaboration',version:1,type:'cancel',requestId,token},origin);}finally{finish(abortError());}}
  function receive(event){const data=event.data;if(event.origin!==origin||event.source!==targetWindow||!data||data.channel!=='animation-workbench-collaboration'||data.version!==1||data.requestId!==requestId||data.token!==token||data.type!=='edit-result')return;finish(null,data.plan);}
  globalThis.addEventListener('message',receive);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}
  try{targetWindow.postMessage({channel:'animation-workbench-collaboration',version:1,type:'edit-request',requestId,token,instruction,context},origin);}catch(e){finish(e);}
 });
}
