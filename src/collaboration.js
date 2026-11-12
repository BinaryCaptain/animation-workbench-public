import {styles,getLayerPose} from './core.js';

// Collaboration is an optional view layer. Existing scene data/renderers remain untouched.
const STYLE=new Map(styles.map(s=>[s.id,s]));
const POSE=['x','y','scale','rotation','opacity'];
const MOTIONS=['none','float','spin','pulse','bounce','reveal','path'];
const FORBIDDEN=new Set(['__proto__','prototype','constructor']);
const LIMIT=120;
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const copy=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
const norm=v=>v===undefined?null:v;
const equal=(a,b)=>JSON.stringify(norm(a))===JSON.stringify(norm(b));
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const uid=()=>globalThis.crypto?.randomUUID?.()||`edit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`;
const error=(code,message,extra={})=>({error:code,message,...extra});
const COLORS={红色:'#e76156',红:'#e76156',蓝色:'#4389ef',蓝:'#4389ef',绿色:'#52a98a',绿:'#52a98a',黄色:'#efc85c',黄:'#efc85c',紫色:'#a17bda',紫:'#a17bda',橙色:'#eb9a56',橙:'#eb9a56',白色:'#ffffff',白:'#ffffff',黑色:'#18232e',黑:'#18232e',粉色:'#e595b4',金色:'#dbb574',青色:'#66bac4'};

function sceneLocation(project,id){let start=0;for(const scene of project.scenes||[]){if(scene.id===id)return {scene,start};start+=scene.duration;}return null;}
function targetLocation(project,sceneId,layerId){const loc=sceneLocation(project,sceneId);if(!loc)return null;const layer=loc.scene.layers.find(l=>l.id===layerId);return layer?{...loc,layer}:null;}
function cleanPath(path){if(typeof path!=='string'||path.length>100)return null;const keys=path.split('.');if(keys.some(k=>!k||FORBIDDEN.has(k))||keys.length>2)return null;return keys;}
function read(object,path){const keys=cleanPath(path);if(!keys)return undefined;let v=object;for(const k of keys)v=v?.[k];return v;}
function write(object,path,value){const keys=cleanPath(path);if(!keys)return;let o=object;for(const k of keys.slice(0,-1)){o[k]={...(o[k]||{})};o=o[k];}o[keys.at(-1)]=copy(value);}
function relevantControls(layer){const s=STYLE.get(layer.type),part=layer.params?.part||'all';return (s?.controls||[]).filter(c=>(part==='all'||!c.parts||c.parts.includes(part))&&!(layer.params?.imageId&&c.key==='text'));}
function canText(layer){if(layer.type==='text')return true;const s=STYLE.get(layer.type),part=layer.params?.part||'all';return !!s&&has(s.defaults||{},'text')&&!layer.params?.imageId&&(!s.textParts||part==='all'||s.textParts.includes(part));}
function numeric(min,max){return {type:'number',min,max};}
function parameterRules(layer){
 const s=STYLE.get(layer.type),rules={};
 if(s){for(const c of relevantControls(layer)){rules[c.key]=c.type==='range'?numeric(c.min,c.max):c.type==='color'?{type:'color'}:c.type==='select'?{type:'enum',values:(c.options||[]).map(o=>o.value??o)}:{type:'string',max:4000};}if(canText(layer))rules.text={type:'string',max:4000};const part=layer.params?.part||'all';if(s.imageParts&&(part==='all'||s.imageParts.includes(part)))rules.imageId={type:'asset'};if(layer.params?.imageId&&s.id==='page'&&(part==='document'||part==='all')){delete rules.color;delete rules.secondary;}return rules;}
 if(layer.type==='text')return {text:{type:'string',max:4000},color:{type:'color'},fontSize:numeric(10,340),fontWeight:numeric(100,900),fontFamily:{type:'string',max:150},align:{type:'enum',values:['left','center','right']},shadow:{type:'boolean'}};
 if(layer.type==='shape')return {shape:{type:'enum',values:['circle','rect','triangle','star']},color:{type:'color'},stroke:{type:'color'},strokeWidth:numeric(0,100),width:numeric(1,2400),height:numeric(1,1350),radius:numeric(1,600)};
 if(layer.type==='path')return {color:{type:'color'},lineWidth:numeric(1,100),closed:{type:'boolean'},reveal:{type:'boolean'},brush:{type:'enum',values:['solid','ink','glow']}};
 if(layer.type==='image')return {assetId:{type:'asset'},imageId:{type:'asset'},fit:{type:'enum',values:['contain','cover']},width:numeric(1,2400),height:numeric(1,1350)};
 if(layer.type==='object3d')return {geometry:{type:'enum',values:['box','sphere','cylinder','cone','torus']},color:{type:'color'},metalness:numeric(0,1),roughness:numeric(.05,1),rotateX:numeric(-180,180),rotateY:numeric(-180,180),rotateZ:numeric(-180,180),width:numeric(.2,3),height:numeric(.2,3),depth:numeric(.2,3),camera:numeric(0,1),turnSpeed:numeric(-90,90)};
 return rules;
}
function ruleFor(layer,path){
 const parts=cleanPath(path);if(!parts)return null;
 if(parts.length===1){if(['x','y'].includes(path))return numeric(-1,2);if(path==='scale')return numeric(.05,5);if(path==='rotation')return numeric(-720,720);if(path==='opacity')return numeric(0,1);if(path==='path')return {type:'path'};if(path==='keyframes')return {type:'keyframes'};return null;}
 if(parts[0]==='params')return parameterRules(layer)[parts[1]]||null;
 if(parts[0]==='motion')return parts[1]==='kind'?{type:'enum',values:MOTIONS}:parts[1]==='speed'?numeric(.05,4):parts[1]==='amount'?numeric(0,1):null;
 return null;
}
function safeJSON(v,depth=0){if(depth>8)return false;if(v===null||typeof v==='string'||typeof v==='boolean'||finite(v))return true;if(Array.isArray(v))return v.length<=3000&&v.every(x=>safeJSON(x,depth+1));if(typeof v==='object'&&v&&Object.getPrototypeOf(v)!==null&&Object.getPrototypeOf(v)!==Object.prototype)return false;if(v&&typeof v==='object')return Object.keys(v).length<=30&&Object.keys(v).every(k=>!FORBIDDEN.has(k)&&safeJSON(v[k],depth+1));return false;}
function validValue(rule,value,project,scene){
 if(!rule||!safeJSON(value))return false;
 if(rule.type==='number')return finite(value)&&value>=rule.min&&value<=rule.max;
 if(rule.type==='boolean')return typeof value==='boolean';
 if(rule.type==='string')return typeof value==='string'&&value.length<=rule.max;
 if(rule.type==='color')return typeof value==='string'&&/^#(?:[a-f0-9]{3}|[a-f0-9]{6}|[a-f0-9]{8})$/i.test(value);
 if(rule.type==='enum')return rule.values.some(v=>v===value);
 if(rule.type==='asset')return typeof value==='string'&&(value===''||(project.assets||[]).some(a=>a.id===value));
 if(rule.type==='path'){let last=-Infinity;return Array.isArray(value)&&value.length<=2048&&value.every(p=>{if(!p||Object.keys(p).some(k=>!['x','y','t'].includes(k))||!finite(p.x)||!finite(p.y)||!finite(p.t)||p.x < -3||p.x>4||p.y < -3||p.y>4||p.t<last||p.t<0||p.t>Math.max(300,scene.duration))return false;last=p.t;return true;});}
 if(rule.type==='keyframes')return Array.isArray(value)&&value.length<=200&&value.every(k=>k&&finite(k.time)&&k.time>=0&&k.time<=scene.duration&&Object.keys(k).every(p=>p==='time'||POSE.includes(p)&&validValue(ruleFor({},p),k[p],project,scene)));
 return false;
}
function validRange(range,scene,layer){return range===null||range===undefined||range&&Object.keys(range).every(k=>['start','end'].includes(k))&&finite(range.start)&&finite(range.end)&&range.start>=Math.max(0,layer.start||0)&&range.end<=Math.min(scene.duration,layer.end??scene.duration)&&range.end>range.start;}
function inRange(edit,local,layer){const a=edit.range?.start??layer.start??0,b=edit.range?.end??layer.end??Infinity;return local>=a&&(edit.range?local<b:local<=b);}
function activeChanges(edit){return edit.active!==false?(edit.changes||[]).filter(c=>!c.disabled):[];}

