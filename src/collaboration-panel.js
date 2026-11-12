import {buildContext,effectiveLayer,applyPlan,undoEdit,recordManualChange,suggestionsFor,clearFieldOverrides} from './collaboration.js';
import {createDoubaoBridge,createParentMessageAdapter} from './doubao-bridge.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const seconds=v=>Number(v||0).toFixed(1);
const button=(action,label,extra='')=>`<button type="button" data-action="${action}" ${extra}>${label}</button>`;

export function createCollaborationPanel({root,getProject,getSelection,replaceProject,render,draw,locate,getFrame,openDialog,notify}){
  const state={draft:'',scope:'layer',range:null,compareId:null,lastReply:null,pending:null,collapsed:false,sequence:0,manualFields:{}};
  let connected=false,availableAdapter=null,cloudAccess=null;
  const bridge=createDoubaoBridge({onStatus:()=>{if(root.firstChild)queueMicrotask(render);}});
  function selection(){return getSelection();}
  function range(){if(state.scope!=='custom'||!state.range)return null;return {start:Number(state.range.start),end:Number(state.range.end)};}
  function context({frame=false}={}){const s=selection();return buildContext(getProject(),{sceneId:s.scene?.id,layerId:s.layer?.id,time:s.time,range:range(),...(frame?{frame:getFrame()?.dataUrl}:{} )});}
  function mode(){return connected?'模型已配置':cloudAccess?.requiresAuth?'访客模式 · 可自由编辑':availableAdapter?'本地指令 · 模型可用':'本地指令模式';}
  function editStatus(edit){if(edit?.status==='superseded-by-hand')return '已由手动编辑接管';if(edit?.status?.startsWith('expired')||edit?.status==='target-removed')return '相关对象或范围已变化，此修改已失效';if(edit?.active===false)return '此项修改已撤销';if(edit?.changes?.some(c=>c.disabled))return '部分属性已由手动编辑接管';return '';}
  function shell(content,view){const project=getProject();return `<div class="db-shell ${view==='editor'?'is-editor':'is-home'} ${state.collapsed?'db-nav-collapsed':''}"><aside class="db-global-nav"><div class="db-nav-brand"><span class="db-nav-icon">豆</span><span class="db-nav-wordmark">豆包<span class="db-nav-subtitle">工作</span></span></div><button type="button" class="db-nav-toggle" data-action="db-nav-toggle" aria-label="${state.collapsed?'展开导航':'收起导航'}">☰</button><nav><button type="button" class="db-nav-item is-active" data-action="home"><span class="db-nav-icon">▣</span><span class="db-nav-label">动画创作</span></button><button type="button" class="db-nav-item" data-action="blank"><span class="db-nav-icon">＋</span><span class="db-nav-label">新建动画</span></button><button type="button" class="db-nav-item" data-action="import"><span class="db-nav-icon">↗</span><span class="db-nav-label">打开项目</span></button></nav><div class="db-nav-caption">当前作品</div><div class="db-nav-project">${esc(view==='editor'?project.name:'选择作品开始')}</div><div class="db-nav-footer"><span class="db-nav-icon">我</span><span class="db-nav-label">本地工作空间</span></div></aside><div class="db-workspace">${content}</div></div>`;}
  function receipt(){
    const reply=state.lastReply,edits=getProject().collaboration?.edits||[];
    if(!reply)return `<div class="db-receipt is-info"><span class="db-assistant-avatar">豆</span><div class="db-receipt-copy"><strong>选中对象，接着描述你想改什么</strong><small>手动操作和指令修改会保留在同一份工程中。</small></div></div>`;
    const edit=reply.editId?edits.find(e=>e.id===reply.editId):null;
    const available=edit?.active!==false&&edit;
    const text=reply.editId&&!edit?'当前版本已回退，画布显示回退后的作品。':reply.message;
    return `<div class="db-receipt ${reply.error?'is-conflict':edit?'':'is-info'}"><span class="db-assistant-avatar">${reply.source==='doubao'?'豆':'↳'}</span><div class="db-receipt-copy"><strong>${esc(text)}</strong><small>${esc(reply.editId?(editStatus(edit)||`${reply.source==='doubao'?'豆包修改':'本地指令'} · ${reply.targetName||'当前对象'} · ${reply.rangeLabel||'整对象'}`):'围绕当前作品继续操作')}</small></div>${edit?`<div class="db-receipt-actions">${button('db-locate','定位',`data-edit-id="${esc(edit.id)}"`)}${button('db-compare',state.compareId===edit.id?'回到当前':'同帧对比',`data-edit-id="${esc(edit.id)}" aria-pressed="${state.compareId===edit.id}" ${available?'':'disabled'}`)}${button('db-undo','撤销该修改',`data-edit-id="${esc(edit.id)}" ${available?'':'disabled'}`)}</div>`:''}</div>`;
  }
  function html(){
    const s=selection(),c=context(),suggestions=suggestionsFor(c)||[],meta=getProject().collaboration,manual=meta?.manual?.at(-1),r=range(),layer=s.layer;
    return `<section class="db-collaboration"><div class="db-collab-top"><strong>和豆包一起做</strong><span class="db-mode">${mode()}</span>${cloudAccess?.requiresAuth?'<a href="/owner" class="db-owner-link">所有者登录</a>':cloudAccess?.ownerAuthenticated?'<a href="/owner" class="db-owner-link">模型访问管理</a>':''}${availableAdapter?button('db-toggle-mode',connected?'切回本地':'使用模型','class="db-mode-switch"'):''}${button('db-history',`修改记录 ${meta?.edits?.length||0}`)}</div><div data-collab-receipt>${receipt()}</div><div class="db-compose"><div class="db-context"><span class="db-chip is-muted">${esc(s.scene?.name||'当前镜头')}</span><span class="db-chip" data-collab-object>${esc(layer?.name||'尚未选择对象')}</span><span class="db-chip" data-collab-range>${r?seconds(r.start)+'–'+seconds(r.end)+' 秒':'整对象'}</span>${layer?button('db-clear-selection','×','class="db-clear-ref" aria-label="移除选中对象引用"'):''}<span class="db-chip is-muted" data-collab-manual>${manual?'已带入最新手动修改':'沿用当前作品'}</span></div><div class="db-range"><label>作用范围<select data-collab-scope><option value="layer" ${state.scope==='layer'?'selected':''}>整对象</option><option value="custom" ${state.scope==='custom'?'selected':''}>指定时段</option></select></label><label ${r?'':'hidden'}>从<input type="number" min="0" max="${s.scene?.duration||10}" step="0.1" value="${seconds(r?.start)}" data-range-start></label><label ${r?'':'hidden'}>到<input type="number" min="0" max="${s.scene?.duration||10}" step="0.1" value="${seconds(r?.end||s.scene?.duration)}" data-range-end></label><span ${r?'':'hidden'}>秒</span><span class="db-now" data-collab-now>当前 ${seconds(s.localTime)} 秒</span></div><textarea data-collab-input rows="2" aria-label="对当前动画的修改指令" placeholder="${connected?'描述想怎样修改当前动画…':'例如：放大 20%、改成蓝色、淡入一下…'}">${esc(state.draft)}</textarea><div class="db-suggestions">${suggestions.slice(0,3).map((v,i)=>button('db-suggestion',esc(v.label||v.instruction),`data-suggestion="${i}"`)).join('')}</div><div class="db-compose-bottom"><span class="db-context-note">${state.compareId?'正在查看去掉该次修改后的画面':state.pending?'正在处理；你仍可手动编辑其他属性。':'仅调整指令指定的属性，保留其余手动编辑。'}</span>${state.pending?button('db-cancel','取消','class="db-send"'):button('db-send',connected?'发送给豆包':'应用指令',`class="db-send" ${layer?.locked?'disabled':''}`)}</div></div></section>`;
  }
  function syncDOM(){const s=selection();const el=root.querySelector('[data-collab-now]');if(el)el.textContent=`当前 ${seconds(s.localTime)} 秒`;const m=root.querySelector('[data-collab-manual]');if(m)m.textContent=getProject().collaboration?.manual?.length?'已带入最新手动修改':'沿用当前作品';}
  function reset({sceneOnly=false}={}){state.range=null;state.scope='layer';state.compareId=null;if(!sceneOnly){cancel();state.lastReply=null;state.draft='';}}
  function stopComparison(){state.compareId=null;}
  function beforeManual(layerId,paths){stopComparison();const s=selection();if(layerId){state.manualFields[layerId]=[...new Set([...(state.manualFields[layerId]||[]),...paths])];clearFieldOverrides(getProject(),s.scene.id,layerId,paths);}}
  function afterManual(before,description){recordManualChange(getProject(),typeof before==='string'?JSON.parse(before):before,description||'手动调整',{explicitFields:state.manualFields});state.manualFields={};state.compareId=null;}
  function targetInfo(c){return {targetName:c.layer?.name||c.selectedLayer?.name||selection().layer?.name,rangeLabel:c.range?`${seconds(c.range.start)}–${seconds(c.range.end)} 秒`:'整对象'};}
  function cancel(){state.sequence++;state.pending?.controller.abort();state.pending=null;}
  async function send(instruction=state.draft){
    const text=String(instruction||'').trim();if(!text||state.pending)return;
    state.draft=text;state.compareId=null;
    const c=context({frame:connected});const token=++state.sequence,controller=new AbortController();state.pending={token,controller};render();
    try{
      const result=await bridge.requestEdit(text,c,{signal:controller.signal});if(state.pending?.token!==token||controller.signal.aborted)return;
      const plan=result?.plan||result,source=result?.source||plan?.source||(connected?'doubao':'local');
      if(plan?.error||!plan?.changes?.length){state.lastReply={message:plan?.message||plan?.summary||'这句需要更具体的修改目标。可以点选下方建议继续。',source,error:!!plan?.error};return;}
      if(plan.sceneId!==c.sceneId||plan.layerId!==c.layerId||JSON.stringify(plan.range??null)!==JSON.stringify(c.range??null)){state.lastReply={message:'这次方案超出了引用的对象或时间段，当前作品保持不变。请重新选择范围后再发送。',source,error:true};return;}
      const applied=applyPlan(getProject(),plan,{source});
      if(applied.error){state.lastReply={message:applied.message||String(applied.error),source,error:true};return;}
      const stillSelected=selection().scene?.id===c.sceneId&&selection().layer?.id===c.layerId;
      const showEditedRange=stillSelected&&c.range&&(selection().localTime<c.range.start||selection().localTime>=c.range.end);
      state.lastReply={editId:applied.edit.id,message:applied.edit.summary||plan.summary||'已应用到当前作品',source,...targetInfo(c)};state.draft='';replaceProject(applied.project);
      if(showEditedRange)locate(c.sceneId,c.layerId,c.sampleLocalTime??(c.range.start+c.range.end)/2);
    }catch(error){if(!controller.signal.aborted)state.lastReply={message:connected?'豆包连接暂未完成这次修改，原作品已保留。':error.message,source:connected?'doubao':'local',error:true};}
    finally{if(state.pending?.token===token){state.pending=null;render();}}
  }
  function locateEdit(id){const e=getProject().collaboration?.edits?.find(e=>e.id===id);if(!e)return;state.compareId=null;locate(e.sceneId,e.layerId,e.range?(e.range.start+e.range.end)/2:null);}
  function showHistory(){const edits=getProject().collaboration?.edits||[];openDialog('动画修改记录',`<div class="db-history-list">${edits.length?[...edits].reverse().map(e=>`<article class="db-history-item"><header><strong>${esc(e.summary||e.instruction)}</strong><span>${e.source==='doubao'?'豆包':'本地指令'}</span></header><p>${esc(e.instruction)}</p><small>${esc(editStatus(e)||'已记录')} · ${e.range?seconds(e.range.start)+'–'+seconds(e.range.end)+' 秒':'整对象'}</small><div>${button('db-locate','定位',`data-edit-id="${esc(e.id)}"`)}${button('db-compare','对比',`data-edit-id="${esc(e.id)}" ${e.active===false?'disabled':''}`)}${button('db-undo','撤销该修改',`data-edit-id="${esc(e.id)}" ${e.active===false?'disabled':''}`)}</div></article>`).join(''):'<p class="wb-panel-hint">这里会保留针对当前动画执行的指令。手动编辑仍可通过顶部撤销、重做。</p>'}</div>`,button('close-dialog','关闭'));}
  function handleAction(action,target){
    if(!action.startsWith('db-'))return false;
    if(action==='db-nav-toggle'){state.collapsed=!state.collapsed;render();}
    else if(action==='db-toggle-mode'){if(availableAdapter){cancel();connected=!connected;bridge.setAdapter(connected?availableAdapter:null);render();}}
    else if(action==='db-send')send();
    else if(action==='db-cancel'){cancel();state.lastReply={message:'已取消本次请求，当前作品保留。',source:'local'};render();}
    else if(action==='db-suggestion'){const s=suggestionsFor(context())[Number(target.dataset.suggestion)];if(s){state.draft=s.instruction||s.label;const el=root.querySelector('[data-collab-input]');if(el){el.value=state.draft;el.focus();}}}
    else if(action==='db-clear-selection'){locate(selection().scene.id,null,null);}
    else if(action==='db-history')showHistory();
    else if(action==='db-locate'){root.querySelector('[data-dialog]')?.close();locateEdit(target.dataset.editId);}
    else if(action==='db-compare'){root.querySelector('[data-dialog]')?.close();state.compareId=state.compareId===target.dataset.editId?null:target.dataset.editId;render();}
    else if(action==='db-undo'){const result=undoEdit(getProject(),target.dataset.editId);if(result.error){notify(result.message||result.error,true);return true;}state.compareId=null;replaceProject(result.project);}
    return true;
  }
  function handleInput(target){
    if(target.matches('[data-collab-input]')){state.draft=target.value;return true;}
    if(target.matches('[data-range-start],[data-range-end]')){const scene=selection().scene;state.range??={start:0,end:scene.duration};state.range[target.matches('[data-range-start]')?'start':'end']=Number(target.value);const el=root.querySelector('[data-collab-range]'),r=range();if(el)el.textContent=`${seconds(r.start)}–${seconds(r.end)} 秒`;return true;}
    return false;
  }
  function handleChange(target){if(target.matches('[data-collab-scope]')){state.scope=target.value;const s=selection();if(state.scope==='custom')state.range={start:Math.max(0,Math.round(s.localTime*10)/10),end:Math.min(s.scene.duration,Math.round((s.localTime+3)*10)/10)};if(state.range&&state.range.end<=state.range.start)state.range.start=Math.max(0,state.range.end-1);render();return true;}return target.matches('[data-collab-input],[data-range-start],[data-range-end]');}
  function setAdapter(adapter){cancel();availableAdapter=typeof adapter==='function'?adapter:null;connected=!!availableAdapter;bridge.setAdapter(availableAdapter);state.lastReply={message:connected?'模型配置已载入。发送后将校验实际返回的修改结果。':'已切回本地指令模式。',source:connected?'doubao':'local'};render();}
  return {state,html,shell,syncDOM,reset,stopComparison,beforeManual,afterManual,context,send,handleAction,handleInput,handleChange,setAdapter,setCloudAccessStatus(status){cloudAccess=status;if(status.ownerAuthenticated&&!status.configured)state.lastReply={message:status.message||'请在托管平台配置模型。',source:'local'};render();},connectToHost:options=>setAdapter(createParentMessageAdapter(options)),effectiveLayer:(layer,t=selection().time)=>effectiveLayer(getProject(),selection().scene.id,layer.id,t,{excludeEditId:state.compareId}),renderOptions:()=>({excludeEditId:state.compareId}),getMode:()=>connected?'doubao':'local',dispose:()=>{cancel();bridge.dispose();}};
}
