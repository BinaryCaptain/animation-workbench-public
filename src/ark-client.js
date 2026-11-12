// Browser-side adapter. Credentials belong only to the local Node service.
const appOrigin=()=>['http:','https:'].includes(globalThis.location?.protocol);
const localStatus=message=>({provider:'ark',configured:false,model:null,visionEnabled:false,...(message?{message}:{})});

export async function getArkStatus({signal}={}){
  if(!appOrigin())return localStatus();
  try{
    const response=await fetch('/api/model/status',{signal,credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
    if(!response.ok)return localStatus('模型服务暂不可用，当前使用本地指令。');
    const status=await response.json();
    if(status?.provider!=='ark'||typeof status.configured!=='boolean')return localStatus();
    return {provider:'ark',configured:status.configured,model:typeof status.model==='string'?status.model:null,visionEnabled:status.visionEnabled===true,requiresAuth:status.requiresAuth===true,ownerAuthenticated:status.ownerAuthenticated===true,ownerLoginEnabled:status.ownerLoginEnabled===true,...(typeof status.message==='string'?{message:status.message}:{})};
  }catch(error){if(signal?.aborted)throw error;return localStatus('模型服务暂不可用，当前使用本地指令。');}
}
export function createArkAdapter({visionEnabled=false}={}){
  return async({instruction,context,signal})=>{
    if(!appOrigin())return {error:'LOCAL_SERVICE_REQUIRED',message:'请通过工作台网站打开，并以所有者身份登录模型功能。',changes:[]};
    const snapshot={...context};if(!visionEnabled)delete snapshot.frame;
    const response=await fetch('/api/model/edit',{method:'POST',signal,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({instruction,context:snapshot})});
    const plan=await response.json();
    if(!plan||typeof plan!=='object'||Array.isArray(plan))throw new Error('模型服务未返回有效方案。');
    if(!response.ok&&!plan.error)throw new Error('模型服务暂不可用。');
    return plan;
  };
}
/** File-opened HTML stays local; HTTPS deployments use their same-origin model service. */
export async function connectArkClient(workbench,{onStatus,signal}={}){
  const status=await getArkStatus({signal});
  workbench?.setCloudAccessStatus?.(status);
  if(status.configured){if(typeof workbench?.setAssistantAdapter!=='function')throw new TypeError('工作台尚未提供协作接口。');workbench.setAssistantAdapter(createArkAdapter({visionEnabled:status.visionEnabled}));}
  onStatus?.(status);return status;
}
