export interface InjectBubbleOptions {
  packageId: string
  metaUrl: string
  /** Omit to leave the chat bubble out entirely — the script then never mounts it. */
  chat?: ChatOptions
}

export interface ChatOptions {
  /** Base of the agent proxy routes, e.g. `/api/pub/<id>/agent`. */
  base: string
  /** Dist-relative path of the page being read, e.g. `docs/page1.html`. */
  path: string
  /** What to call this page in the panel header. */
  title: string
  /**
   * `authz` when the server already knows who this is; `self-declared` when the
   * caller signed in with the shared secret and has to name themselves before their
   * conversation can be told apart from a colleague's.
   */
  identity: 'authz' | 'self-declared'
}

const STYLE = `<style id="az-pb-style">
#az-pb-root{position:fixed;right:1rem;bottom:1rem;z-index:2147483647;display:flex;align-items:flex-end;gap:8px;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;color:#e2e8f0;color-scheme:dark}
#az-pb-root,.az-pb-bubble,.az-pb-panel,.az-pb-modal,.az-pb-chat,#az-pb-root *,.az-pb-bubble *,.az-pb-panel *,.az-pb-modal *,.az-pb-chat *{box-sizing:border-box}
.az-pb-slot{position:relative}
.az-pb-bubble{position:relative;display:flex;align-items:center;justify-content:center;width:44px;height:44px;padding:0;border-radius:9999px;background:#312e81;border:1px solid #4338ca;color:#e0e7ff;cursor:pointer;box-shadow:0 6px 16px rgba(0,0,0,.45),0 0 0 1px rgba(99,102,241,.25);transition:transform 120ms ease,background 120ms ease}
.az-pb-bubble:hover{background:#3730a3;transform:scale(1.05)}
.az-pb-bubble:focus-visible{outline:2px solid #818cf8;outline-offset:2px}
.az-pb-bubble svg{display:block}
.az-pb-bubble__close{position:absolute;top:-6px;right:-6px;width:18px;height:18px;padding:0;border-radius:9999px;background:#0f172a;border:1px solid #475569;color:#cbd5e1;font-size:13px;line-height:16px;display:flex;align-items:center;justify-content:center;cursor:pointer}
.az-pb-bubble__close:hover{background:#1e293b;color:#f1f5f9}
.az-pb-bubble__close:focus-visible{outline:2px solid #818cf8;outline-offset:1px}
.az-pb-panel{position:absolute;right:0;bottom:54px;width:280px;max-width:calc(100vw - 2rem);background:#0f172a;border:1px solid #334155;border-radius:12px;padding:14px;color:#e2e8f0;font-size:13px;line-height:1.45;box-shadow:0 12px 32px rgba(0,0,0,.55);display:flex;flex-direction:column;gap:10px}
.az-pb-panel[hidden]{display:none}
.az-pb-panel__eyebrow{margin:0;font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.06em}
.az-pb-panel__title{margin:2px 0 0;font-size:13px;font-weight:600;color:#f1f5f9;word-break:break-word}
.az-pb-panel__row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:#1e293b;border:1px solid #334155;border-radius:8px}
.az-pb-panel__row-label{color:#94a3b8;font-size:12px}
.az-pb-panel__row-value{color:#f1f5f9;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums}
.az-pb-btn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:8px 12px;border-radius:8px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;border:1px solid transparent;transition:background 120ms ease,border-color 120ms ease,color 120ms ease}
.az-pb-btn:focus-visible{outline:2px solid #818cf8;outline-offset:1px}
.az-pb-btn:disabled{opacity:.55;cursor:not-allowed}
.az-pb-btn--primary{background:#4f46e5;border-color:#4f46e5;color:#fff}
.az-pb-btn--primary:hover:not(:disabled){background:#4338ca;border-color:#4338ca}
.az-pb-btn--ghost{background:transparent;border-color:#334155;color:#cbd5e1}
.az-pb-btn--ghost:hover:not(:disabled){background:#1e293b;border-color:#475569;color:#f1f5f9}
.az-pb-btn--flash{background:#065f46 !important;border-color:#065f46 !important;color:#d1fae5 !important}
.az-pb-panel__error{margin:0;font-size:12px;color:#f87171}
.az-pb-modal{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(2,6,23,.72);font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;color:#e2e8f0;color-scheme:dark}
.az-pb-modal[hidden]{display:none}
.az-pb-modal__dialog{display:flex;flex-direction:column;width:100%;max-width:480px;max-height:80vh;background:#0f172a;border:1px solid #334155;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.6);overflow:hidden}
.az-pb-modal__header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px;border-bottom:1px solid #334155}
.az-pb-modal__eyebrow{margin:0 0 3px;color:#64748b;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em}
.az-pb-modal__title{margin:0;color:#f1f5f9;font-size:16px;font-weight:600;line-height:1.3;word-break:break-word}
.az-pb-modal__count{margin:4px 0 0;color:#94a3b8;font-size:12px}
.az-pb-modal__close{display:flex;align-items:center;justify-content:center;flex:0 0 auto;width:28px;height:28px;padding:0;border:1px solid #475569;border-radius:7px;background:transparent;color:#cbd5e1;font:inherit;font-size:18px;line-height:1;cursor:pointer}
.az-pb-modal__close:hover{background:#1e293b;color:#f1f5f9}
.az-pb-modal__close:focus-visible{outline:2px solid #818cf8;outline-offset:1px}
.az-pb-modal__list{margin:0;padding:8px;overflow-y:auto;list-style:none}
.az-pb-modal__file{display:flex;align-items:flex-start;gap:8px;width:100%;padding:9px 10px;border-radius:7px;color:#cbd5e1;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.4;text-decoration:none;word-break:break-all}
.az-pb-modal__file svg{flex:0 0 auto;margin-top:1px}
.az-pb-modal__file:hover{background:#1e293b;color:#f1f5f9}
.az-pb-modal__file:focus-visible{outline:2px solid #818cf8;outline-offset:-1px}
.az-pb-modal__empty{margin:0;padding:20px 10px;color:#94a3b8;font-size:13px;text-align:center}
.az-pb-chat{position:absolute;right:0;bottom:54px;display:flex;flex-direction:column;width:min(380px,calc(100vw - 2rem));height:min(70vh,520px);background:#0f172a;border:1px solid #334155;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.55);overflow:hidden}
.az-pb-chat[hidden]{display:none}
.az-pb-chat__header{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:12px 14px;border-bottom:1px solid #334155;flex:0 0 auto}
.az-pb-chat__eyebrow{margin:0;font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.06em}
.az-pb-chat__title{margin:2px 0 0;font-size:13px;font-weight:600;color:#f1f5f9;word-break:break-word}
.az-pb-chat__log{flex:1 1 auto;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:10px}
.az-pb-chat__msg{max-width:88%;padding:8px 11px;border-radius:10px;font-size:13px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
.az-pb-chat__msg--user{align-self:flex-end;background:#4f46e5;color:#fff;border-bottom-right-radius:3px}
.az-pb-chat__msg--agent{align-self:flex-start;background:#1e293b;border:1px solid #334155;color:#e2e8f0;border-bottom-left-radius:3px}
.az-pb-chat__msg--error{align-self:stretch;max-width:100%;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);color:#f87171;font-size:12px}
.az-pb-chat__msg pre{margin:6px 0 0;padding:8px;background:#020617;border:1px solid #334155;border-radius:6px;overflow-x:auto}
.az-pb-chat__msg pre code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;white-space:pre}
.az-pb-chat__empty{margin:auto;padding:0 8px;color:#94a3b8;font-size:12px;text-align:center;line-height:1.5}
.az-pb-chat__status{flex:0 0 auto;display:flex;align-items:center;gap:7px;padding:0 14px 8px;color:#94a3b8;font-size:12px}
.az-pb-chat__status[hidden]{display:none}
.az-pb-chat__dots{display:inline-flex;gap:3px}
.az-pb-chat__dots i{width:5px;height:5px;border-radius:9999px;background:#818cf8;animation:az-pb-pulse 1.2s ease-in-out infinite}
.az-pb-chat__dots i:nth-child(2){animation-delay:.15s}
.az-pb-chat__dots i:nth-child(3){animation-delay:.3s}
@keyframes az-pb-pulse{0%,60%,100%{opacity:.25}30%{opacity:1}}
.az-pb-chat__form[hidden]{display:none}
.az-pb-chat__form{flex:0 0 auto;display:flex;gap:7px;align-items:flex-end;padding:10px 12px;border-top:1px solid #334155}
.az-pb-chat__input{flex:1 1 auto;min-height:36px;max-height:110px;padding:8px 10px;resize:none;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#f1f5f9;font:inherit;font-size:13px;line-height:1.4}
.az-pb-chat__input::placeholder{color:#64748b}
.az-pb-chat__input:focus{outline:2px solid #818cf8;outline-offset:-1px}
.az-pb-chat__send{flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:36px;height:36px;padding:0;border-radius:8px;background:#4f46e5;border:1px solid #4f46e5;color:#fff;cursor:pointer}
.az-pb-chat__send:hover:not(:disabled){background:#4338ca}
.az-pb-chat__send:disabled{opacity:.5;cursor:not-allowed}
.az-pb-chat__send:focus-visible{outline:2px solid #818cf8;outline-offset:1px}
.az-pb-chat__intro{padding:14px;color:#cbd5e1;font-size:12px;line-height:1.5}
.az-pb-chat__intro p{margin:0 0 10px}
@media (prefers-color-scheme:light){
.az-pb-chat{background:#fff;border-color:#e2e8f0;box-shadow:0 12px 32px rgba(15,23,42,.18)}
.az-pb-chat__header,.az-pb-chat__form{border-color:#e2e8f0}
.az-pb-chat__title{color:#0f172a}
.az-pb-chat__msg--agent{background:#f8fafc;border-color:#e2e8f0;color:#0f172a}
.az-pb-chat__msg pre{background:#f1f5f9;border-color:#e2e8f0}
.az-pb-chat__input{background:#fff;border-color:#cbd5e1;color:#0f172a}
.az-pb-chat__intro{color:#475569}
}
@media (prefers-color-scheme:light){
.az-pb-panel{background:#ffffff;border-color:#e2e8f0;color:#0f172a;box-shadow:0 12px 32px rgba(15,23,42,.18)}
.az-pb-panel__title{color:#0f172a}
.az-pb-panel__eyebrow{color:#64748b}
.az-pb-panel__row{background:#f8fafc;border-color:#e2e8f0}
.az-pb-panel__row-label{color:#475569}
.az-pb-panel__row-value{color:#0f172a}
.az-pb-btn--ghost{border-color:#cbd5e1;color:#475569}
.az-pb-btn--ghost:hover:not(:disabled){background:#f1f5f9;color:#0f172a}
.az-pb-modal{background:rgba(15,23,42,.42);color:#0f172a;color-scheme:light}
.az-pb-modal__dialog{background:#ffffff;border-color:#e2e8f0;box-shadow:0 12px 40px rgba(15,23,42,.22)}
.az-pb-modal__header{border-color:#e2e8f0}
.az-pb-modal__title{color:#0f172a}
.az-pb-modal__count{color:#64748b}
.az-pb-modal__close{border-color:#cbd5e1;color:#475569}
.az-pb-modal__close:hover{background:#f1f5f9;color:#0f172a}
.az-pb-modal__file{color:#475569}
.az-pb-modal__file:hover{background:#f1f5f9;color:#0f172a}
.az-pb-modal__empty{color:#64748b}
}
@media (max-width:480px){
.az-pb-modal{padding:.75rem}
.az-pb-modal__dialog{max-height:85vh}
}
</style>`

