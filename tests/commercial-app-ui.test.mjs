import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Window} from 'npm:happy-dom@20.0.10';
import * as domain from '../domain.mjs';
import * as access from '../access.mjs';
import * as operiaDomain from '../operia-domain.mjs';
import * as operiaUI from '../operia-ui.mjs';
import * as workflow from '../operia-workflow.mjs';
import {renderContactContext} from '../contact-context.mjs';
const source=(await readFile(new URL('../app.mjs',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/^login\(\);$/m,'').replace(/^resumeGoogle\(\);$/m,'');
const row=(extra={})=>({id:'own',brand_id:'op',kind:'contact',name:'Entreprise attribuée',owner_id:'sales',status:'À qualifier',related_id:null,source:'Source vérifiée',notes:'Note conservée.',email:'',phone:'',website:'',amount_cents:0,paid_cents:0,quantity:1,due_date:null,archived:false,version:1,metadata:{operia:{...operiaDomain.emptyOperia(),siren:'123456789'}},...extra});
function setup(role='commercial',brandProfile='operia'){
 const window=new Window(),document=window.document;
 document.body.innerHTML='<div id="app"></div><dialog id="editor"></dialog><div id="notice"></div>';
 const data={brands:[{id:'op',name:'Opéria test',profile:brandProfile},{id:'other',name:'Marque non autorisée',profile:'general'}],members:[{brand_id:'op',user_id:'sales',display_name:'Commercial test',role},{brand_id:'op',user_id:'admin',display_name:'Administrateur test',role:'owner'}],records:[row(),row({id:'secret',name:'Entreprise confidentielle',owner_id:'admin'}),row({id:'archive',name:'Archive confidentielle',archived:true})],events:[{id:'e1',brand_id:'op',record_id:'own',record_name:'Entreprise attribuée',created_at:'2026-11-15',action:'Modification'},{id:'e2',brand_id:'op',record_id:'secret',record_name:'Entreprise confidentielle',created_at:'2026-11-15',action:'Modification'}]};
 const saves=[],store={load:async()=>data,save:async record=>{const saved={...record,id:record.id||'new-record',version:(record.version||0)+1};saves.push(saved);const i=data.records.findIndex(r=>r.id===saved.id);if(i<0)data.records.push(saved);else data.records[i]=saved;return saved;}};
 const dependencies={...domain,...access,...operiaDomain,...operiaUI,...workflow,e:domain.escapeHTML,renderContactContext,document,FormData:window.FormData,AbortController:window.AbortController,config:{},googleSignIn:async()=>{},RemoteStore:class{},DemoStore:class{},setTimeout:()=>0};
 const app=new Function('dependencies','fixture',`const {${Object.keys(dependencies).join(',')}}=dependencies;${source}\ndata=fixture.data;store=fixture.store;user={id:'sales'};brand='op';return {render,edit,saveRecord,selection,navNames,draft,exportCSV,importDialog,newBrand,activity,setView:value=>view=value,setBrand:value=>brand=value};`)(dependencies,{data,store});
 return {app,data,saves,store,window,document,close:()=>window.happyDOM.close()};
}
test('commercial application hides foreign rows, administration, exports and reassign controls',async()=>{
 const t=setup();try{
  t.app.setView('contact');t.app.render();
  assert.equal(t.document.querySelectorAll('#brand option').length,1);
  assert.match(t.document.querySelector('#content').textContent,/Entreprise attribuée/);assert.doesNotMatch(t.document.body.textContent,/Entreprise confidentielle|Archive confidentielle|Marque non autorisée/);
  for(const selector of ['[data-nav="settings"]','#team','#mine','#export','#archives','#operia-import','#operia-backup','[data-owner]'])assert.equal(t.document.querySelector(selector),null,selector);
  assert.ok(t.document.querySelector('#new'));assert.deepEqual(t.app.selection().map(x=>x.id),['own']);
  t.app.setView('activity');t.app.render();assert.doesNotMatch(t.document.querySelector('#content').textContent,/Entreprise confidentielle/);
  t.app.edit(t.data.records[1]);assert.equal(t.document.querySelector('#editor').open,false);
  await assert.rejects(t.app.saveRecord({...t.data.records[0],owner_id:'admin'}));assert.equal(t.saves.length,0);
 }finally{await t.close();}
});
test('commercial contact form preserves identity, attribution and money while saving coordinates and a new note',async()=>{
 const t=setup();try{
  t.app.setView('contact');t.app.render();t.app.edit(t.data.records[0]);
  const q=s=>t.document.querySelector(s);
  assert.equal(q('#f-name').readOnly,true);assert.equal(q('#operia-f-siren').readOnly,true);assert.equal(q('#f-owner_id').disabled,true);assert.equal(q('#f-source').readOnly,true);
  for(const selector of ['#archive','[name="operia_originator"]','[name="operia_monthlyHt"]','[name="operia_activityAmount"]','[name="notes"]'])assert.equal(q(selector),null,selector);
  assert.equal(q('#operia-f-stage option[value="Gagné"]'),null);assert.equal(q('#operia-f-activityKind option[value="Paiement reçu"]'),null);
  q('#f-email').value='contact@example.test';q('#f-note_append').value='Échange effectué, démo à planifier.';
  const form=q('#record-form');await form.onsubmit({preventDefault(){},target:form});
  assert.equal(t.saves.length,1,q('#form-error')?.textContent);assert.equal(t.saves[0].email,'contact@example.test');assert.match(t.saves[0].notes,/^Note conservée\.\n\n\[\d{4}-\d{2}-\d{2}\] Échange effectué/);assert.equal(t.saves[0].owner_id,'sales');assert.equal(t.saves[0].metadata.operia.monthlyHtCents,null);
 }finally{await t.close();}
});
test('commercial creates a task for an assigned contact and cannot change its existing link',async()=>{
 const t=setup();try{
  t.app.setView('task');t.app.render();t.app.edit();const q=s=>t.document.querySelector(s);
  assert.deepEqual([...q('#f-related_id').options].map(x=>x.value),['','own']);q('#f-related_id').value='own';q('#f-name').value='Préparer une démo';
  const form=q('#record-form');await form.onsubmit({preventDefault(){},target:form});assert.equal(t.saves.length,1,q('#form-error')?.textContent);assert.equal(t.saves[0].kind,'task');assert.equal(t.saves[0].related_id,'own');assert.equal(t.saves[0].owner_id,'sales');
  t.app.edit(t.saves[0]);assert.equal(q('#f-related_id').disabled,true);assert.equal(q('#f-name').readOnly,false);
 }finally{await t.close();}
});
test('commercial can update coordinates without rewriting an existing JSONB activity',async()=>{
 const t=setup();try{
  // Postgres JSONB key order differs from the qualification normalizer's order.
  const event={at:'2026-11-15',id:'past',kind:'Note',note:'Compte rendu existant',source:'Appel',amountHtCents:null};
  t.data.records[0].metadata.operia.activities=[event];t.app.setView('contact');t.app.render();t.app.edit(t.data.records[0]);
  t.document.querySelector('#f-email').value='new@example.test';const form=t.document.querySelector('#record-form');await form.onsubmit({preventDefault(){},target:form});
  assert.equal(t.saves.length,1,t.document.querySelector('#form-error')?.textContent);assert.deepEqual(t.saves[0].metadata.operia.activities,[event]);
 }finally{await t.close();}
});
test('contact form opens and saves its Opéria draft after the original prepare button is detached',async()=>{
 const t=setup();try{
  const drafts=[];t.store.loadDraft=async()=>null;t.store.saveDraft=async input=>{drafts.push(input);return {...input,id:'draft-fictif',version:1};};
  t.app.setView('contact');t.app.render();t.app.edit(t.data.records[0]);const prepare=t.document.querySelector('#draft');await prepare.onclick();
  assert.equal(prepare.isConnected,false);const save=t.document.querySelector('#op-save');assert.ok(save);assert.equal(t.document.querySelector('#editor').open,true);
  await save.onclick();assert.equal(drafts.length,1);assert.equal(drafts[0].brand_id,'op');assert.equal(drafts[0].contact_id,'own');assert.match(drafts[0].body,/Opéria/);assert.match(t.document.querySelector('#op-draft-state').textContent,/Brouillon enregistré\. Aucun message envoyé\./);
 }finally{await t.close();}
});
test('a slow draft response after closing cannot change a reopened contact or save through the detached button',async()=>{
 for(const fails of [false,true]){const t=setup();try{
  let finish,calls=0;t.store.loadDraft=async()=>null;t.store.saveDraft=input=>{calls++;return new Promise((resolve,reject)=>{finish=()=>fails?reject(Error('Erreur fictive tardive')):resolve({...input,id:'draft-fictif',version:1});});};
  t.app.setView('contact');t.app.render();t.app.edit(t.data.records[0]);await t.document.querySelector('#draft').onclick();
  const save=t.document.querySelector('#op-save'),oldState=t.document.querySelector('#op-draft-state'),priorState=oldState.textContent,pending=save.onclick();assert.ok(finish);assert.equal(calls,1);
  t.document.querySelector('#op-draft-close').onclick();assert.equal(t.document.querySelector('#editor').open,false);t.app.edit(t.data.records[0]);
  const reopened=t.document.querySelector('#editor').innerHTML;assert.equal(oldState.isConnected,false);finish();await pending;
  assert.equal(t.document.querySelector('#editor').innerHTML,reopened);assert.equal(oldState.textContent,priorState);assert.equal(t.document.querySelector('#form-error').textContent,'');assert.equal(t.document.querySelector('#op-draft-state'),null);
  await save.onclick();assert.equal(calls,1);
 }finally{await t.close();}}
});
test('existing Nanayé editor and viewer navigation stays available with the same write distinction',async()=>{
 for(const role of ['owner','editor','viewer']){const t=setup(role,'general');try{
  t.app.setView('contact');t.app.render();assert.ok(t.document.querySelector('[data-nav="settings"]'));assert.ok(t.document.querySelector('#export'));assert.ok(t.document.querySelector('#archives'));assert.ok(t.document.querySelector('#team'));assert.ok(t.document.querySelector('[data-nav="order"]'));
  assert.equal(!!t.document.querySelector('#new'),role!=='viewer');assert.equal(!!t.document.querySelector('[data-owner]'),role!=='viewer');assert.match(t.document.body.textContent,/Entreprise confidentielle/);
  t.app.edit(t.data.records[0]);assert.equal(!!t.document.querySelector('#save'),role!=='viewer');
 }finally{await t.close();}}
});