export function ensureCollaboration(project){if(!project.collaboration)project.collaboration={version:1,revision:0,edits:[],manual:[]};return project.collaboration;}
function validMode(change){return change.mode===undefined||change.mode==='absolute'||POSE.includes(change.path)&&['offset','multiply'].includes(change.mode)&&finite(change.before)&&finite(change.after)&&(change.mode!=='multiply'||Math.abs(change.before)>1e-9);}
function expireStaleEdits(project){
 for(const edit of project.collaboration?.edits||[]){if(edit.active===false)continue;const loc=targetLocation(project,edit.sceneId,edit.layerId);if(!loc){edit.active=false;edit.status='target-removed';continue;}if(!validRange(edit.range,loc.scene,loc.layer)){edit.active=false;edit.status='expired-range';continue;}for(const change of activeChanges(edit)){if(!validValue(ruleFor(loc.layer,change.path),change.after,project,loc.scene)){change.disabled=true;change.status='expired-field';}}if(!activeChanges(edit).length){edit.active=false;edit.status='expired-field';}}
}
export function validateCollaboration(project){
 const c=project.collaboration;if(c==null)return project;
 if(!c||c.version!==1||!Array.isArray(c.edits)||!Array.isArray(c.manual)||c.edits.length>LIMIT)throw new Error('协作记录格式或版本不正确');
 const ids=new Set();for(const edit of c.edits){if(!edit||typeof edit.id!=='string'||edit.id.length>200||ids.has(edit.id)||!Array.isArray(edit.changes)||edit.changes.length>24||typeof edit.sceneId!=='string'||typeof edit.layerId!=='string')throw new Error('协作修改记录不完整');ids.add(edit.id);const paths=new Set();for(const ch of edit.changes){if(!ch||!cleanPath(ch.path)||paths.has(ch.path)||!has(ch,'before')||!has(ch,'after')||!safeJSON(ch.after)||!safeJSON(ch.before)||!validMode(ch))throw new Error('协作修改包含不支持的字段或值');paths.add(ch.path);}}
 expireStaleEdits(project);
 c.revision=Number.isInteger(c.revision)&&c.revision>=0?c.revision:0;c.manual=c.manual.slice(-12).map(m=>({id:String(m.id||''),description:String(m.description||'手动调整').slice(0,220),sceneId:typeof m.sceneId==='string'?m.sceneId:null,layerId:typeof m.layerId==='string'?m.layerId:null,fields:Array.isArray(m.fields)?m.fields.filter(p=>typeof p==='string'&&cleanPath(p)).slice(0,20):[],revision:Number(m.revision)||0}));return project;
}

