export interface InjectBubbleOptions {
  packageId: string
  metaUrl: string
}

const STYLE = `<style id="az-pb-style">
#az-pb-root{position:fixed;right:1rem;bottom:1rem;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;color:#e2e8f0;color-scheme:dark}
#az-pb-root,.az-pb-bubble,.az-pb-panel,.az-pb-modal,#az-pb-root *,.az-pb-bubble *,.az-pb-panel *,.az-pb-modal *{box-sizing:border-box}
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
if(expanded)setExpanded(false);
}

function mount(){
if(document.getElementById(ROOT_ID))return;
var root=el('div',{id:ROOT_ID});
bubble=el('button',{class:'az-pb-bubble',type:'button',attrs:{'aria-label':'Package info','aria-expanded':'false'},onClick:function(e){if(e.target===closeBtn)return;setExpanded(!expanded);if(bubble)bubble.setAttribute('aria-expanded',String(expanded));}});
bubble.appendChild(packageSvg());
closeBtn=el('button',{class:'az-pb-bubble__close',type:'button',attrs:{'aria-label':'Dismiss'},html:'&times;'});
closeBtn.addEventListener('click',function(e){e.stopPropagation();setDismissed(true);});
bubble.appendChild(closeBtn);
root.appendChild(bubble);
panel=el('div',{class:'az-pb-panel',hidden:true});
root.appendChild(panel);
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

export function injectBubble(html: string, opts: InjectBubbleOptions): string {
  const script = SCRIPT_TEMPLATE
    .replace('__PKG_ID__', JSON.stringify(opts.packageId))
    .replace('__META_URL__', JSON.stringify(opts.metaUrl))

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