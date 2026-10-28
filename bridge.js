// Runs only inside the trusted, outcome-hidden legacy form.
(()=>{
 const reviewer=document.getElementById('reviewer');reviewer.value=window.HH_REVIEWER;reviewer.readOnly=true;state.reviewer=window.HH_REVIEWER;
 const exportButton=document.getElementById('export');if(exportButton)exportButton.textContent='Optional local backup';
 document.querySelectorAll('p').forEach(p=>{if(p.textContent.includes('sends nothing over the network')||p.textContent.includes('sends no data over the network'))p.textContent='This hosted form saves drafts and submitted decisions privately online. Save each judgment explicitly. A local JSON export is an optional backup.';});
 state._onlineDrafts=state._onlineDrafts||{};
 let lastIndex=index,dirty=false,restoring=false;
 function fields(){return [...document.querySelectorAll('input,select,textarea')].filter(e=>e.id!=='reviewer');}
 function capture(){if(restoring)return;state._onlineIndex=index;state._onlineDrafts[index]=fields().map(e=>({id:e.id,name:e.name,type:e.type,value:e.value,checked:e.checked}));dirty=true;}
 function restore(){restoring=true;const draft=state._onlineDrafts[index];if(draft){const controls=fields();draft.forEach((d,i)=>{const e=controls[i];if(e&&e.id===d.id&&e.name===d.name&&e.type===d.type){e.value=d.value;if('checked'in e)e.checked=d.checked;}});}restoring=false;}
 // Dynamic source evidence fields already have their own structured draft handling.
 if(packet.task_type!=='source_evidence'){
   const savedIndex=state._onlineIndex;if(Number.isInteger(savedIndex)&&savedIndex>=0&&savedIndex<packet.items.length){index=savedIndex;show();lastIndex=index;}
   restore();
 }
 function send(){if(!dirty)return;dirty=false;parent.postMessage({type:'hh-checkpoint',channel:window.HH_CHANNEL,state:JSON.parse(JSON.stringify(state))},'*');}
 document.addEventListener('input',capture);document.addEventListener('change',capture);
 document.addEventListener('click',e=>{
  if(packet.task_type==='token_language'&&e.target.closest('#save')){
   const ambiguous=[...document.querySelectorAll('#tokens select')].some(s=>s.value==='ambiguous');
   if(ambiguous&&!document.getElementById('notes').value.trim()){e.stopImmediatePropagation();e.preventDefault();document.getElementById('status').textContent='Identify the ambiguous tokens and your uncertainty in the notes before saving.';return;}
  }
  setTimeout(()=>{if(index!==lastIndex){if(packet.task_type!=='source_evidence')restore();lastIndex=index;}capture();send();},100);
 },true);
 let priorCount=state.events.length;
 setInterval(()=>{if(state.events.length!==priorCount){priorCount=state.events.length;capture();}send();},1500);
 window.addEventListener('blur',()=>{capture();send();});
})();