function resolveLayer(project,sceneId,layerId,time,{excludeEditId,bake=true}={}){
 const loc=targetLocation(project,sceneId,layerId);if(!loc)return null;const original=loc.layer,local=time-loc.start;let layer=original,transforms=[],motionEpoch=null,hasPose=false;
 for(const edit of project.collaboration?.edits||[]){if(edit.id===excludeEditId||edit.sceneId!==sceneId||edit.layerId!==layerId||edit.active===false||!validRange(edit.range,loc.scene,original)||!inRange(edit,local,original))continue;const changes=activeChanges(edit);if(!changes.length)continue;
  for(const change of changes){if(!validMode(change)||!validValue(ruleFor(original,change.path),change.after,project,loc.scene))continue;if(layer===original)layer={...original,params:{...original.params},motion:{...original.motion}};if(POSE.includes(change.path)){transforms.push(change);hasPose=true;}else write(layer,change.path,change.after);if(change.path.startsWith('motion.')){hasPose=true;if(change.path==='motion.kind'&&edit.range)motionEpoch=edit.range.start;}if(change.path==='path'||change.path==='keyframes')hasPose=true;}
 }
 if(bake&&layer!==original&&hasPose){const sampled={...layer};if(motionEpoch!==null)sampled.start=motionEpoch;const pose=getLayerPose(sampled,local);for(const change of transforms){const k=change.path;if(change.mode==='offset')pose[k]+=change.after-change.before;else if(change.mode==='multiply')pose[k]*=change.after/change.before;else pose[k]=change.after;const rule=ruleFor(original,k);pose[k]=clamp(pose[k],rule.min,rule.max);}layer={...layer,...pose,motion:{kind:'none',amount:0,speed:1},keyframes:[]};}
 return layer;
}
export function effectiveLayer(project,sceneId,layerId,time,options={}){return resolveLayer(project,sceneId,layerId,time,options);}
export function effectiveProject(project,time,{excludeEditId}={}){
 if(!project.collaboration?.edits?.some(e=>e.active!==false&&e.id!==excludeEditId))return project;
 let start=0,index=-1;for(let i=0;i<project.scenes.length;i++){if(time<start+project.scenes[i].duration||i===project.scenes.length-1){index=i;break;}start+=project.scenes[i].duration;}if(index<0)return project;const scene=project.scenes[index];let changed=false;
 const layers=scene.layers.map(l=>{const next=resolveLayer(project,scene.id,l.id,time,{excludeEditId});if(next!==l)changed=true;return next||l;});if(!changed)return project;const scenes=project.scenes.slice();scenes[index]={...scene,layers};return {...project,scenes};
}
function valueAt(project,sceneId,layerId,path,time){const loc=targetLocation(project,sceneId,layerId);if(!loc)return undefined;if(POSE.includes(path)){const layer=resolveLayer(project,sceneId,layerId,time);return getLayerPose(layer,time-loc.start)[path];}return read(resolveLayer(project,sceneId,layerId,time,{bake:false}),path);}

export function buildContext(project,{sceneId,layerId,time=0,range=null,frame}={}){
 const loc=sceneLocation(project,sceneId)||sceneLocation(project,project.scenes[0]?.id);if(!loc)return {revision:project.collaboration?.revision||0,layer:null,selectedLayer:null,controls:[],range:null,time};
 const raw=loc.scene.layers.find(l=>l.id===layerId)||null;const globalTime=finite(time)?time:loc.start,localTime=globalTime-loc.start;
 const selectedRange=range===undefined?null:copy(range),invalidRange=!!raw&&!validRange(selectedRange,loc.scene,raw),samplingRange=invalidRange?null:selectedRange;
 const lo=samplingRange?.start??raw?.start??0,hi=samplingRange?.end??raw?.end??loc.scene.duration,sampleLocal=localTime<lo||localTime>=hi?(lo+hi)/2:localTime,sampleTime=loc.start+sampleLocal;
 const resolved=raw?resolveLayer(project,loc.scene.id,raw.id,sampleTime,{bake:false}):null,baked=raw?resolveLayer(project,loc.scene.id,raw.id,sampleTime):null,pose=baked?getLayerPose(baked,sampleLocal):null;
 const layer=resolved?copy({...resolved,...pose}):null,controls=raw?copy(relevantControls(raw)):[];
 const ctx={version:1,revision:project.collaboration?.revision||0,project:{name:project.name,width:project.width,height:project.height,fps:project.fps},scene:{id:loc.scene.id,name:loc.scene.name,duration:loc.scene.duration,start:loc.start,background:loc.scene.background},sceneId:loc.scene.id,layerId:raw?.id||null,style:raw&&STYLE.get(raw.type)?{id:raw.type,name:STYLE.get(raw.type).name,description:STYLE.get(raw.type).description}:null,layer,selectedLayer:layer,pose:copy(pose),time:globalTime,globalTime,localTime,sampleTime,sampleLocalTime:sampleLocal,range:selectedRange,invalidRange,controls,parameterRules:raw?parameterRules(raw):{},canText:raw?canText(raw):false,locks:{layerLocked:!!raw?.locked},relatedLayers:loc.scene.layers.map(l=>({id:l.id,name:l.name,type:l.type,locked:!!l.locked,hidden:!!l.hidden,x:l.x,y:l.y,start:l.start,end:l.end})),assets:(project.assets||[]).map(a=>({id:a.id,name:a.name})),recentManual:copy((project.collaboration?.manual||[]).slice(-5)),audio:{hasAudio:!!project.audio,generatedSound:!!project.sound?.enabled,subtitleCount:project.subtitles?.length||0}};
 if(typeof frame==='string'&&/^data:image\/(png|jpeg|webp);base64,/.test(frame)&&frame.length<1500000)ctx.frame=frame;
 return ctx;
}
export function describeSelection(context){return context.layer?`${context.scene.name} · ${context.layer.name} · ${context.invalidRange?'范围待调整':context.range?`${context.range.start.toFixed(1)}–${context.range.end.toFixed(1)} 秒`:'整个对象'}`:'先选中一个对象';}

