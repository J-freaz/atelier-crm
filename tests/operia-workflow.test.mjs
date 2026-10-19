import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildOperiaDraft,openOperiaDraft} from '../operia-workflow.mjs';
import {emptyOperia,operiaOf,planLegacyImport} from '../operia-domain.mjs';
import {DemoStore} from '../store.mjs';

const brandId='demo-operia';
const record=(patch={})=>({
 id:'op-contact-demo',brand_id:brandId,kind:'contact',name:'Entreprise fictive de nettoyage',
 status:'À qualifier',archived:false,email:'contact@example.test',
 metadata:{operia:{...emptyOperia(),businessEvidence:'Entretien de bureaux.',
  businessSource:'https://example.test/prestations',contactSource:'https://example.test/contact'}},...patch
});
const draftInput=(contact,patch={})=>({brand_id:contact.brand_id,contact_id:contact.id,
 subject:'Organisation des sites',body:'Bonjour, comment suivez-vous vos prestations ?',
 signature:'Commercial fictif',recipient:'contact@example.test',...patch});

test('Opéria draft rejects native/metadata opposition, archives, lost, won and ceased companies',()=>{
 const cases=[{status:'Ne plus contacter'},{archived:true},
  ...['Opposition','Perdu','Gagné'].map(stage=>({metadata:{operia:{...emptyOperia(),stage}}})),
  {metadata:{operia:{...emptyOperia(),registryStatus:'C'}}}];
 for(const patch of cases)assert.throws(()=>buildOperiaDraft(record(patch),'Commercial fictif'),/exclu/);
});

