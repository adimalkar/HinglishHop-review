const $=id=>document.getElementById(id),api=window.HINGLISHHOP_API;
let invitation=sessionStorage.getItem('hh-invitation')||'',me=null,active=null,revision=0,pending=null,saving=false,channel='',lastSaved=null;
const fragment=new URLSearchParams(location.hash.slice(1));if(fragment.has('invite')){invitation=fragment.get('invite');history.replaceState(null,'',location.pathname+location.search);}
function error(e){$('message').textContent=e.message||String(e);}
function show(id){for(const key of ['login','introduction','dashboard','workspace'])$(key).hidden=key!==id;$('message').textContent='';}
async function call(path,data){const r=await fetch(api+'/'+path,{method:data?'POST':'GET',headers:{Authorization:'Bearer '+invitation,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});const out=await r.json();if(!r.ok)throw Error(out.error||'Request failed');return out;}
function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function home(){me=await call('me');sessionStorage.setItem('hh-invitation',invitation);show(me.onboarded?'dashboard':'introduction');$('reviewer-name').textContent=me.reviewer;$('existing').replaceChildren();
 $('calibration-status').textContent=me.approved?'Calibration inspected: development reviews are available.':'Start with calibration. Authors inspect the judgments before opening the larger development pool.';
 for(const batch of me.batches){const b=document.createElement('button');b.textContent=batch.pool+' · '+(batch.stage==='done'?'completed':batch.stage.replaceAll('_',' '));b.disabled=batch.stage==='done';b.onclick=()=>open(batch.id).catch(error);$('existing').append(b,document.createTextNode(' '));}
}
$('login-form').onsubmit=async e=>{e.preventDefault();invitation=$('invite').value.trim();try{await home();$('invite').value='';}catch(e){error(e);}};
$('logout').onclick=()=>{invitation='';sessionStorage.removeItem('hh-invitation');$('task-frame').srcdoc='';show('login');};
$('introduction-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),data={};for(const k of ['adult','personally_reviewing','one_identity','consent','independent'])data[k]=f.has(k);for(const k of ['hindi','english','notes'])data[k]=f.get(k);try{await call('onboarding',data);await home();}catch(e){error(e);}};
document.querySelectorAll('[data-pool]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const batch=await call('assign',{pool:b.dataset.pool,prior_source_exposure:$('prior-exposure').value,exposure_notes:$('exposure-notes').value});await open(batch.id);}catch(e){error(e);}finally{b.disabled=false;}});
$('my-export').onclick=async()=>{try{download(await call('my-export'),'hinglishhop-my-online-decisions.json');}catch(e){error(e);}};
const safeJSON=v=>JSON.stringify(v).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026');
async function open(id){
 if(saving||pending)throw Error('Wait until the current checkpoint is saved.');
 const data=await call('batch/'+id);if(data.complete){await home();return;}
 active=data;revision=data.revision;channel=crypto.randomUUID();lastSaved=null;pending=null;
 const task=data.packet.task_type,template=await (await fetch('templates/'+task+'.html')).text();
 const initial=data.state||{reviewer:me.reviewer,events:[],timers:{},drafts:{}};
 initial.reviewer=me.reviewer;
 let key=task==='token_language'?'hinglishhop-token:':task==='source_evidence'?'hinglishhop-source-evidence:':'hinglishhop:';
 const bootstrap='<script>try{localStorage.setItem('+safeJSON(key+data.packet.packet_id)+','+safeJSON(JSON.stringify(initial))+')}catch(e){}<\/script>';
 const bridge=await (await fetch('bridge.js')).text();
 let html=template.replace('__DATA__',safeJSON(data.packet)).replace('__PACKET_JSON__',safeJSON(data.packet)).replace('__PACKET__',safeJSON(data.packet));
 // The optional online checkpoint supplements the original versioned offline forms.
 html=bootstrap+html+'<script>window.HH_CHANNEL='+safeJSON(channel)+';window.HH_REVIEWER='+safeJSON(me.reviewer)+';<\/script><script>'+bridge+'<\/script>';
 show('workspace');$('task-stage').textContent=(task==='review'?'02 · Question meaning':task==='token_language'?'01 · Word language':task==='source_evidence'?'03 · Source evidence':'Evidence-first authorship practice');
 $('sync').textContent='Connected · saved decisions synchronize automatically';$('advance').disabled=false;$('task-frame').srcdoc=html;window.scrollTo({top:$('workspace').offsetTop,behavior:'smooth'});
}
async function flush(){
 if(saving||!pending||!active)return;saving=true;$('advance').disabled=true;
 while(pending){const state=pending;pending=null;try{const saved=await call('batch/'+active.batch.id+'/save',{stage:active.batch.stage,revision,state});revision=saved.revision;lastSaved=JSON.stringify(state);$('sync').textContent='Saved online · '+saved.saved_events+' decision events · '+new Date(saved.received_at).toLocaleTimeString();}catch(e){pending=state;error(e);$('sync').textContent='Not synchronized. Keep this tab open; use Retry save.';saving=false;$('retry').hidden=false;return;}}
 saving=false;$('advance').disabled=false;$('retry').hidden=true;
}
const retry=document.createElement('button');retry.id='retry';retry.textContent='Retry save';retry.hidden=true;retry.onclick=()=>flush();$('advance').before(retry);
window.addEventListener('message',e=>{
 if(e.source!==$('task-frame').contentWindow||e.data?.channel!==channel||e.data.type!=='hh-checkpoint')return;
 const state=e.data.state;if(!state||state.reviewer!==me?.reviewer)return;
 if(JSON.stringify(state)===lastSaved)return;pending=state;flush();
});
$('advance').onclick=async()=>{try{await flush();if(saving||pending)throw Error('Wait for online saving to finish.');$('advance').disabled=true;await call('batch/'+active.batch.id+'/advance',{stage:active.batch.stage});await open(active.batch.id);}catch(e){error(e);}finally{if(!pending)$('advance').disabled=false;}};
$('back').onclick=async()=>{try{await flush();if(saving||pending)throw Error('Wait for online saving to finish.');$('task-frame').srcdoc='';active=null;await home();}catch(e){error(e);}};
window.addEventListener('beforeunload',e=>{if(pending||saving){e.preventDefault();e.returnValue='';}});
if(invitation)home().catch(e=>{show('login');error(e);});
