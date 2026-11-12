import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
const COOKIE='workbench_owner',TTL=8*60*60;
const equal=(a,b)=>timingSafeEqual(createHash('sha256').update(String(a)).digest(),createHash('sha256').update(String(b)).digest());
export function publicOrigin(env){
 const value=env.PUBLIC_ORIGIN||env.RENDER_EXTERNAL_URL||(env.RENDER_EXTERNAL_HOSTNAME?`https://${env.RENDER_EXTERNAL_HOSTNAME}`:'');
 if(!value)return null;try{const u=new URL(value);if(u.username||u.password||u.search||u.hash||u.pathname!=='/')return null;if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname)))return null;return u.origin;}catch{return null;}
}
export function requestAllowed(req,env,{api=false}={}){
 let host;try{host=new URL(`http://${req.headers.host||''}`);}catch{return false;}
 if(host.username||host.password||host.pathname!=='/'||host.search||host.hash)return false;
 const origin=publicOrigin(env),local=['127.0.0.1','localhost'].includes(host.hostname);
 if(!local&&(!origin||new URL(origin).host!==host.host))return false;
 const expected=local?host.origin:origin;
 if(req.headers.origin!==undefined&&req.headers.origin!==expected)return false;
 if(api&&req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site']))return false;
 return true;
}
export function ownerConfigured(env){return typeof env.WORKBENCH_OWNER_PASSWORD==='string'&&env.WORKBENCH_OWNER_PASSWORD.length>=16;}
export function passwordValid(input,env){return ownerConfigured(env)&&typeof input==='string'&&input.length<=2048&&equal(input,env.WORKBENCH_OWNER_PASSWORD);}
function signingKey(env){return createHash('sha256').update('animation-workbench-owner-session\0').update(env.WORKBENCH_OWNER_PASSWORD||'').digest();}
function signature(payload,env){return createHmac('sha256',signingKey(env)).update(payload).digest('base64url');}
export function ownerSession(req,env,now=Date.now()){
 if(!ownerConfigured(env))return false;
 const value=String(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 if(!value||value.length>512)return false;const pieces=value.split('.');if(pieces.length!==2||!equal(pieces[1],signature(pieces[0],env)))return false;
 try{const data=JSON.parse(Buffer.from(pieces[0],'base64url').toString());return data.v===1&&Number.isFinite(data.exp)&&data.exp>now&&data.exp<=now+(TTL+1)*1000&&typeof data.nonce==='string';}catch{return false;}
}
function cookieSuffix(req,env){return `Path=/; HttpOnly; SameSite=Lax${publicOrigin(env)?.startsWith('https:')?'; Secure':''}`;}
export function loginCookie(req,env,now=Date.now()){
 const payload=Buffer.from(JSON.stringify({v:1,exp:now+TTL*1000,nonce:randomBytes(16).toString('hex')})).toString('base64url');
 return `${COOKIE}=${payload}.${signature(payload,env)}; Max-Age=${TTL}; ${cookieSuffix(req,env)}`;
}
export function logoutCookie(req,env){return `${COOKIE}=; Max-Age=0; ${cookieSuffix(req,env)}`;}
export function loginPage({authenticated=false,configured=false,error=false}={}){
 const body=authenticated?'<h1>所有者已登录</h1><p>可以返回编辑器使用模型。模型密钥继续保存在服务端。</p><a class="primary" href="/">返回动画工作台</a><form action="/api/session/logout" method="post"><button>退出模型访问</button></form>':`<h1>所有者模型登录</h1><p>编辑器向所有访客开放。只有工作台所有者登录后，才能使用服务端模型。</p>${configured?`<form action="/api/session" method="post"><label for="password">所有者访问密码</label><input id="password" name="password" type="password" autocomplete="current-password" maxlength="2048" required>${error?'<p class="error" role="alert">密码不正确，请重试。</p>':''}<button class="primary">登录模型功能</button></form>`:'<p class="error">部署者尚未设置 WORKBENCH_OWNER_PASSWORD（至少 16 个字符）。公开编辑器仍可使用。</p>'}<a href="/">返回公开编辑器</a>`;
 return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>模型访问 · 动画工作台</title><style>body{font:15px/1.7 system-ui,sans-serif;margin:0;background:#f6f8fc;color:#253044;display:grid;min-height:100vh;place-items:center}main{box-sizing:border-box;width:min(480px,calc(100% - 32px));background:white;border:1px solid #e3e9f3;border-radius:16px;padding:32px}h1{font-size:24px;margin:0 0 15px}p{color:#67758a}label{display:block;margin:18px 0 8px}input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #cbd6e7;border-radius:8px;font:inherit}button,a.primary{display:block;text-align:center;border:0;border-radius:8px;background:#eef3fa;color:#364860;padding:11px 15px;font:inherit;margin:18px 0;text-decoration:none;cursor:pointer}button.primary,a.primary{background:#2677ff;color:white;width:100%;box-sizing:border-box}a{color:#2677ff}.error{color:#a3473e;font-size:13px}</style></head><body><main>${body}</main></body></html>`;
}
