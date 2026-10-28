import {renderQuestion,defaultDraft,legacyDraft} from './review-forms.js?v=3';
const $=id=>document.getElementById(id),api=window.HINGLISHHOP_API;
const read=(k,fallback)=>{try{return JSON.parse(localStorage.getItem(k))??fallback;}catch{return fallback;}};
let profiles=read('hh-profiles-v2',[]),token=localStorage.getItem('hh-current-v2')||sessionStorage.getItem('hh-invitation')||'',me=null,active=null,index=0,tab='calibration',busy=false,processing=false,textTimer=null;
let outbox=[],revisions={},drafts={},submitted={},lastAck='',clock=null,lastTick=performance.now();
const fragment=new URLSearchParams(location.hash.slice(1));if(fragment.has('invite')){token=fragment.get('invite');history.replaceState(null,'',location.pathname);}
function problem(e){$('message').hidden=false;$('message').textContent=e.message||String(e);}
function clearProblem(){$('message').hidden=true;$('message').textContent='';}
function show(id){for(const k of ['welcome','hub','workspace','research'])$(k).hidden=k!==id;clearProblem();}
function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
const itemId=item=>item.variant_id||item.item_id;
const responseKey=(batch,stage,item)=>[batch,stage,item].join(':');
const current=()=>active.packet.items[index],key=()=>responseKey(active.batch.id,active.batch.stage,itemId(current()));
function stash(){localStorage.setItem('hh-outbox:'+token,JSON.stringify({outbox,revisions}));}
function syncLabel(message,state='saved'){$('sync').textContent=message;$('sync').parentElement.dataset.state=state;}
async function call(path,data,publicCall=false){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
 try{const r=await fetch(api+'/'+path,{method:data?'POST':'GET',signal:controller.signal,headers:{...(!publicCall&&token?{Authorization:'Bearer '+token}:{}),...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});const v=await r.json();if(!r.ok)throw Object.assign(Error(v.error||'Request failed'),{status:r.status});return v;}finally{clearTimeout(timeout);}
}
function savedProfiles(){const box=$('saved-profiles');box.replaceChildren();if(profiles.length){box.append(node('p','Already reviewed in this browser?'));for(const p of profiles){const b=node('button','Continue as '+p.alias);b.type='button';b.onclick=()=>resume(p.token).catch(problem);box.append(b,document.createTextNode(' '));}}}
async function resume(value){token=value;const cache=read('hh-outbox:'+token,{outbox:[],revisions:{}});outbox=cache.outbox;revisions=cache.revisions;await home();flush();}
async function home(){
 tick();clock=null;me=await call('me');localStorage.setItem('hh-current-v2',token);$('identity').textContent='Reviewing as '+me.alias;$('hello').textContent='Welcome, '+me.alias+'.';
 if(!me.onboarded){show('welcome');$('alias').value=me.alias;return;}
 if(!profiles.some(p=>p.token===token)){profiles.push({alias:me.alias,token});localStorage.setItem('hh-profiles-v2',JSON.stringify(profiles));}
 show('hub');renderHub();
}
$('join-form').onsubmit=async e=>{
 e.preventDefault();$('join-button').disabled=true;clearProblem();
 try{
  const f=new FormData(e.target),alias=f.get('alias').trim(),existing=profiles.find(p=>p.alias.toLowerCase()===alias.toLowerCase());
  if(existing){await resume(existing.token);return;}
  const d={alias,hindi:f.get('hindi'),english:f.get('english'),adult:f.has('personal'),personally_reviewing:f.has('personal'),one_identity:f.has('one_identity'),consent:f.has('consent'),independent:f.has('independent'),training_use:f.has('training_use'),notes:f.get('notes')};
  if(me&&!me.onboarded)await call('onboarding',d);
  else{let browserKey=localStorage.getItem('hh-enrollment-v2');if(!browserKey){browserKey=crypto.randomUUID()+crypto.randomUUID();localStorage.setItem('hh-enrollment-v2',browserKey);}await call('join',{...d,browser_key:browserKey},true);token=browserKey;localStorage.setItem('hh-current-v2',token);localStorage.removeItem('hh-enrollment-v2');}
  await resume(token);
 }catch(e){problem(e);}finally{$('join-button').disabled=false;}
};
$('switch-reviewer').onclick=async()=>{if(!await waitForSave())return;clock=null;active=null;me=null;token='';localStorage.removeItem('hh-current-v2');$('join-form').reset();show('welcome');savedProfiles();$('identity').textContent='Hindi + English speakers welcome';};
const calibrated=()=>me?.batches.some(b=>b.pool==='calibration'&&b.stage==='done');
function renderHub(){
 const box=$('tabs-view');box.replaceChildren();document.querySelectorAll('header [data-tab]').forEach(b=>b.setAttribute('aria-current',String(b.dataset.tab===tab)));
 const head=node('div',undefined,'section-head');head.append(node('p',tab==='calibration'?'FIRST STEP':'NEXT STEPS','eyebrow'),node('h2',{calibration:'Start with a shared calibration',review:'Check questions and their evidence',contribute:'Write questions from evidence'}[tab]));box.append(head);
 const card=node('section',undefined,'card');
 if(tab==='calibration'){
  card.append(node('p',calibrated()?'You completed calibration and can contribute development reviews. Authors still need to inspect quality before research use.':'Everyone starts with ten excluded questions. First label tokens; then review meaning and naturalness. There is no target score or required agreement.'));
  const b=node('button',calibrated()?'Continue to question review →':'Start / resume calibration →','primary');b.dataset.pool='calibration';b.onclick=()=>calibrated()?chooseTab('review'):start('calibration');card.append(b);
 }else if(tab==='review'){
  card.append(node('p','Review five questions at a time. Assignments favour less-covered items and balance source datasets. Retained questions still need independent review and quality inspection.'));
  const grid=node('div',undefined,'task-grid');for(const [pool,title,detail] of [['development','Question review','Token labels, meaning, entities and naturalness'],['source','Source evidence','Required relations, exact citations and answer support']]){const b=node('button');b.dataset.pool=pool;b.append(node('strong',title),node('span',calibrated()?detail:'Complete calibration first'));b.onclick=()=>start(pool);grid.append(b);}card.append(grid);
 }else{
  card.append(node('p','Write a natural Hinglish question from supplied passages, without seeing the original question or expected answer. These 20 items are excluded practice. Training consideration needs optional consent and later quality and license checks.'));
  const b=node('button',calibrated()?'Start a writing batch →':'Complete calibration first','primary');b.dataset.pool='authorship';b.onclick=()=>start('authorship');card.append(b);
 }
 box.append(card);$('assignments').replaceChildren();for(const b of me.batches.filter(b=>b.stage!=='done')){const button=node('button',b.pool.replace('development','Question review')+' · '+b.stage.replaceAll('_',' '));button.dataset.batch=b.id;button.onclick=()=>openBatch(b.id).catch(problem);$('assignments').append(button);}
 if(!me.batches.some(b=>b.stage!=='done'))$('assignments').append(node('span','No unfinished batches.','small'));
}
async function chooseTab(value){if(!await waitForSave())return;clock=null;active=null;if(value==='research'){show('research');await research();return;}tab=value;if(!me?.onboarded){show('welcome');savedProfiles();return;}show('hub');renderHub();}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>chooseTab(b.dataset.tab).catch(problem));$('research-back').onclick=()=>chooseTab('calibration');
async function research(){const v=await call('stats',null,true),box=$('research-stats');box.replaceChildren();for(const [n,label] of [[v.pools.find(p=>p.pool==='development')?.items||0,'Development drafts available'],[v.saved_answers,'Answer updates stored'],[v.completed_judgments,'Completed judgment events'],[v.sessions,'Registered browser sessions'],[v.quality_inspected_sessions,'Sessions inspected by authors']]){const card=node('div',undefined,'stat');card.append(node('strong',String(n)),node('span',label));box.append(card);}}
async function start(pool){try{
 if(pool!=='calibration'&&!calibrated()){tab='calibration';renderHub();return;}const existing=me.batches.find(b=>b.pool===pool&&b.stage!=='done');if(existing){await openBatch(existing.id);return;}
 document.getElementById('exposure-form')?.remove();const form=node('form',undefined,'card');form.id='exposure-form';form.append(node('h3','Before opening this batch'));
 const label=node('label','Have you seen these English source questions before?'),select=node('select');select.name='prior_source_exposure';select.required=true;for(const [v,t] of [['','Choose…'],['no','No known prior exposure'],['yes','Yes, some prior exposure'],['unclear','Unsure until I see the questions']])select.append(new Option(t,v));label.append(select);form.append(label);
 const notesLabel=node('label','Actual order or exposure notes'),notes=node('textarea');notes.name='exposure_notes';notes.required=true;notes.placeholder='Say if you opened earlier forms, saw source questions, or are unsure.';notesLabel.append(notes);form.append(notesLabel);const begin=node('button','Open this batch →','primary');begin.id='begin-batch';form.append(begin);
 form.onsubmit=async e=>{e.preventDefault();begin.disabled=true;try{const b=await call('assign',{pool,prior_source_exposure:select.value,exposure_notes:notes.value});await openBatch(b.id);}catch(e){problem(e);}finally{begin.disabled=false;}};$('tabs-view').append(form);form.scrollIntoView({behavior:'smooth',block:'center'});
}catch(e){problem(e);}}
async function openBatch(id){
 if(!await waitForSave())return;const v=await call('batch/'+id);if(v.complete){await home();return;}active=v;index=0;drafts={};submitted={};
 for(const item of v.packet.items){const k=itemId(item),old=(v.state?.events||[]).filter(e=>(e.variant_id||e.item_id)===k).at(-1),row=v.responses.find(r=>r.item===k);drafts[k]=row?JSON.parse(row.body):legacyDraft(v.packet,item,old,v.state)||defaultDraft(v.packet,item);const rk=responseKey(id,v.batch.stage,k);if(!outbox.some(o=>o.batch===id&&o.stage===v.batch.stage&&o.item_id===k))revisions[rk]=row?.revision||0;submitted[k]=row?row.submitted_revision===row.revision:!!old;}
 for(const op of outbox.filter(o=>o.batch===id&&o.stage===v.batch.stage)){drafts[op.item_id]=op.draft;submitted[op.item_id]=false;}
 show('workspace');renderItem();flush();
}
function tick(){const now=performance.now();if(clock&&!document.hidden&&document.hasFocus())clock.active+=(now-lastTick)/1000;lastTick=now;}
function timing(){tick();const now=new Date(),wall=Math.max(0,(now-Date.parse(clock.start_utc))/1000),seconds=Math.min(wall,clock.active);return {start_utc:clock.start_utc,end_utc:now.toISOString(),active_seconds:Math.round(seconds*1000)/1000,paused_seconds:Math.round((wall-seconds)*1000)/1000};}
function renderItem(){
 clearProblem();tick();const draft=drafts[itemId(current())],t=draft.timing;clock={start_utc:t?.start_utc||new Date().toISOString(),active:t?.active_seconds||0};lastTick=performance.now();
 const task=active.packet.task_type;$('task-label').textContent=active.batch.pool.toUpperCase();$('task-title').textContent={token_language:'Label the words',review:'Check meaning and naturalness',source_evidence:'Inspect the source evidence',authorship:'Write from evidence'}[task];
 const nav=$('question-navigation');nav.replaceChildren();active.packet.items.forEach((item,i)=>{const k=itemId(item),b=node('button',String(i+1)+(submitted[k]?' ✓':''));b.className=[i===index?'current':'',submitted[k]?'done':revisions[responseKey(active.batch.id,task,k)]?'draft':''].join(' ');b.onclick=()=>navigate(i);nav.append(b);});
 renderQuestion({packet:active.packet,item:current(),draft,questionBox:$('question-card'),answerBox:$('answer-card'),update:changed});$('previous').disabled=index===0;$('complete-question').disabled=busy;syncLabel(outbox.length?'Saving your changes…':lastAck||'Ready · answer choices save automatically',outbox.length?'saving':'saved');
}
function changed(draft,immediate=true){draft.timing=timing();drafts[itemId(current())]=draft;submitted[itemId(current())]=false;if(textTimer){clearTimeout(textTimer);textTimer=null;}if(immediate)enqueue();else{textTimer=setTimeout(()=>{textTimer=null;enqueue();},250);syncLabel('Saving your text…','saving');}}
function enqueue(){const draft=structuredClone(drafts[itemId(current())]);draft.timing=timing();drafts[itemId(current())].timing=draft.timing;outbox.push({batch:active.batch.id,stage:active.batch.stage,packet_id:active.packet.packet_id,item_id:itemId(current()),draft,mutation_id:crypto.randomUUID(),revision:null});stash();syncLabel('Saving your answer…','saving');flush();}
async function flush(){
 if(processing||!token||!outbox.length)return;processing=true;$('retry').hidden=true;
 while(outbox.length){const op=outbox[0],k=responseKey(op.batch,op.stage,op.item_id);if(op.revision===null){op.revision=revisions[k]||0;stash();}
  try{const saved=await call('batch/'+op.batch+'/response',op);revisions[k]=saved.revision;outbox.shift();stash();lastAck='Saved online · '+new Date(saved.received_at).toLocaleTimeString();syncLabel(outbox.length?'Saving your next answer…':lastAck,outbox.length?'saving':'saved');}
  catch(e){syncLabel(e.status===409?'Newer answers exist in another tab. Keep this tab open and contact an author.':'Waiting for connection · pending answers are kept in this browser','error');$('retry').hidden=false;if(e.status)problem(e);processing=false;if(!e.status)setTimeout(()=>flush(),3000);return;}
 }processing=false;
}
async function waitForSave(){if(textTimer){clearTimeout(textTimer);textTimer=null;enqueue();}await flush();for(let n=0;processing&&n<450;n++)await new Promise(r=>setTimeout(r,50));if(outbox.length||processing){problem(Error('Wait for “Saved online” before leaving. Pending changes remain in this browser.'));return false;}return true;}
$('retry').onclick=()=>flush();window.addEventListener('online',()=>flush());
async function navigate(to){if(!await waitForSave())return;clock=null;index=to;renderItem();}
$('previous').onclick=()=>navigate(index-1);$('leave-task').onclick=async()=>{if(await waitForSave()){clock=null;active=null;await home();}};
$('complete-question').onclick=async()=>{if(busy)return;busy=true;$('complete-question').disabled=true;clearProblem();try{
 if(!submitted[itemId(current())]){if(textTimer){clearTimeout(textTimer);textTimer=null;}enqueue();if(!await waitForSave())return;await call('batch/'+active.batch.id+'/submit',{item_id:itemId(current()),revision:revisions[key()]});submitted[itemId(current())]=true;}
 const next=active.packet.items.findIndex(i=>!submitted[itemId(i)]);if(next!==-1){index=next;renderItem();}else{const id=active.batch.id;await call('batch/'+id+'/advance',{stage:active.batch.stage});clock=null;active=null;await openBatch(id);}
}catch(e){problem(e);}finally{busy=false;$('complete-question').disabled=false;}};
$('my-export').onclick=async()=>{try{const value=await call('my-export'),url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=node('a');a.href=url;a.download='hinglishhop-my-responses.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){problem(e);}};
setInterval(()=>{tick();$('timer').textContent=clock?Math.round(clock.active)+' active seconds':'';},1000);
window.addEventListener('beforeunload',e=>{if(textTimer&&active){clearTimeout(textTimer);textTimer=null;enqueue();}if(outbox.length||processing){e.preventDefault();e.returnValue='';}});
document.addEventListener('visibilitychange',()=>{tick();if(document.hidden&&textTimer&&active){clearTimeout(textTimer);textTimer=null;enqueue();}});
savedProfiles();if(token)resume(token).catch(e=>{show('welcome');savedProfiles();problem(e);});