const SCRIPT_TEMPLATE = `<script id="az-pb-script">(function(){
'use strict';
var PKG_ID=__PKG_ID__;
var META_URL=__META_URL__;
var CHAT=__CHAT_CFG__;
var ROOT_ID='az-pb-root';
var dismissed=false;
var expanded=false;
var busy=false;
var meta=null;
var bubble=null;
var panel=null;
var closeBtn=null;
var browseModal=null;
var browseCloseBtn=null;

function el(tag,props,children){
var n=document.createElement(tag);
if(props){
for(var k in props){
var v=props[k];
if(k==='style'){for(var s in v)n.style[s]=v[s];}
else if(k==='class'){n.className=v;}
else if(k==='text'){n.textContent=v;}
else if(k==='html'){n.innerHTML=v;}
else if(k==='attrs'){for(var a in v)n.setAttribute(a,v[a]);}
else if(k.indexOf('on')===0){n.addEventListener(k.slice(2).toLowerCase(),v);}
else{n[k]=v;}
}
}
if(children){
for(var i=0;i<children.length;i++){
var c=children[i];
if(c===null||c===undefined)continue;
if(typeof c==='string')n.appendChild(document.createTextNode(c));
else n.appendChild(c);
}
}
return n;
}
function svg(d,size){
var s=document.createElementNS('http://www.w3.org/2000/svg','svg');
s.setAttribute('width',size);s.setAttribute('height',size);s.setAttribute('viewBox','0 0 24 24');
s.setAttribute('fill','none');s.setAttribute('stroke','currentColor');s.setAttribute('stroke-width','1.75');
s.setAttribute('stroke-linecap','round');s.setAttribute('stroke-linejoin','round');s.setAttribute('aria-hidden','true');
s.innerHTML=d;
return s;
}
function fmtBytes(n){
if(n===undefined||n===null)return'\u2014';
if(n===0)return'0 B';
var u=['B','KB','MB','GB','TB'];
var e=Math.min(Math.floor(Math.log(n)/Math.log(1024)),u.length-1);
var v=n/Math.pow(1024,e);
var r=e===0?v:Math.round(v*10)/10;
return r+' '+u[e];
}
function packageSvg(){return svg('<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3.3 7.7 12 12l8.7-4.3"/><path d="M16.5 9.4 12 12 7.5 9.4"/>',18);}
function chatSvg(){return svg('<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.3-.6L3 21l1.8-5a8.3 8.3 0 0 1-.8-3.6 8.4 8.4 0 0 1 8.5-8.4 8.4 8.4 0 0 1 8.5 8.4z"/>',18);}
function sendSvg(){return svg('<path d="m4 12 15-7-6 15-2.5-6z"/>',16);}
function shareSvg(){return svg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/>',14);}
function lockSvg(){return svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',14);}
function globeSvg(){return svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18"/><path d="M12 3a14 14 0 0 0 0 18"/>',14);}
function fileSvg(){return svg('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8"/><path d="M8 17h6"/>',14);}
function setExpanded(v){expanded=v;if(panel)panel.hidden=!v;if(bubble)bubble.setAttribute('aria-expanded',String(v));}
function setDismissed(v){dismissed=v;if(bubble)bubble.style.display=v?'none':'';}
function flash(btn,text,klass,ms){
var orig=btn.__azPbOrig||btn.textContent;
btn.__azPbOrig=orig;
btn.textContent=text;
btn.classList.add(klass);
btn.disabled=true;
setTimeout(function(){btn.textContent=orig;btn.classList.remove(klass);btn.disabled=false;},ms);
}
function findBtn(cls){return panel?panel.querySelector('.'+cls):null;}

async function doShare(){
if(!meta||!meta.shareUrl)return;
var data={title:meta.name||document.title||'Shared page',url:meta.shareUrl};
var btn=findBtn('az-pb-share');
try{
if(navigator&&typeof navigator.share==='function'){
await navigator.share(data);
return;
}
if(navigator&&navigator.clipboard&&navigator.clipboard.writeText){
await navigator.clipboard.writeText(meta.shareUrl);
if(btn)flash(btn,'Link copied','az-pb-btn--flash',1500);
return;
}
}catch(err){
if(err&&err.name==='AbortError')return;
}
if(btn)flash(btn,'Copy failed','az-pb-btn--ghost',1500);
window.prompt('Copy this URL',meta.shareUrl);
}

async function doToggle(){
if(!meta||!meta.canToggle||busy)return;
var next=meta.visibility==='public'?'private':'public';
busy=true;renderPanel();
try{
var res=await fetch(META_URL,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({visibility:next})});
if(res.ok){meta=await res.json();}
else{
var btn=findBtn('az-pb-toggle');
if(btn)flash(btn,res.status===401||res.status===403?'Not allowed':'Toggle failed','az-pb-btn--ghost',1500);
}
}catch(e){
var btn=findBtn('az-pb-toggle');
if(btn)flash(btn,'Toggle failed','az-pb-btn--ghost',1500);
}
busy=false;renderPanel();
}

function fileUrl(file){
var base;
try{
base=new URL(meta.shareUrl,window.location.href);
}catch(e){
base=new URL('/pub/'+encodeURIComponent(PKG_ID),window.location.href);
}
var parts=String(file).split('/').map(function(part){return encodeURIComponent(part);});
var pathname=base.pathname.replace(/\\/+$/,'');
base.pathname=pathname+'/'+parts.join('/');
return base.toString();
}

function closeBrowse(){
if(!browseModal)return;
browseModal.hidden=true;
if(browseCloseBtn)browseCloseBtn.blur();
}

function renderBrowse(){
if(!browseModal||!meta)return;
browseModal.replaceChildren();
var files=Array.isArray(meta.files)?meta.files:[];
var count=files.length+' '+(files.length===1?'file':'files');
browseCloseBtn=el('button',{class:'az-pb-modal__close',type:'button',text:'\u00d7',attrs:{'aria-label':'Close file browser'},onClick:closeBrowse});
var header=el('div',{class:'az-pb-modal__header'},[
 el('div',null,[
  el('p',{class:'az-pb-modal__eyebrow'},['Package files']),
  el('h2',{class:'az-pb-modal__title',attrs:{id:'az-pb-browse-title'}},['Browse package']),
  el('p',{class:'az-pb-modal__count'},[count]),
 ]),
 browseCloseBtn,
]);
var list=el('ul',{class:'az-pb-modal__list'});
if(files.length===0){
 list.appendChild(el('li',null,[el('p',{class:'az-pb-modal__empty'},['No files available.'])]));
}else{
 for(var i=0;i<files.length;i++){
  var file=String(files[i]);
  list.appendChild(el('li',null,[el('a',{class:'az-pb-modal__file',href:fileUrl(file),attrs:{'aria-label':'Open '+file}},[fileSvg(),document.createTextNode(file)])]));
 }
}
var dialog=el('div',{class:'az-pb-modal__dialog',onClick:function(e){e.stopPropagation();}},[header,list]);
browseModal.appendChild(dialog);
}

function openBrowse(){
if(!meta||!browseModal)return;
setExpanded(false);
renderBrowse();
browseModal.hidden=false;
if(browseCloseBtn)browseCloseBtn.focus();
}

function renderPanel(){
if(!panel)return;
panel.replaceChildren();
if(!meta){
panel.appendChild(el('p',{class:'az-pb-panel__eyebrow',style:{textAlign:'center',padding:'6px 0'}},['Loading\u2026']));
return;
}
var header=el('div',null,[
el('p',{class:'az-pb-panel__eyebrow'},['Package']),
el('p',{class:'az-pb-panel__title'},[meta.name||'']),
]);
panel.appendChild(header);
var shareBtn=el('button',{class:'az-pb-btn az-pb-btn--primary az-pb-share',type:'button',attrs:{'aria-label':'Share page'},onClick:doShare},[shareSvg(),document.createTextNode('Share')]);
panel.appendChild(shareBtn);
var browseBtn=el('button',{class:'az-pb-btn az-pb-btn--ghost az-pb-browse',type:'button',attrs:{'aria-label':'Browse package files','aria-haspopup':'dialog'},onClick:openBrowse},[fileSvg(),document.createTextNode('Browse')]);
panel.appendChild(browseBtn);
if(meta.canToggle){
var label=meta.visibility==='public'?'Make private':'Make public';
var iconSvg=meta.visibility==='public'?lockSvg():globeSvg();
var togBtn=el('button',{class:'az-pb-btn az-pb-btn--ghost az-pb-toggle',type:'button',disabled:busy,onClick:doToggle},[iconSvg,document.createTextNode(busy?'Updating\u2026':label)]);
panel.appendChild(togBtn);
}
panel.appendChild(el('div',{class:'az-pb-panel__row'},[
el('span',{class:'az-pb-panel__row-label'},['Size']),
el('span',{class:'az-pb-panel__row-value'},[fmtBytes(meta.sizeBytes)]),
]));
}

async function fetchMeta(){
try{
var res=await fetch(META_URL,{credentials:'same-origin',headers:{'Accept':'application/json'}});
if(res.ok){meta=await res.json();renderPanel();}
}catch(e){}
}

function onDocClick(e){
if(!expanded)return;
var root=document.getElementById(ROOT_ID);
if(root&&!root.contains(e.target))setExpanded(false);
}
function onKey(e){
if(e.key!=='Escape')return;
if(browseModal&&!browseModal.hidden){closeBrowse();return;}
if(chatOpen){setChatOpen(false);return;}
if(expanded)setExpanded(false);
}

/* ── Agent chat ─────────────────────────────────────────────────────────── */
var IDENTITY_KEY='tp_agent_identity';
var IDENTITY_RE=/^[a-z0-9][a-z0-9._-]{1,31}$/;
var chatBubble=null,chatPanel=null,chatLog=null,chatStatus=null,chatStatusText=null,chatInput=null,chatSendBtn=null,chatForm=null;
var chatOpen=false,chatBooted=false,chatSending=false;
var chatCursor=0,chatSeen=Object.create(null),chatEmpty=null;
var es=null,esFailures=0,esRetry=null,pollTimer=null,thinkWatchdog=null;

function readIdentity(){
try{return window.localStorage.getItem(IDENTITY_KEY)||'';}catch(e){return '';}
}
function writeIdentity(v){
try{window.localStorage.setItem(IDENTITY_KEY,v);}catch(e){}
}
/* Only shared-secret deployments need a name; an authz identity is already known. */
function needsIdentity(){
return CHAT&&CHAT.identity==='self-declared'&&!readIdentity();
}
function chatQuery(extra){
var q='path='+encodeURIComponent(CHAT.path);
var id=readIdentity();
if(id)q+='&identity='+encodeURIComponent(id);
return extra?q+'&'+extra:q;
}
function chatBody(extra){
var body={path:CHAT.path};
var id=readIdentity();
if(id)body.identity=id;
if(extra)for(var k in extra)body[k]=extra[k];
return body;
}
async function chatPost(route,extra){
return fetch(CHAT.base+route,{
method:'POST',credentials:'same-origin',
headers:{'Content-Type':'application/json','Accept':'application/json'},
body:JSON.stringify(chatBody(extra))
});
}

/* Model output is never parsed as HTML. Fenced blocks become <pre><code>, prose
   becomes a text node; both are filled with textContent, so nothing the agent (or
   the page it read) emits can become markup. */
function renderMessageText(node,text){
var parts=String(text==null?'':text).split(/\`\`\`/);
for(var i=0;i<parts.length;i++){
if(!parts[i])continue;
if(i%2===1){
var body=parts[i].replace(/^[^\\n]*\\n/,'');
var code=el('code');code.textContent=body;
var pre=el('pre');pre.appendChild(code);
node.appendChild(pre);
}else{
node.appendChild(document.createTextNode(parts[i]));
}
}
}
function addMessage(role,text,key){
if(key){if(chatSeen[key])return chatSeen[key];}
if(chatEmpty&&chatEmpty.parentNode){chatEmpty.parentNode.removeChild(chatEmpty);chatEmpty=null;}
var cls=role==='user'?'az-pb-chat__msg az-pb-chat__msg--user'
:role==='error'?'az-pb-chat__msg az-pb-chat__msg--error'
:'az-pb-chat__msg az-pb-chat__msg--agent';
var node=el('div',{class:cls});
renderMessageText(node,text);
chatLog.appendChild(node);
chatLog.scrollTop=chatLog.scrollHeight;
if(key)chatSeen[key]=node;
return node;
}
/* There is no terminal status by design: "done" fires per step, not per turn, so
   treating it as idle would flicker the indicator between steps. The indicator is
   cleared by the turn's output instead: any message, error included.

   The watchdog therefore covers exactly one case, the server dying mid-turn, which
   is the only path that writes no outbox row at all. It is re-armed on every call,
   so a turn making steady progress keeps pushing it back and only true silence
   trips it. */
function setThinking(on,label){
if(!chatStatus)return;
if(on&&label&&chatStatusText)chatStatusText.textContent=label;
chatStatus.hidden=!on;
if(thinkWatchdog){clearTimeout(thinkWatchdog);thinkWatchdog=null;}
if(on)thinkWatchdog=setTimeout(function(){if(chatStatus)chatStatus.hidden=true;},60000);
}

/* Build our own label from the machine-readable fields: the upstream "status"
   string is a convenience label, not a stable contract. An unrecognised kind still
   means the turn is running, so keep whatever the indicator already says. */
function statusLabel(d){
if(!d)return null;
if(d.kind==='tool')return 'Running '+(String(d.tool||'a tool').slice(0,40))+'\\u2026';
if(d.kind==='responding')return 'Writing a reply\\u2026';
if(d.kind==='thinking')return 'Thinking\\u2026';
return null;
}

/* Messages can arrive twice: reconnecting replays everything past the cursor. Key
   on the server id, falling back to the optimistic echo's client id. */
function ingest(msg){
if(!msg)return;
var key=msg.id||msg.messageId||msg.clientMessageId;
if(key&&chatSeen[key])return;
/* A failed turn arrives here rather than on the SSE error event — the failure is
   written to the durable outbox like any other output — so it is styled as an
   error, and it clears the indicator exactly like a successful reply. */
var role=msg.role==='user'?'user':(msg.kind==='error'?'error':'agent');
addMessage(role,msg.text||msg.content||'',key);
if(typeof msg.seq==='number'&&msg.seq>chatCursor)chatCursor=msg.seq;
if(role!=='user')setThinking(false);
}

function closeStream(){
if(es){try{es.close();}catch(e){}es=null;}
if(esRetry){clearTimeout(esRetry);esRetry=null;}
if(pollTimer){clearInterval(pollTimer);pollTimer=null;}
}
function startPolling(){
if(pollTimer)return;
pollTimer=setInterval(async function(){
try{
var res=await fetch(CHAT.base+'/messages?'+chatQuery('since='+chatCursor),{credentials:'same-origin',headers:{'Accept':'application/json'}});
if(!res.ok)return;
var data=await res.json();
if(typeof data.cursor==='number')chatCursor=data.cursor;
(data.messages||[]).forEach(ingest);
}catch(e){}
},3000);
}
function openStream(){
if(es||pollTimer||!chatOpen)return;
try{
es=new EventSource(CHAT.base+'/stream?'+chatQuery('since='+chatCursor));
}catch(e){startPolling();return;}
es.addEventListener('message',function(ev){
esFailures=0;
try{ingest(JSON.parse(ev.data));}catch(e){}
});
es.addEventListener('status',function(ev){
esFailures=0;
var label=null;
try{label=statusLabel(JSON.parse(ev.data));}catch(e){}
setThinking(true,label);
});
/* Stream-level only — replay failed. A failed *turn* is a message event, handled
   in ingest(); this one says nothing about whether the turn is still running. */
es.addEventListener('error',function(ev){
try{var d=JSON.parse(ev.data);addMessage('error',d.error||'The agent reported an error.');}catch(e){}
});
es.onerror=function(){
/* Own the reconnect: EventSource would retry by itself, but with the cursor
   baked into the original URL, so it would replay from where we started. */
closeStream();
if(!chatOpen)return;
esFailures++;
if(esFailures>=3){startPolling();return;}
esRetry=setTimeout(openStream,Math.min(1000*Math.pow(2,esFailures),30000));
};
}

async function bootChat(){
if(chatBooted)return;
chatBooted=true;
try{
var res=await chatPost('/session');
if(!res.ok){
chatBooted=false;
addMessage('error',res.status===401||res.status===403?'You are not signed in as an admin.':'Could not reach the agent.');
return;
}
var data=await res.json();
chatCursor=typeof data.cursor==='number'?data.cursor:0;
(data.history||[]).forEach(ingest);
/* Only when the agent's stored version has drifted from ours — after a
   republish. Navigation alone does not change it. */
if(data.serverContextVersion&&data.contextVersion!==data.serverContextVersion){
chatPost('/context').catch(function(){});
}
openStream();
}catch(e){
chatBooted=false;
addMessage('error','Could not reach the agent.');
}
}

async function sendChat(){
if(chatSending)return;
var text=(chatInput.value||'').trim();
if(!text)return;
chatSending=true;chatSendBtn.disabled=true;
chatInput.value='';chatInput.style.height='';
var cid='m-'+Date.now()+'-'+Math.random().toString(16).slice(2,8);
addMessage('user',text,cid);
/* Reset the label rather than inheriting the last turn's — the previous one may
   have ended on "Running web_search". */
setThinking(true,'Thinking\\u2026');
try{
var res=await chatPost('/message',{message:text,clientMessageId:cid});
if(!res.ok){
setThinking(false);
if(res.status===429){
var retry='';
try{retry=(await res.json()).retryAfter;}catch(e){}
addMessage('error','Too many messages'+(retry?' — try again in '+retry+'s.':' — try again shortly.'));
}else{
addMessage('error',res.status===401||res.status===403?'You are not signed in as an admin.':'The agent could not be reached.');
}
}
}catch(e){
setThinking(false);
addMessage('error','The agent could not be reached.');
}
chatSending=false;chatSendBtn.disabled=false;
chatInput.focus();
}

function renderIdentityPrompt(){
chatLog.replaceChildren();
var input=el('input',{class:'az-pb-chat__input',type:'text',attrs:{placeholder:'Your name',maxlength:'32','aria-label':'Your name'}});
var err=el('p',{class:'az-pb-chat__eyebrow',style:{color:'#f87171',display:'none'}},['Letters, digits, dot, dash or underscore; 2–32 characters.']);
var save=el('button',{class:'az-pb-btn az-pb-btn--primary',type:'button',onClick:function(){
var v=(input.value||'').trim().toLowerCase();
if(!IDENTITY_RE.test(v)){err.style.display='';return;}
writeIdentity(v);
chatLog.replaceChildren();
renderChatEmpty();
if(chatForm)chatForm.hidden=false;
bootChat();
chatInput.focus();
}},['Continue']);
input.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();save.click();}});
chatLog.appendChild(el('div',{class:'az-pb-chat__intro'},[
el('p',null,['Everyone signing in with this access token shares one identity.']),
el('p',null,['Pick a name so your conversation stays separate from your colleagues\\u2019.']),
input,err,save,
]));
input.focus();
}
function renderChatEmpty(){
chatEmpty=el('p',{class:'az-pb-chat__empty'},['Ask about this page — what it covers, where a figure came from, or what to change.']);
chatLog.appendChild(chatEmpty);
}

function setChatOpen(v){
chatOpen=v;
if(chatPanel)chatPanel.hidden=!v;
if(chatBubble)chatBubble.setAttribute('aria-expanded',String(v));
if(v){
setExpanded(false);
/* No composer until we know whose conversation this is — otherwise the first
   message would land in the shared unnamed one. */
if(needsIdentity()){if(chatForm)chatForm.hidden=true;renderIdentityPrompt();return;}
if(chatForm)chatForm.hidden=false;
bootChat();
if(chatInput)chatInput.focus();
}else{
/* An idle EventSource holds one of the six connections the browser allows to
   this origin — the same origin serving this package's own assets. */
closeStream();
}
}

function mountChat(root){
if(!CHAT)return;
var slot=el('div',{class:'az-pb-slot'});
chatBubble=el('button',{class:'az-pb-bubble',type:'button',attrs:{'aria-label':'Chat about this page','aria-expanded':'false','aria-haspopup':'dialog'},onClick:function(){setChatOpen(!chatOpen);}});
chatBubble.appendChild(chatSvg());
chatPanel=el('div',{class:'az-pb-chat',hidden:true,attrs:{role:'dialog','aria-label':'Agent chat'}});

var closeChat=el('button',{class:'az-pb-modal__close',type:'button',text:'\\u00d7',attrs:{'aria-label':'Close chat'},onClick:function(){setChatOpen(false);}});
chatPanel.appendChild(el('div',{class:'az-pb-chat__header'},[
el('div',null,[
el('p',{class:'az-pb-chat__eyebrow'},['Ask about']),
el('p',{class:'az-pb-chat__title'},[CHAT.title||CHAT.path]),
]),
closeChat,
]));

chatLog=el('div',{class:'az-pb-chat__log',attrs:{role:'log','aria-live':'polite'}});
chatPanel.appendChild(chatLog);
renderChatEmpty();

chatStatusText=el('span',{text:'Thinking\\u2026'});
chatStatus=el('div',{class:'az-pb-chat__status',hidden:true},[
el('span',{class:'az-pb-chat__dots'},[el('i'),el('i'),el('i')]),
chatStatusText,
]);
chatPanel.appendChild(chatStatus);

chatInput=el('textarea',{class:'az-pb-chat__input',attrs:{rows:'1',placeholder:'Ask about this page\\u2026','aria-label':'Message'}});
chatInput.addEventListener('input',function(){
chatInput.style.height='auto';
chatInput.style.height=Math.min(chatInput.scrollHeight,110)+'px';
});
chatInput.addEventListener('keydown',function(e){
if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat();}
});
chatSendBtn=el('button',{class:'az-pb-chat__send',type:'submit',attrs:{'aria-label':'Send'}});
chatSendBtn.appendChild(sendSvg());
chatForm=el('form',{class:'az-pb-chat__form',onSubmit:function(e){e.preventDefault();sendChat();}},[chatInput,chatSendBtn]);
chatPanel.appendChild(chatForm);

slot.appendChild(chatBubble);
slot.appendChild(chatPanel);
root.appendChild(slot);

document.addEventListener('visibilitychange',function(){
if(document.visibilityState==='hidden')closeStream();
else if(chatOpen&&chatBooted)openStream();
});
window.addEventListener('pagehide',closeStream);
}

function mount(){
if(document.getElementById(ROOT_ID))return;
var root=el('div',{id:ROOT_ID});
/* Chat sits to the left of the package bubble; each bubble anchors its own
   panel, so they get a positioned slot apiece. */
mountChat(root);
var slot=el('div',{class:'az-pb-slot'});
bubble=el('button',{class:'az-pb-bubble',type:'button',attrs:{'aria-label':'Package info','aria-expanded':'false'},onClick:function(e){if(e.target===closeBtn)return;setExpanded(!expanded);if(bubble)bubble.setAttribute('aria-expanded',String(expanded));}});
bubble.appendChild(packageSvg());
closeBtn=el('button',{class:'az-pb-bubble__close',type:'button',attrs:{'aria-label':'Dismiss'},html:'&times;'});
closeBtn.addEventListener('click',function(e){e.stopPropagation();setDismissed(true);});
bubble.appendChild(closeBtn);
slot.appendChild(bubble);
panel=el('div',{class:'az-pb-panel',hidden:true});
slot.appendChild(panel);
root.appendChild(slot);
browseModal=el('div',{class:'az-pb-modal',hidden:true,attrs:{role:'dialog','aria-modal':'true','aria-labelledby':'az-pb-browse-title'},onClick:function(e){if(e.target===browseModal)closeBrowse();}});
document.body.appendChild(root);
document.body.appendChild(browseModal);
renderPanel();
fetchMeta();
document.addEventListener('click',onDocClick,true);
document.addEventListener('keydown',onKey);
}

if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',mount);}
else{mount();}
})();</script>`