test('draft preserves observed sources without inventing prices, offers, tools or Nanayé positioning',()=>{
 const r=record();r.metadata.operia.monthlyHtCents=29900;
 const draft=buildOperiaDraft(r,'Commercial fictif');
 assert.match(draft.subject,/Entreprise fictive de nettoyage/);
 assert.match(draft.body,/Entretien de bureaux\./);
 assert.ok(draft.body.includes(r.metadata.operia.businessSource));
 assert.ok(draft.body.includes(r.metadata.operia.contactSource));
 assert.match(draft.body,/Commercial fictif/);
 assert.match(draft.body,/Comment gérez-vous actuellement/);
 assert.match(draft.body,/\[Information sur le traitement des données/);
 assert.match(draft.body,/ne souhaitez pas être recontacté/);
 assert.doesNotMatch(draft.body,/Nanayé|EVJF|maillot|299|€|TTC|mois offert|sans engagement|vous n’avez pas de logiciel/i);
 assert.equal(r.metadata.operia.stage,'À qualifier');
 assert.deepEqual(r.metadata.operia.activities,[]);
});

test('unverified business claim and executable source never become a sourced opening',()=>{
 const r=record();r.metadata.operia.businessSource='javascript:alert(1)';
 const draft=buildOperiaDraft(r,'Commercial fictif');
 assert.doesNotMatch(draft.body,/Entretien de bureaux|javascript:|Votre site présente/);
 assert.ok(draft.body.includes(r.metadata.operia.contactSource));
});

test('DemoStore separates Opéria and Nanayé drafts and rejects cross-brand contact linkage',async()=>{
 const store=new DemoStore();
 const operia=store.data.records.find(r=>r.id==='op-contact-demo');
 const nanaye=store.data.records.find(r=>r.brand_id==='demo-nanaye'&&r.kind==='contact');
 const before=structuredClone(store.data.records);
 await store.saveDraft(draftInput(nanaye,{subject:'Sujet Nanayé fictif',body:'Contenu Nanayé fictif'}));
 await store.saveDraft(draftInput(operia,{subject:'Sujet Opéria fictif',body:'Contenu Opéria fictif'}));
 assert.equal((await store.loadDraft(nanaye.brand_id,nanaye.id)).body,'Contenu Nanayé fictif');
 assert.equal((await store.loadDraft(operia.brand_id,operia.id)).body,'Contenu Opéria fictif');
 assert.equal(await store.loadDraft(operia.brand_id,nanaye.id),null);
 await assert.rejects(store.saveDraft(draftInput(nanaye,{brand_id:operia.brand_id})),/exclu|introuvable/);
 assert.equal(store.drafts.length,2);
 assert.deepEqual(store.data.records,before);
 assert.ok(store.data.events.every(e=>e.action==='Brouillon enregistré (aucun envoi)'));
});

test('DemoStore prevents updating an Opéria draft after opposition or archival',async()=>{
 for(const exclusion of [{status:'Ne plus contacter'},{archived:true}]){
  const store=new DemoStore(),contact=store.data.records.find(r=>r.id==='op-contact-demo');
  const original=await store.saveDraft(draftInput(contact));
  Object.assign(contact,exclusion);
  await assert.rejects(store.saveDraft({...original,body:'Ne doit pas remplacer le brouillon'}),/exclu/);
  assert.deepEqual(await store.loadDraft(contact.brand_id,contact.id),original);
  assert.equal(store.data.events.length,1);
 }
});

test('DemoStore rejects viewer writes and preserves the winning concurrent draft version',async()=>{
 const store=new DemoStore(),contact=store.data.records.find(r=>r.id==='op-contact-demo');
 const initial=await store.saveDraft(draftInput(contact));
 const saved=await store.saveDraft({...initial,body:'Version conservée'});
 await assert.rejects(store.saveDraft({...initial,body:'Version obsolète'}),/changé/);
 assert.equal((await store.loadDraft(contact.brand_id,contact.id)).body,'Version conservée');
 assert.equal(saved.version,initial.version+1);
 store.data.members.find(m=>m.brand_id===brandId&&m.user_id===store.user.id).role='viewer';
 await assert.rejects(store.saveDraft({...saved,body:'Modification en lecture seule'}),/Éditeur/);
 assert.deepEqual(await store.loadDraft(contact.brand_id,contact.id),saved);
});

class DialogMock extends EventTarget {
 constructor(){super();this.open=true;this.markup='Fiche initiale';this.nodes=new Map();this.queryCount=0;}
 set innerHTML(value){this.markup=value;this.nodes.clear();}
 get innerHTML(){return this.markup;}
 querySelector(selector){
  this.queryCount++;
  if(!this.markup.includes(`id="${selector.slice(1)}"`))return null;
  if(!this.nodes.has(selector))this.nodes.set(selector,{value:'',checked:false,disabled:false,textContent:''});
  return this.nodes.get(selector);
 }
 close(){this.open=false;}
}

const openArgs=(dialog,store,extra={})=>({dialog,record:record(),brand:{id:brandId,profile:'operia'},
 members:[{brand_id:brandId,user_id:'fictive-user',display_name:'Signature fictive'}],
 user:{id:'fictive-user'},store,canEdit:true,demo:true,back(){},...extra});

test('late draft load does not replace another record after isCurrent becomes false',async()=>{
 for(const saved of [null,{subject:'Ancien sujet',body:'Ancien brouillon',recipient:'old@example.test',signature:'Ancienne signature'}]){
  const dialog=new DialogMock();let resolveLoad,current=true;
  const store={loadDraft:()=>new Promise(resolve=>{resolveLoad=resolve;})};
  const pending=openOperiaDraft(openArgs(dialog,store,{isCurrent:()=>current}));
  dialog.close();dialog.innerHTML='Fiche B ou nouvelle marque';dialog.open=true;current=false;
  resolveLoad(saved);await pending;
  assert.equal(dialog.innerHTML,'Fiche B ou nouvelle marque');
  assert.equal(dialog.queryCount,0);
 }
});

test('current draft load renders saved content safely and binds only draft actions',async()=>{
 const dialog=new DialogMock(),saved={subject:'Sujet <script>fictif</script>',body:'Texte </textarea><script>test</script>',recipient:'r@example.test',signature:'Signature enregistrée'};
 let requested;
 await openOperiaDraft(openArgs(dialog,{loadDraft:async(...args)=>{requested=args;return saved;}},{isCurrent:()=>true}));
 assert.deepEqual(requested,[brandId,'op-contact-demo']);
 assert.match(dialog.innerHTML,/Brouillon enregistré retrouvé/);
 assert.match(dialog.innerHTML,/Sujet &lt;script&gt;fictif&lt;\/script&gt;/);
 assert.doesNotMatch(dialog.innerHTML,/<script>/);
 assert.match(dialog.innerHTML,/Aucun envoi n’est proposé/);
 assert.equal(typeof dialog.querySelector('#op-save').onclick,'function');
 assert.equal(dialog.querySelector('#send'),null);
});

test('excluded draft never loads stored content; load error does not replace the current form',async()=>{
 const dialog=new DialogMock();let loads=0;
 await assert.rejects(openOperiaDraft(openArgs(dialog,{loadDraft:async()=>{loads++;return null;}},
  {record:record({status:'Ne plus contacter'})})),/exclu/);
 assert.equal(loads,0);assert.equal(dialog.innerHTML,'Fiche initiale');
 await assert.rejects(openOperiaDraft(openArgs(dialog,{loadDraft:async()=>{throw Error('offline');}})),/offline/);
 assert.equal(dialog.innerHTML,'Fiche initiale');
});

function sourceFixture(count=20){
 return {exportedAt:'2026-10-16T12:00:00Z',source:'Ancien CRM Opéria · test fictif',settings:[],events:[],
  leads:Array.from({length:count},(_,i)=>({id:`legacy-fictive-${i+1}`,product:'Operia',name:`Entreprise fictive ${String(i+1).padStart(2,'0')}`,
   stage:'À qualifier',siren:String(100000001+i),email:`contact${i+1}@example.test`,phone:'',website:'https://example.test',
   creationDate:'2010-01-02',created:'2026-09-24T18:00:00Z',updated:'2026-09-24T18:00:00Z',
   registryStatus:'A',registryDate:'2026-09-24T18:07:11.211334Z',registrySource:'https://example.test/registre',
   businessEvidence:'Entretien de bureaux — exemple fictif',businessSource:'https://example.test/prestations',
   businessDate:'2026-09-24T18:07:11.211334Z',contactSource:'https://example.test/contact',
   contactVerifiedAt:'2026-09-24T18:07:11.211334Z',contactRole:'Accueil fictif',need:'À qualifier',
   notes:'Données fictives, aucun contact réel',monthly:null,nextAction:'Qualifier le besoin',due:'',
   fit:{sites:null,agents:null,organization:'Inconnue',tool:'',pain:'',painConfirmed:false,budget:'Inconnu',
    source:'https://example.test/prestations',date:'2026-09-24T18:07:11.211334Z',kind:'Source publique'}}))};
}

async function importAndCheck(source){
 const store=new DemoStore(),before=await store.load();
 const nanayeBefore=before.records.filter(r=>r.brand_id==='demo-nanaye');
 const plan=planLegacyImport(source,{brandId,existingRecords:before.records});
 assert.equal(plan.conflicts.length,0);assert.equal(plan.create.length,source.leads.length);
 assert.equal(plan.suppress.length,0);assert.equal(plan.skip.length,0);
 for(const row of plan.create)await store.save({...row,owner_id:store.user.id});
 const after=await store.load(),imported=after.records.filter(r=>r.brand_id===brandId&&operiaOf(r).legacy.id);
 assert.equal(imported.length,source.leads.length);
 assert.deepEqual(after.records.filter(r=>r.brand_id==='demo-nanaye'),nanayeBefore);
 for(const lead of source.leads){
  const row=imported.find(r=>operiaOf(r).legacy.id===lead.id),o=operiaOf(row);
  assert.ok(row,`Source ID preserved: ${lead.id}`);
  for(const key of ['siren','creationDate','registryDate','registrySource','contactSource','contactVerifiedAt','businessEvidence','businessSource','businessDate','nextAction','due'])assert.equal(o[key],String(lead[key]??'').trim());
  assert.equal(o.legacy.created,lead.created);assert.equal(o.legacy.updated,lead.updated);
  assert.equal(o.fit.date,lead.fit?.date||'');assert.equal(o.fit.sites,lead.fit?.sites??null);assert.equal(o.fit.agents,lead.fit?.agents??null);
  assert.equal(row.phone,lead.phone||'');assert.equal(row.email,lead.email||'');
  assert.equal(row.amount_cents,0);assert.equal(row.paid_cents,0);assert.equal(o.originator,'');
  assert.equal(row.owner_id,store.user.id);assert.equal(o.monthlyHtCents,null);
 }
 const again=planLegacyImport(source,{brandId,existingRecords:after.records});
 assert.equal(again.create.length,0);assert.equal(again.suppress.length,0);
 assert.equal(again.conflicts.length,0);assert.equal(again.skip.length,source.leads.length);
 assert.equal(after.events.length-before.events.length,source.leads.length);
 assert.ok(after.events.every(e=>e.action==='Création'));
 return {store,after};
}

test('twenty synthetic source companies survive real DemoStore import and second import creates none',async()=>{
 const source=sourceFixture(),copy=structuredClone(source);
 await importAndCheck(source);assert.deepEqual(source,copy);
});

test('optional private live export: twenty companies roundtrip without copying data into the repository',
 {skip:!process.env.OPERIA_TEST_SOURCE},async()=>{
  const source=JSON.parse(await readFile(process.env.OPERIA_TEST_SOURCE,'utf8'));
  assert.equal(source.leads.length,20);assert.equal(source.events.length,0);
  assert.ok(source.leads.every(l=>l.stage==='À qualifier'&&l.monthly===null));
  await importAndCheck(source);
 });
