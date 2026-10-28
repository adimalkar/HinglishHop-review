const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const field=(caption,control)=>{const e=node('label',caption);e.append(control);return e;};
const relation=u=>({relation_id:u?.unit_id||'reviewer-'+crypto.randomUUID(),source_unit_id:u?.unit_id||null,subject:'',relation:'',object:'',decision:'',explanation:'',evidence:[]});
export function defaultDraft(packet,item){
 if(packet.task_type==='token_language')return {tags:item.spans.map(()=>''),notes:''};
 if(packet.task_type==='review')return {meaning_preserved:'',entities_intact:'',naturalness:null,needs_adjudication:false,notes:''};
 if(packet.task_type==='authorship')return {question:'',answer:'',evidence_ids:[],notes:''};
 return {relations:item.source_units.length?item.source_units.map(relation):[relation()],overall:{notes:'',answer_evidence:[]},exposure:{},review_order:'',review_order_notes:'',independent_completion:false};
}
export function legacyDraft(packet,item,event,state){
 let v=event;
 if(!v&&packet.task_type==='source_evidence')v=state?.drafts?.[item.item_id+':'+packet.profile];
 if(!v&&packet.task_type==='token_language'){
  const index=packet.items.indexOf(item),controls=state?._onlineDrafts?.[index];
  if(controls){const tags=controls.filter(c=>c.type==='select-one').map(c=>c.value);if(tags.length===item.spans.length)return {tags,notes:controls.find(c=>c.id==='notes')?.value||''};}
 }
 if(!v)return null;
 if(packet.task_type==='token_language')return {tags:v.tags.map(t=>t.language),notes:v.notes||'',timing:v.timing};
 const d=defaultDraft(packet,item);for(const k of [...Object.keys(d),'timing'])if(v[k]!==undefined)d[k]=structuredClone(v[k]);
 if(d.relations)d.relations=d.relations.map(r=>{const c={...r};delete c.pending_citation;return c;});if(d.overall)delete d.overall.pending_citation;return d;
}
export function renderQuestion(context){
 const {packet,item,draft,questionBox,answerBox,update}=context;
 questionBox.replaceChildren();answerBox.replaceChildren();
 const get=path=>path.split('.').reduce((a,k)=>a?.[k],draft);
 const set=(path,value,immediate=true)=>{const parts=path.split('.');let obj=draft;for(const part of parts.slice(0,-1)){obj[part]??={};obj=obj[part];}obj[parts.at(-1)]=value;update(draft,immediate);};
 const redraw=()=>renderQuestion(context);
 function text(caption,path,area=true){const input=node(area?'textarea':'input');if(!area)input.type='text';input.dataset.field=path;input.value=get(path)||'';input.maxLength=8000;input.oninput=()=>set(path,input.value,false);return field(caption,input);}
 function choices(caption,path,options){const fs=node('fieldset');fs.append(node('legend',caption));const box=node('div',undefined,'options');for(const [value,label] of options){const input=node('input');input.type='radio';input.name=path;input.value=String(value);input.dataset.field=path;input.checked=get(path)===value;input.onchange=()=>set(path,value);const labelEl=node('label',undefined,'option');labelEl.append(input,document.createTextNode(label));box.append(labelEl);}fs.append(box);return fs;}
 function select(caption,path,options){const e=node('select');e.dataset.field=path;e.append(new Option('Choose…',''));for(const [value,label] of options)e.append(new Option(label,value));e.value=get(path)||'';e.onchange=()=>set(path,e.value);return field(caption,e);}
 function check(caption,path){const e=node('input');e.type='checkbox';e.dataset.field=path;e.checked=!!get(path);e.onchange=()=>set(path,e.checked);const label=node('label',undefined,'check');label.append(e,document.createTextNode(caption));return label;}
 function evidence(caption,path){
  const box=node('div',undefined,'evidence');box.append(node('h4',caption));const citations=get(path)||[];
  citations.forEach((c,i)=>{const row=node('div',undefined,'citation');row.append(node('p',c.quote));const remove=node('button','Remove excerpt');remove.type='button';remove.onclick=()=>{set(path,citations.filter((_,j)=>i!==j));redraw();};row.append(remove);box.append(row);});
  const doc=node('select');doc.append(new Option('Choose document…',''));item.passages.forEach(p=>doc.append(new Option(p.title,p.passage_id)));
  const part=node('select');part.append(new Option('Body text','text'),new Option('Title','title'));
  const quote=node('textarea'),occurrence=node('input');quote.placeholder='Paste an exact excerpt from the supplied document.';occurrence.type='number';occurrence.min='1';occurrence.value='1';
  const add=node('button','Add exact excerpt');add.type='button';const issue=node('p',undefined,'small');
  add.onclick=()=>{const p=item.passages.find(p=>p.passage_id===doc.value),n=Number(occurrence.value);if(!p||!quote.value.trim()||!Number.isInteger(n)||n<1){issue.textContent='Choose a document, exact excerpt and occurrence.';return;}
   const source=p[part.value],matches=[];let i=0,found;while((found=source.indexOf(quote.value,i))!==-1){matches.push(found);i=found+1;}
   if(matches.length<n){issue.textContent='Exact excerpt not found at that occurrence.';return;}
   const start=Array.from(source.slice(0,matches[n-1])).length,end=start+Array.from(quote.value).length;
   if(citations.some(c=>c.passage_id===doc.value&&c.field===part.value&&c.start===start&&c.end===end)){issue.textContent='This excerpt is already added.';return;}
   set(path,[...citations,{passage_id:doc.value,field:part.value,start,end,quote:quote.value}]);redraw();};
  box.append(field('Document',doc),field('Part',part),field('Exact excerpt',quote),field('Occurrence if the excerpt repeats',occurrence),add,issue);return box;
 }
 if(packet.task_type==='token_language'){
  questionBox.append(node('p','HINGLISH WORDING','eyebrow'),node('p',item.question,'question-text'),node('p','Label every token independently. Names are named entities; Latin script does not make a word English. Use ambiguous and explain uncertain tokens. English sources are hidden until all token questions are completed.','note'));
  item.spans.forEach((s,i)=>{const row=node('div',undefined,'token-row'),word=node('div',s.token,'token-word');word.append(node('small','Characters '+s.start+'–'+s.end));const e=node('select');e.dataset.field='tags.'+i;e.setAttribute('aria-label','Language of '+s.token+' token '+(i+1));e.append(new Option('Choose label…',''));for(const [v,t] of [['hi','Hindi'],['en','English'],['ne','Named entity'],['neutral','Neutral'],['ambiguous','Ambiguous']])e.append(new Option(t,v));e.value=draft.tags[i]||'';e.onchange=()=>set('tags.'+i,e.value);row.append(word,e);answerBox.append(row);});answerBox.append(text('Notes identifying uncertain tokens','notes'));return;
 }
 if(packet.task_type==='review'){
  questionBox.append(node('p','ENGLISH SOURCE','eyebrow'),node('p',item.source_english,'source-english'),node('p','HINGLISH DRAFT','eyebrow'),node('p',item.question,'question-text'));
  const yn=[['yes','Yes'],['no','No'],['uncertain','Uncertain']];answerBox.append(choices('Is the meaning preserved?','meaning_preserved',yn),choices('Are entities, dates and numbers intact?','entities_intact',yn),choices('How natural does the Hinglish sound?','naturalness',[[1,'1 · Incomprehensible'],[2,'2 · Awkward'],[3,'3 · Acceptable'],[4,'4 · Natural'],[5,'5 · Very natural']]),check('Needs repair or adjudication','needs_adjudication'),text('Notes or exact repair suggestion','notes'));return;
 }
 if(packet.task_type==='authorship'){
  questionBox.append(node('p','EVIDENCE-FIRST WRITING PRACTICE','eyebrow'),node('p','Write a natural romanized Hinglish question using facts across at least two passages. The original question and expected answer are absent. This practice stays outside the final audit.'));
  item.passages.forEach(p=>{const d=node('details');d.open=true;d.append(node('summary',p.evidence_id+' · '+p.title),node('pre',p.text));questionBox.append(d);});
  answerBox.append(text('Your Hinglish question','question'),text('Intended answer','answer',false));for(const p of item.passages){const c=node('input');c.type='checkbox';c.dataset.evidence=p.evidence_id;c.checked=draft.evidence_ids.includes(p.evidence_id);c.onchange=()=>{draft.evidence_ids=c.checked?[...draft.evidence_ids,p.evidence_id]:draft.evidence_ids.filter(x=>x!==p.evidence_id);update(draft,true);};const l=node('label',undefined,'check');l.append(c,document.createTextNode('Use passage '+p.evidence_id+': '+p.title));answerBox.append(l);}answerBox.append(text('Notes','notes'));return;
 }
 questionBox.append(node('p','SOURCE EVIDENCE REVIEW','eyebrow'),node('p',item.question,'question-text'),node('p','Unverified source answer: '+item.source_answer),node('p','Source answers and relation annotations are claims to inspect. A matching name alone does not establish the relation. Model responses and scores are absent.','note'));
 item.passages.forEach(p=>{const d=node('details');d.append(node('summary',p.title),node('pre',p.text));questionBox.append(d);});
 answerBox.append(node('h3','Prior exposure and actual order'));
 const yn=[['yes','Yes'],['no','No'],['unclear','Unclear']];const exposureNames={source_seen_before:'Seen this English source case before?',model_outputs_seen_before:'Seen model responses or scores for this case?',agent_notes_seen_before:'Seen agent diagnostic notes for this case?'};
 for(const k of packet.rubric.exposure_fields)answerBox.append(select(exposureNames[k],'exposure.'+k,yn));
 answerBox.append(select('Actual token and source review order','review_order',packet.rubric.order_decisions.map(k=>[k,k.replaceAll('_',' ')])),text('Actual order / exposure explanation','review_order_notes'),check('I am making this decision independently, without copying another reviewer or machine advice','independent_completion'));
 answerBox.append(node('h3','Required relations'));
 draft.relations.forEach((r,i)=>{const card=node('section',undefined,'relation'),unit=item.source_units.find(u=>u.unit_id===r.source_unit_id);card.append(node('h4',unit?'Unverified source unit':'Reviewer-defined relation'));if(unit)card.append(node('pre',JSON.stringify(unit,null,2),'claim'));
  for(const k of ['subject','relation','object'])card.append(text(k[0].toUpperCase()+k.slice(1),'relations.'+i+'.'+k,false));
  card.append(select('Evidence judgment','relations.'+i+'.decision',packet.rubric.relation_decisions.map(k=>[k,k.replaceAll('_',' ')])),text('Explain the relation or uncertainty','relations.'+i+'.explanation'),evidence('Exact evidence excerpts','relations.'+i+'.evidence'));
  if(!unit){const remove=node('button','Remove added relation');remove.onclick=()=>{draft.relations.splice(i,1);update(draft,true);redraw();};card.append(remove);}answerBox.append(card);
 });
 const add=node('button','Add a required relation');add.id='add-relation';add.onclick=()=>{draft.relations.push(relation());update(draft,true);redraw();};answerBox.append(add,node('h3','Overall question and answer'));
 const names={answerability:'Is the source answer established by these documents?',answer_unique:'Does the question specify a unique answer?',specificity_clear:'Is the required answer type and granularity clear?',multi_hop_required:'Are multiple evidence steps actually required?',relation_inventory_complete:'Have you identified every required relation?',temporal_scope_clear:'Is temporal scope clear (or irrelevant)?'};
 for(const k of packet.rubric.overall_fields)answerBox.append(select(names[k],'overall.'+k,yn));
 answerBox.append(evidence('Evidence for the complete answer','overall.answer_evidence'),text('Explanation, alternatives and remaining concerns','overall.notes'));
}