/**
 * Serialise a value for embedding in an inline `<script>`.
 *
 * Two hazards, both of which bite the moment a value is not a slugified id:
 *
 *  - JSON.stringify does not escape `/`, so a string containing `</script>` ends the
 *    script block early and everything after it is parsed as HTML.
 *  - String.replace(string, string) treats `$&`, `` $` `` and `$'` in the *replacement*
 *    as backreferences, so those sequences would be rewritten on the way in. Callers
 *    pass this through a replacer function, which is exempt from that.
 */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value ?? null).replace(/</g, '\\u003c')
}

export function injectBubble(html: string, opts: InjectBubbleOptions): string {
  const script = SCRIPT_TEMPLATE
    .replace('__PKG_ID__', () => jsonForScript(opts.packageId))
    .replace('__META_URL__', () => jsonForScript(opts.metaUrl))
    // null when the viewer may not chat, which is what makes the script skip
    // mounting the second bubble at all.
    .replace('__CHAT_CFG__', () => jsonForScript(opts.chat ?? null))

  const block = `${STYLE}\n${script}\n`

  const lower = html.toLowerCase()
  const bodyIdx = lower.lastIndexOf('</body>')
  if (bodyIdx !== -1) {
    return html.slice(0, bodyIdx) + block + html.slice(bodyIdx)
  }
  const htmlIdx = lower.lastIndexOf('</html>')
  if (htmlIdx !== -1) {
    return html.slice(0, htmlIdx) + block + html.slice(htmlIdx)
  }
  return html + block
}