function expected(context,path){return norm(read(context.layer,path));}
function makePlan(text,ctx,changes,summary){return {instruction:text,summary,sceneId:ctx.sceneId,layerId:ctx.layerId,range:copy(ctx.range),referenceTime:ctx.sampleTime,referenceLocalTime:ctx.sampleLocalTime,baseRevision:ctx.revision,changes,source:'local'};}
function currentNumber(ctx,path,defaultValue){const v=read(ctx.layer,path);return finite(v)?v:defaultValue;}
function mentionedColor(text){const hex=text.match(/#[\da-f]{6}\b|#[\da-f]{3}\b/i);if(hex)return hex[0];const word=Object.keys(COLORS).sort((a,b)=>b.length-a.length).find(c=>text.includes(c));return word?COLORS[word]:null;}
function wholeLayer(ctx){return !ctx.range||Math.abs(ctx.range.start-ctx.layer.start)<.001&&Math.abs(ctx.range.end-ctx.layer.end)<.001;}
function splitInstruction(text){const result=[];let start=0,quote=null;const closes={'“':'”','「':'」','"':'"',"'":"'"};for(let i=0;i<text.length;i++){const ch=text[i];if(quote){if(ch===quote)quote=null;continue;}if(closes[ch]){quote=closes[ch];continue;}let length=0;if(/[，,；;]/.test(ch))length=1;else for(const connector of ['然后','并且','并','再'])if(text.startsWith(connector,i)){length=connector.length;break;}if(length){const part=text.slice(start,i).trim();if(part)result.push(part);i+=length-1;start=i+1;}}const last=text.slice(start).trim();if(last)result.push(last);return result;}
function constraintClause(text){return /^(?:请)?(?:保留|保持).*(?:位置|构图|其他|原样|路径)|^(?:位置|构图|其他(?:对象|画面|部分)?|Logo)(?:保持不变|不要动|别动|不动|不变|保持)[。！!]*$/i.test(text);}
function inspection(ctx){if(!ctx.layer)return `当前镜头“${ctx.scene?.name||''}”有 ${ctx.relatedLayers?.length||0} 个对象。选中对象后，可检查位置、可见性和动作设置。`;const l=ctx.layer,notes=[];if(l.locked)notes.push('对象已锁定，修改前需先解锁');if(l.hidden)notes.push('对象当前被隐藏');if(l.x<0||l.x>1||l.y<0||l.y>1)notes.push('对象中心位于画幅之外');if(l.opacity<.08)notes.push('不透明度很低，画面中可能难以看清');if(ctx.localTime<l.start||ctx.localTime>l.end)notes.push('当前播放时间不在对象的显示区间内');if(l.motion?.kind==='path'&&!l.path?.length)notes.push('已选择沿路径运动，但还没有路径点');return notes.length?notes.join('；')+'。':`“${l.name}”的中心位于画幅内，显示区间为 ${l.start.toFixed(1)}–${l.end.toFixed(1)} 秒。当前本地检查未发现这些设置项中的问题；画面美感和叙事判断需接入模型。`;}
export function suggestionsFor(context){
 if(context?.invalidRange)return [];if(!context?.layer)return [{label:'检查当前镜头',instruction:'检查当前镜头'}];if(context.layer.locked)return [{label:'检查当前对象',instruction:'检查当前对象'}];
 const result=[{label:'放大一点',instruction:'放大15%'}];const colorControl=(context.controls||[]).find(c=>c.type==='color');if(colorControl)result.push({label:'换成蓝色',instruction:`${colorControl.label}改成蓝色`});else if(context.parameterRules?.color)result.push({label:'换成蓝色',instruction:'颜色改成蓝色'});else result.push({label:'淡入出现',instruction:'淡入1秒'});
 if(wholeLayer(context)&&(context.layer.motion?.kind!=='none'||(context.controls||[]).some(c=>c.key==='speed')))result.push({label:'慢一点',instruction:'动作慢一点'});else result.push(context.layer.motion?.kind==='pulse'?{label:'淡入出现',instruction:'淡入1秒'}:{label:'轻微呼吸',instruction:'加一点呼吸感'});
 return result.slice(0,3);
}

export function planLocalEdit(instruction,context){
 const text=String(instruction||'').trim().slice(0,2000),ctx=context||{};
 if(!text)return error('EMPTY','请描述希望怎样调整当前对象。',{suggestions:suggestionsFor(ctx)});
 if(/^(?:请|帮我|麻烦)?\s*(?:检查|看看|查看)(?:一下)?(?:当前)?(?:对象|镜头|画面|设置)?[。？?！!]*$/.test(text))return {kind:'info',readOnly:true,message:inspection(ctx),summary:'检查当前设置',changes:[],source:'local'};
 if(!ctx.layer)return error('NO_SELECTION','请先在画布或图层列表里选中要修改的对象。',{suggestions:suggestionsFor(ctx)});
 if(ctx.invalidRange)return error('INVALID_RANGE','当前自定义时间范围无效。请将范围设在对象显示区间内，当前作品没有被修改。');
 if(ctx.layer.locked||ctx.locks?.layerLocked)return error('LOCKED','当前对象已锁定。解锁后再应用指令，其他对象不会受影响。');
 const clauses=splitInstruction(text);if(clauses.length>1){const combined=[],summaries=[],paths=new Set();for(const clause of clauses){if(constraintClause(clause))continue;const piece=planLocalEdit(clause,ctx);if(piece.error||piece.readOnly||!piece.changes?.length)return error(piece.error==='INVALID_RANGE'?'INVALID_RANGE':'UNSUPPORTED_COMPOSITE',`这条组合指令没有执行：${piece.message||'请将检查与修改分开发送。'}`,{suggestions:suggestionsFor(ctx)});for(const ch of piece.changes){if(paths.has(ch.path))return error('UNSUPPORTED_COMPOSITE','这条组合指令多次调整同一个属性，请拆成两次明确修改。');paths.add(ch.path);combined.push(ch);}summaries.push(piece.summary);}if(combined.length)return makePlan(text,ctx,combined,summaries.join('；'));}
 // Negated/action-combining language is not guessed by this offline grammar.
 const operationText=text.replace(/“[^”]*”|「[^」]*」|"[^"]*"|'[^']*'/g,'引用内容').replace(/(?:位置|构图|其他(?:对象|画面|部分)?)(?:保持不变|不要动|别动|不动|不变|保持)/g,'');
 if(/不要|禁止|别(?:把|给|让|再|改|动|放|缩|旋)|取消.*(?:修改|动作)/.test(operationText))return error('UNSUPPORTED','这句包含否定或取消条件。本地模式不会猜测，可使用修改记录中的撤销，或改成明确的正向调整指令。',{suggestions:suggestionsFor(ctx)});
 if(/删除|移除|复制|创建|新增|重新生成|换一(?:个|张)|替换(?:图片|素材)/.test(operationText)&&!/(?:文字|文案|字幕|内容)(?:设置为|设为|改成|改为|换成|写成)/.test(operationText))return error('UNSUPPORTED','本地指令暂不执行新增、删除或替换素材等组合操作。请使用编辑器对应工具，或接入模型后处理。',{suggestions:suggestionsFor(ctx)});
 if(/绕开|绕过|避开|躲开|环绕|穿过|更自然|平滑|华尔兹|奔跑|走路|自动运镜|重新设计/.test(operationText))return error('UNSUPPORTED','这句需要模型理解路径、动作或空间关系，本地模式不会只执行其中一部分。可以先手动画路径，或接入豆包模型后处理。',{suggestions:suggestionsFor(ctx)});
 const changes=[],descriptions=[],touched=new Set();
 function add(path,after,label){if(touched.has(path))return;const before=expected(ctx,path);if(equal(before,after))return;touched.add(path);const mode=path==='scale'&&finite(before)&&before!==0?'multiply':['x','y','rotation'].includes(path)?'offset':undefined;changes.push({path,before,after,...(mode?{mode}:{})});descriptions.push(label);}
 const holdsPosition=/保留.*(?:位置|构图)|位置(?:保持|不变|不要动|别动|不动)|保持.*(?:位置|构图)/.test(text);
 let m;
 if(!holdsPosition){
  if((m=text.match(/(?:位置|坐标).{0,8}[xX]\s*[=:：]?\s*(-?\d+(?:\.\d+)?)\s*%?\s*[,，、 ]+\s*[yY]\s*[=:：]?\s*(-?\d+(?:\.\d+)?)\s*%?/))){add('x',clamp(+m[1]/100,-1,2),'调整横向位置');add('y',clamp(+m[2]/100,-1,2),'调整纵向位置');}
  for(const [word,path,sign] of [['右','x',1],['左','x',-1],['下','y',1],['上','y',-1]]){const re=new RegExp(`(?:向|往)${word}(?:边|侧)?(?:移动|挪动|挪|移)?(?:一点|一些|点)?\\s*(\\d+(?:\\.\\d+)?)?\\s*(%|％|像素|px)?`,'i');if((m=text.match(re))){let step=m[1]?+m[1]:5;step=m[2]==='像素'||m[2]?.toLowerCase()==='px'?step/(path==='x'?ctx.project.width:ctx.project.height):step/100;add(path,clamp(currentNumber(ctx,path,.5)+sign*step,-1,2),`向${word}移动`);}}
  if(/(?:放到|移到|放在|移动到).{0,3}(?:正中|中间|居中)|^居中/.test(text)){add('x',.5,'水平居中');add('y',.5,'垂直居中');}
  else if((m=text.match(/(?:放到|移到|放在|移动到).{0,3}(左上|右上|左下|右下|左侧|右侧|上方|下方)/))){if(m[1].includes('左'))add('x',.25,'移到左侧');if(m[1].includes('右'))add('x',.75,'移到右侧');if(m[1].includes('上'))add('y',.25,'移到上方');if(m[1].includes('下'))add('y',.75,'移到下方');}
 }
 if((m=text.match(/(?:缩放|大小)(?:设置为|设为|改成|改为|调整到|到)\s*(\d+(?:\.\d+)?)\s*[%％]/)))add('scale',clamp(+m[1]/100,.05,5),'调整大小');
 else if((m=text.match(/(放大|缩小|大一点|小一点)(?:到)?\s*(\d+(?:\.\d+)?)?\s*([%％])?/))){const down=/缩小|小一点/.test(m[1]),amount=m[2]?+m[2]/100:.15,target=m[0].includes('到')&&m[2]?amount:currentNumber(ctx,'scale',1)*(1+(down?-1:1)*amount);add('scale',clamp(target,.05,5),down?'缩小对象':'放大对象');}
 if((m=text.match(/(逆时针|顺时针)?\s*(?:旋转|转动)(到|为|成)?\s*(-?\d+(?:\.\d+)?)\s*(?:度|°)?/))){const angle=+m[3]*(m[1]==='逆时针'?-1:1);add('rotation',clamp(m[2]?angle:currentNumber(ctx,'rotation',0)+angle,-720,720),'调整旋转');}
 if((m=text.match(/(?:不透明度|透明度)(?:设置为|设为|改成|改为|调整到|到|为)?\s*(\d+(?:\.\d+)?)\s*[%％]?/)))add('opacity',clamp(+m[1]/100,0,1),'调整不透明度');
 else if(/半透明/.test(text))add('opacity',.5,'调整为半透明');
 else if(/更透明|透明一点/.test(text))add('opacity',Math.max(.05,currentNumber(ctx,'opacity',1)*.8),'降低不透明度');
 if(/淡入|渐渐出现|逐渐出现/.test(text)){const dur=text.match(/(?:淡入|出现)(?:用|时长)?\s*(\d+(?:\.\d+)?)\s*秒/);add('motion.kind','reveal','加入淡入');add('motion.speed',clamp(dur?1/+dur[1]:1,.05,4),'调整淡入速度');}
 else if(/呼吸|脉动/.test(text)){add('motion.kind','pulse','加入呼吸缩放');add('motion.amount',.08,'轻微缩放幅度');}
 else if(/漂浮|飘动/.test(text)){add('motion.kind','float','加入漂浮');add('motion.amount',.12,'轻微漂浮幅度');}
 else if(/弹跳|跳动/.test(text)){add('motion.kind','bounce','加入弹跳');add('motion.amount',.1,'轻微弹跳幅度');}
 else if(/保持静止|停止运动|去掉动作/.test(text))add('motion.kind','none','停止附加动作');
 const slow=/慢一点|慢一些|减慢|放慢|慢一倍|速度减半/.test(text),fast=/快一点|快一些|加快|加速|速度翻倍/.test(text);
 if(slow||fast){if(!wholeLayer(ctx))return error('WHOLE_LAYER_REQUIRED','本地速度调整作用于整个对象，请将范围切换为“整个对象”。当前选区没有被修改。');let speedPath=null;if(ctx.layer.motion?.kind&&ctx.layer.motion.kind!=='none')speedPath='motion.speed';else if((ctx.controls||[]).some(c=>c.key==='speed'))speedPath='params.speed';else if(ctx.layer.type==='object3d')speedPath='params.turnSpeed';if(!speedPath)return error('NO_SPEED_CONTROL','当前部件没有可单独调整的速度。可选择运动中的对象，或先加入漂浮、呼吸、路径等动作。',{suggestions:suggestionsFor(ctx)});const old=currentNumber(ctx,speedPath,speedPath==='params.turnSpeed'?18:1),factor=/一倍|减半|翻倍/.test(text)?(slow?.5:2):(slow?.7:1.3),rule=speedPath.startsWith('params.')?ctx.parameterRules?.[speedPath.slice(7)]:numeric(.05,4);add(speedPath,clamp(old*factor,rule?.min??.05,rule?.max??4),slow?'放慢动作':'加快动作');}
 const textRequest=text.match(/(?:文字|文案|字幕|内容)(?:设置为|设为|改成|改为|换成|写成)\s*(.+)$/),payload=textRequest?.[1]?.trim().replace(/[。！!]$/,''),quotedPayload=payload&&/^[“「"']/.test(payload),colorOnlyText=!!payload&&!quotedPayload&&(has(COLORS,payload)||/^#(?:[a-f0-9]{3}|[a-f0-9]{6})$/i.test(payload));
 const explicitColor=(ctx.controls||[]).find(c=>c.type==='color'&&text.includes(c.label)),colorWord=text.match(/颜色|配色/),isTextChange=!!textRequest;const colorTail=explicitColor?text.slice(text.indexOf(explicitColor.label)+explicitColor.label.length):colorWord?text.slice(colorWord.index+colorWord[0].length):text;const colorValue=colorOnlyText?mentionedColor(payload):(!isTextChange||explicitColor||colorWord)?mentionedColor(colorTail):null;if(colorValue&&/(?:颜色|配色|改成|改为|换成|色)/.test(text)){let selected=explicitColor;if(!selected)selected=(ctx.controls||[]).find(c=>c.type==='color'&&c.key==='color')||(ctx.controls||[]).find(c=>c.type==='color');const key=selected?.key||(ctx.parameterRules?.color?'color':null);if(/背景/.test(text)&&!ctx.layer.name.match(/背景|环境|纸|天空|地块|摄影台/))return error('TARGET_MISMATCH','这次选择的是对象部件。修改整段背景请使用场景设置，或先选中背景图层。');if(key)add('params.'+key,colorValue,'调整'+(selected?.label||'颜色'));}
 if(!colorOnlyText&&(m=text.match(/(?:文字|文案|字幕|内容)(?:设置为|设为|改成|改为|换成|写成)\s*[“「"']?([^，,。；;”」"']+)[”」"']?/))){if(!ctx.canText)return error('NO_TEXT_CONTROL','当前选中部件没有可编辑文字。请选中文字或字幕图层。');add('params.text',m[1].trim().slice(0,4000),'更新文字');}
 for(const c of ctx.controls||[]){if(!text.includes(c.label))continue;const escaped=c.label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');if(c.type==='range'&&(m=text.match(new RegExp(escaped+'(?:设置为|设为|改成|改为|调整到|到|为)\\s*(-?\\d+(?:\\.\\d+)?)'))))add('params.'+c.key,clamp(+m[1],c.min,c.max),'调整'+c.label);if(c.type==='select'){const chosen=(c.options||[]).find(o=>text.includes(String(o.label??o.value??o)));if(chosen)add('params.'+c.key,chosen.value??chosen,'调整'+c.label);}}
 if(!changes.length)return error('UNSUPPORTED','这句还需要模型理解。本地模式可以执行明确的移动、缩放、旋转、颜色、透明度、文字或基础动作指令。请试试下面的操作。',{suggestions:suggestionsFor(ctx)});
 return makePlan(text,ctx,changes,descriptions.join('；'));
}

export function applyPlan(project,plan,{source}={}){
 if(plan?.readOnly||plan?.kind==='info')return {project,edit:null,message:String(plan.message||plan.summary||'')};
 if(!plan||!Array.isArray(plan.changes)||!plan.changes.length||plan.changes.length>24)return error('INVALID_PLAN','没有收到有效的对象修改方案。');
 const loc=targetLocation(project,plan.sceneId,plan.layerId);if(!loc)return error('TARGET_REMOVED','原来选中的对象已不存在，请重新选择。');if(loc.layer.locked)return error('LOCKED','该对象已被锁定，本次修改没有应用。');
 if(!validRange(plan.range,loc.scene,loc.layer))return error('INVALID_RANGE','修改范围已超出当前对象或镜头，请重新选择时间段。');
 const range=plan.range??null,lo=range?.start??loc.layer.start,hi=range?.end??loc.layer.end;
 const referenceTime=finite(plan.referenceLocalTime)?loc.start+plan.referenceLocalTime:finite(plan.referenceTime)?plan.referenceTime:loc.start+(lo+hi)/2;
 if(referenceTime<loc.start+lo-.001||referenceTime>loc.start+hi+.001)return error('INVALID_TIME','修改方案引用的时间不在当前范围内。');
 const seen=new Set(),changes=[];for(const c of plan.changes){if(!c||seen.has(c.path)||!has(c,'before')||!has(c,'after')||!safeJSON(c.before)||!validMode(c)||!validValue(ruleFor(loc.layer,c.path),c.after,project,loc.scene))return error('INVALID_CHANGE','修改方案包含不支持的字段或参数值，没有应用。');seen.add(c.path);const actual=valueAt(project,loc.scene.id,loc.layer.id,c.path,referenceTime);if(!equal(actual,c.before))return error('CONFLICT','这个属性在请求之后已经被修改。本次方案没有覆盖新内容，请基于当前画面重新发送。',{conflicts:[c.path]});changes.push({path:c.path,before:copy(norm(c.before)),after:copy(c.after),...(c.mode?{mode:c.mode}:{})});}
 const next=copy(project),collab=ensureCollaboration(next);expireStaleEdits(next);if(collab.edits.length>=LIMIT)collab.edits=collab.edits.filter(e=>e.active!==false&&activeChanges(e).length);if(collab.edits.length>=LIMIT)return error('HISTORY_LIMIT','当前有 120 条仍生效的协作调整。请先在修改记录中撤销不再需要的调整，再继续添加。');
 const edit={id:uid(),source:source==='doubao'||plan.source==='doubao'?'doubao':'local',instruction:String(plan.instruction||'').slice(0,2000),summary:String(plan.summary||'调整当前对象').slice(0,400),sceneId:loc.scene.id,layerId:loc.layer.id,range:copy(range),referenceTime,referenceLocalTime:referenceTime-loc.start,changes,active:true,baseRevision:Number.isInteger(plan.baseRevision)?plan.baseRevision:collab.revision,createdAt:new Date().toISOString()};
 collab.edits.push(edit);collab.revision++;return {project:next,edit};
}

function overlaps(a,b){if(a===b)return true;if(a==='keyframes'&&(POSE.includes(b)||b==='keyframes'))return true;if(b==='keyframes'&&(POSE.includes(a)||a==='keyframes'))return true;if(a==='path'&&['x','y','path'].includes(b)||b==='path'&&['x','y','path'].includes(a))return true;return a.startsWith(b+'.')||b.startsWith(a+'.');}
export function clearFieldOverrides(project,sceneId,layerId,paths){let count=0;const safe=(paths||[]).filter(cleanPath);for(const edit of project.collaboration?.edits||[]){if(edit.active===false||edit.sceneId!==sceneId||edit.layerId!==layerId)continue;for(const change of edit.changes||[]){if(!change.disabled&&safe.some(p=>overlaps(p,change.path))){change.disabled=true;change.status='superseded-by-hand';count++;}}if(!activeChanges(edit).length){edit.active=false;edit.status='superseded-by-hand';}}return {count};}
function changedPaths(a,b){const out=[];for(const k of new Set([...Object.keys(a||{}),...Object.keys(b||{})])){if(k==='id')continue;if(['params','motion'].includes(k)){for(const f of new Set([...Object.keys(a?.[k]||{}),...Object.keys(b?.[k]||{})]))if(!equal(a?.[k]?.[f],b?.[k]?.[f]))out.push(k+'.'+f);}else if(!equal(a?.[k],b?.[k]))out.push(k);}return out;}
export function recordManualChange(project,beforeProject,description='手动调整',{explicitFields={}}={}){
 const before=beforeProject?.scenes||[],changes=[];
 for(const scene of project.scenes||[]){const prev=before.find(s=>s.id===scene.id);if(!prev){changes.push({sceneId:scene.id,layerId:null,fields:['scene'],name:scene.name});continue;}for(const layer of scene.layers){const old=prev.layers.find(l=>l.id===layer.id);const actualFields=old?changedPaths(old,layer):['layer'],fields=Array.isArray(explicitFields[layer.id])?explicitFields[layer.id].filter(cleanPath):actualFields;if(actualFields.length){clearFieldOverrides(project,scene.id,layer.id,fields);changes.push({sceneId:scene.id,layerId:layer.id,fields,name:layer.name});}}for(const old of prev.layers){if(!scene.layers.some(l=>l.id===old.id)){for(const edit of project.collaboration?.edits||[])if(edit.sceneId===scene.id&&edit.layerId===old.id&&edit.active!==false){edit.active=false;edit.status='target-removed';}changes.push({sceneId:scene.id,layerId:old.id,fields:['layer'],name:old.name});}}if(['name','duration','background'].some(k=>!equal(prev[k],scene[k])))changes.push({sceneId:scene.id,layerId:null,fields:['scene'],name:scene.name});}
 for(const old of before)if(!project.scenes.some(s=>s.id===old.id)){for(const edit of project.collaboration?.edits||[])if(edit.sceneId===old.id){edit.active=false;edit.status='target-removed';}changes.push({sceneId:old.id,layerId:null,fields:['scene'],name:old.name});}
 const otherKeys=['name','width','height','fps','audio','sound','subtitles','assets'];if(otherKeys.some(k=>!equal(project[k],beforeProject?.[k])))changes.push({sceneId:null,layerId:null,fields:['project'],name:'作品设置'});
 for(const edit of project.collaboration?.edits||[]){const previous=beforeProject?.collaboration?.edits?.find(e=>e.id===edit.id);if(!previous)continue;const fields=(edit.changes||[]).filter(ch=>ch.disabled&&ch.status==='superseded-by-hand'&&!previous.changes?.find(p=>p.path===ch.path)?.disabled).map(ch=>ch.path);if(fields.length&&!changes.some(c=>c.sceneId===edit.sceneId&&c.layerId===edit.layerId)){const layer=targetLocation(project,edit.sceneId,edit.layerId)?.layer;changes.push({sceneId:edit.sceneId,layerId:edit.layerId,fields,name:layer?.name||'对象'});}}
 expireStaleEdits(project);if(!changes.length)return project;const c=ensureCollaboration(project);c.revision++;const first=changes[0];c.manual.push({id:uid(),description:`${String(description).slice(0,120)} · ${first.name}${changes.length>1?` 等 ${changes.length} 项`:''}`,sceneId:first.sceneId,layerId:first.layerId,fields:first.fields.slice(0,20),revision:c.revision});c.manual=c.manual.slice(-12);return project;
}
export function undoEdit(project,id){const target=project.collaboration?.edits?.find(e=>e.id===id);if(!target)return error('NOT_FOUND','这条修改记录已不存在。');if(target.active===false)return error('INACTIVE','这条修改已经撤销或由后续手动编辑接管。');const next=copy(project),c=ensureCollaboration(next),edit=c.edits.find(e=>e.id===id);edit.active=false;edit.status='undone';c.revision++;return {project:next,edit};}
