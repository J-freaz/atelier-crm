import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {operiaSearchURL,registryCandidates,registryDepartment,searchOperiaRegistry,registryContact,sortRegistryCandidates,renderOperiaProspection,renderOperiaQualification,readOperiaQualification,bindOperiaProspection} from '../operia-ui.mjs';
import {emptyOperia} from '../operia-domain.mjs';

const publicCompany=(extra={})=>({siren:'123456789',nom_complet:'Société test',date_creation:'2026-01-02',statut_diffusion:'O',etat_administratif:'A',activite_principale:'81.21Z',siege:{departement:'91',etat_administratif:'A',statut_diffusion_etablissement:'O',libelle_commune:'Évry'},...extra});
const record=(op={})=>({id:'r1',brand_id:'operia',kind:'contact',name:'Société test',status:'À qualifier',metadata:{other:{keep:true},operia:{...emptyOperia(),...op}},due_date:'2026-01-01'});
function formFor(op={},extra={}){
 const o={...emptyOperia(),...op},f=new FormData();
 for(const name of ['stage','siren','creationDate','city','naf','registryStatus','registryDate','registrySource','employees','businessEvidence','businessSource','businessDate','contactName','contactRole','contactSource','contactVerifiedAt','need','nextAction','originator'])f.set('operia_'+name,o[name]||'');
 for(const [field,key] of Object.entries({sites:'sites',agents:'agents',organization:'organization',tool:'tool',pain:'pain',evidenceKind:'kind',fitSource:'source',fitDate:'date',budget:'budget'}))f.set('operia_'+field,o.fit[key]??'');
 if(o.fit.painConfirmed)f.set('operia_painConfirmed','on');
 f.set('operia_monthlyHt',o.monthlyHtCents===null?'':(o.monthlyHtCents/100).toFixed(2));
 for(const [key,value] of Object.entries(extra))f.set('operia_'+key,value);
 return f;
}

test('recherche bornée, département obligatoire et 25 résultats sans tri mondial inventé',()=>{
 const u=new URL(operiaSearchURL());assert.equal(u.searchParams.get('departement'),'91');assert.equal(u.searchParams.get('etat_administratif'),'A');assert.equal(u.searchParams.get('per_page'),'25');assert.equal(u.searchParams.get('activite_principale'),'81.21Z,81.22Z,81.29B');assert.equal(u.searchParams.has('date_creation_min'),false);
 for(const filters of [{department:''},{department:'France'},{department:'91,75,77,78,92,94'},{page:11},{page:1.2},{naf:['javascript:x']}])assert.throws(()=>operiaSearchURL(filters));
 assert.equal(new URL(operiaSearchURL({department:'2a, 974',q:'A & B'})).searchParams.get('q'),'A & B');
});

test('réapplique les filtres que l’API peut ignorer lors d’une recherche SIREN',()=>{
 const companies=[publicCompany(),publicCompany({siren:'234567891',etat_administratif:'C'}),publicCompany({siren:'345678912',statut_diffusion:'P'}),publicCompany({siren:'456789123',activite_principale:'68.32A'}),publicCompany({siren:'567891234',siege:{departement:'75',etat_administratif:'A',statut_diffusion_etablissement:'O'}}),publicCompany({siren:'678912345',siege:{departement:'91',etat_administratif:'A',statut_diffusion_etablissement:'P'}}),publicCompany({siren:'789123456',siege:{departement:'91',etat_administratif:'C',statut_diffusion_etablissement:'O'}})];
 const got=registryCandidates({results:companies},{department:'91',naf:['81.21Z']},'2026-10-16T10:00:00Z');
 assert.equal(got.length,1);assert.equal(got[0].siren,'123456789');assert.equal(got[0].registryDate,'2026-10-16T10:00:00Z');
 assert.throws(()=>registryCandidates({unexpected:[]}));
});

test('retient un établissement local actif sans inventer le nombre de chantiers ni un email',()=>{
 const company=publicCompany({siege:{departement:'75',etat_administratif:'A',statut_diffusion_etablissement:'O'},matching_etablissements:[{departement:'91',etat_administratif:'A',statut_diffusion_etablissement:'O',libelle_commune:'Massy'}],nombre_etablissements_ouverts:9});
 const [candidate]=registryCandidates({results:[company]});const row=registryContact(candidate,{brand:'operia',ownerId:'u1'});
 assert.equal(row.metadata.operia.city,'Massy');assert.equal(row.status,'À qualifier');assert.equal(row.email,'');assert.equal(row.metadata.operia.fit.sites,null);assert.equal(row.metadata.operia.fit.agents,null);assert.equal(row.metadata.operia.originator,'');assert.equal(row.owner_id,'u1');
});

test('réponse API réelle : matching sans département, établissement fermé écarté',async()=>{
 const fixture=JSON.parse(await readFile(new URL('./fixtures/registry-public-projection-2026-10-16.json',import.meta.url),'utf8'));
 assert.ok(fixture.results.every(r=>r.matching_etablissements.every(s=>!('departement' in s))));
 const got=registryCandidates(fixture,{department:'91'});
 assert.deepEqual(got.map(c=>c.siren),['933096828','428689392']);
 assert.equal(got[0].city,'LISSES');
 assert.equal(got.some(c=>c.siren==='067800425'),false);
});

test('localisation par code commune pour Essonne, Corse et outre-mer sans confusion postale',()=>{
 assert.equal(registryDepartment({commune:'91340'}),'91');
 assert.equal(registryDepartment({commune:'2A004',code_postal:'20000'}),'2A');
 assert.equal(registryDepartment({commune:'2B033',code_postal:'20200'}),'2B');
 assert.equal(registryDepartment({commune:'97411'}),'974');
 assert.equal(registryDepartment({code_postal:'91420'}),'');
 assert.equal(registryDepartment({commune:'911'}),'');
});

test('tri des dates connues et filtre local sans faire remonter les dates inconnues',()=>{
 const rows=[{name:'Sans date',creationDate:''},{name:'Ancienne',creationDate:'2004-01-01'},{name:'Récente',creationDate:'2026-01-01'}];
 assert.deepEqual(sortRegistryCandidates(rows).map(r=>r.name),['Récente','Ancienne','Sans date']);
 assert.deepEqual(sortRegistryCandidates(rows,{sort:'oldest'}).map(r=>r.name),['Ancienne','Récente','Sans date']);
 assert.deepEqual(sortRegistryCandidates(rows,{creationAfter:'2020-01-01'}).map(r=>r.name),['Récente']);assert.equal(rows[0].name,'Sans date');
});

test('annuaire : aucun cookie, délai 429 conservé, annulation transmise',async()=>{
 let options;await searchOperiaRegistry({department:'91',page:1},{fetchImpl:async(_url,o)=>{options=o;return new Response(JSON.stringify({results:[publicCompany()],total_results:1,total_pages:1}));}});
 assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');
 await assert.rejects(searchOperiaRegistry({department:'91'},{fetchImpl:async()=>new Response('',{status:429,headers:{'Retry-After':'120'}})}),e=>e.retryAfter===120);
 const abort=new AbortController();abort.abort();await assert.rejects(searchOperiaRegistry({department:'91'},{signal:abort.signal,fetchImpl:async(_u,o)=>{assert.equal(o.signal.aborted,true);throw new DOMException('Aborted','AbortError');}}),{name:'AbortError'});
});

test('qualification : tiers metadata conservés, opposition originale non réactivée par statut natif',()=>{
 const original={...record({stage:'Opposition'}),status:'Ne plus contacter'};
 const updated=readOperiaQualification(formFor({stage:'Qualifié'}),{...original,status:'Qualifié'},original);
 assert.equal(updated.status,'Ne plus contacter');assert.equal(updated.metadata.operia.stage,'Opposition');assert.deepEqual(updated.metadata.other,{keep:true});
 assert.equal(readOperiaQualification(new FormData(),original),original);
});

test('une nouvelle opposition native prend priorité sur une étape Opéria encore ouverte',()=>{
 const original=record({stage:'En échange'}),nativeUpdate={...original,status:'Ne plus contacter'};
 const result=readOperiaQualification(formFor({stage:'En échange'}),nativeUpdate,original);
 assert.equal(result.status,'Ne plus contacter');assert.equal(result.metadata.operia.stage,'Opposition');
 assert.match(renderOperiaQualification(nativeUpdate),/value="Opposition" selected/);
});

test('les horodatages importés sont affichés comme dates et conservés lors d’une autre modification',()=>{
 const timestamp='2026-01-02T14:53:17.123Z';
 const op={...emptyOperia(),registryDate:timestamp,businessDate:timestamp,contactVerifiedAt:timestamp,fit:{...emptyOperia().fit,date:timestamp}};
 const original=record(op),markup=renderOperiaQualification(original);
 for(const name of ['registryDate','businessDate','contactVerifiedAt','fitDate'])assert.match(markup,new RegExp(`name="operia_${name}" type="date" value="2026-01-02"`));
 const form=formFor(op,{registryDate:'2026-01-02',businessDate:'2026-01-02',contactVerifiedAt:'2026-01-02',fitDate:'2026-01-02',nextAction:'Préparer un appel'});
 const saved=readOperiaQualification(form,original);
 for(const name of ['registryDate','businessDate','contactVerifiedAt'])assert.equal(saved.metadata.operia[name],timestamp);
 assert.equal(saved.metadata.operia.fit.date,timestamp);assert.equal(saved.metadata.operia.nextAction,'Préparer un appel');
 form.set('operia_fitDate','2026-01-03');assert.equal(readOperiaQualification(form,original).metadata.operia.fit.date,'2026-01-03');
});

test('dossier gagné conservé et montant contractuel requis',()=>{
 const existing=record({stage:'Gagné',monthlyHtCents:12000});const updated=readOperiaQualification(formFor(existing.metadata.operia),existing);
 assert.equal(updated.metadata.operia.stage,'Gagné');assert.equal(updated.status,'Client');assert.equal(updated.metadata.operia.monthlyHtCents,12000);
 assert.throws(()=>readOperiaQualification(formFor({stage:'Gagné'}),record()),/montant mensuel/);
 assert.throws(()=>readOperiaQualification(formFor({stage:'Gagné',monthlyHtCents:0}),record()),/montant mensuel/);
});

test('affirmations de besoin ou absence d’outil nécessitent un échange sourcé et daté',()=>{
 assert.throws(()=>readOperiaQualification(formFor({}, {painConfirmed:'on',pain:'Planning manuel'}),record()),/besoin confirmé/);
 assert.throws(()=>readOperiaQualification(formFor({}, {organization:'Aucun logiciel déclaré',fitSource:'Site',fitDate:'2026-01-02',evidenceKind:'Source publique'}),record()),/déclarée par l’entreprise/);
 const updated=readOperiaQualification(formFor({}, {organization:'Aucun logiciel déclaré',fitSource:'Appel avec la direction',fitDate:'2026-01-02',evidenceKind:'Échange avec l’entreprise'}),record());
 assert.equal(updated.metadata.operia.fit.organization,'Aucun logiciel déclaré');
 for(const extra of [{registryDate:'2099-01-01'},{fitDate:'2099-01-01'},{creationDate:'2026-02-30'},{sites:'1.5'},{siren:'123'},{registrySource:'javascript:alert(1)'}])assert.throws(()=>readOperiaQualification(formFor({},extra),record()));
});

test('historique : paiement justifié et positif, opposition bloque les sollicitations',()=>{
 const add={activityKind:'Paiement reçu',activityDate:'2026-01-01',activityNote:'Règlement confirmé',activitySource:'Facture F-001',activityAmount:'120,50'};
 const updated=readOperiaQualification(formFor({},add),record());assert.equal(updated.metadata.operia.activities.length,1);assert.equal(updated.metadata.operia.activities[0].amountHtCents,12050);
 assert.throws(()=>readOperiaQualification(formFor({},{...add,activityAmount:'0'}),record()),/montant positif/);
 assert.throws(()=>readOperiaQualification(formFor({},{...add,activitySource:''}),record()),/justificatif/);
 const opposed={...record({stage:'Opposition'}),status:'Ne plus contacter'};
 assert.throws(()=>readOperiaQualification(formFor({stage:'Opposition'},{activityKind:'Appel effectué',activityDate:'2026-01-01',activityNote:'Appel'}),opposed),/opposée/);
 const note=readOperiaQualification(formFor({stage:'Opposition'},{activityKind:'Note',activityDate:'2026-01-01',activityNote:'Opposition conservée'}),opposed);assert.equal(note.metadata.operia.activities[0].kind,'Note');
});

test('rendu : contenu externe échappé, aucun lien exécutable et limites de recherche visibles',()=>{
 const row=record({businessEvidence:'<img src=x onerror=alert(1)>',registrySource:'javascript:alert(1)',activities:[{id:'a',kind:'Note',at:'2026-01-01',note:'</textarea><script>bad()</script>',source:'<b>source</b>'}]});
 const markup=renderOperiaQualification(row);assert.equal(markup.includes('<script>'),false);assert.match(markup,/&lt;script&gt;/);assert.equal(markup.includes('href="javascript:'),false);assert.match(markup,/ne sont pas déduits/);
 const search=renderOperiaProspection({brand:{id:'operia'},rows:[row],canEdit:true});assert.match(search,/résultats chargés/);assert.match(search,/25 résultats maximum/);assert.match(search,/ne confirme ni un besoin/);
});

test('démontage de la vue supprime ses listeners et ignore les mises à jour tardives',()=>{
 class Element extends EventTarget{constructor(value=''){super();this.value=value;this.textContent='';this.innerHTML='';this.hidden=false;this.disabled=false;this.isConnected=true;this.dataset={operiaBrand:'operia'};}querySelector(s){return this.elements[s];}}
 const host=new Element(),selectors=['[data-operia-search-state]','[data-operia-submit]','[data-operia-cancel]','[data-operia-next]','[data-operia-search]','[data-operia-followup]','#operia-sort','#operia-created-after','#operia-followup-stage','#operia-followup-sort'];host.elements=Object.fromEntries(selectors.map(s=>[s,new Element()]));host.elements['#operia-followup-sort'].value='action';
 const cleanup=bindOperiaProspection({querySelector:()=>host},{brand:'operia',rows:[record()],canEdit:true});const initial=host.elements['[data-operia-followup]'].innerHTML;assert.match(initial,/Société test/);cleanup();host.elements['#operia-followup-stage'].value='Opposition';host.elements['#operia-followup-stage'].dispatchEvent(new Event('change'));assert.equal(host.elements['[data-operia-followup]'].innerHTML,initial);
});

test('changement de marque pendant une recherche : requête annulée, réponse tardive ignorée',async()=>{
 class Element extends EventTarget{constructor(value=''){super();this.value=value;this.textContent='';this.innerHTML='';this.hidden=false;this.disabled=false;this.isConnected=true;this.dataset={operiaBrand:'operia'};}querySelector(s){return this.elements[s];}}
 const host=new Element(),selectors=['[data-operia-search-state]','[data-operia-submit]','[data-operia-cancel]','[data-operia-next]','[data-operia-search]','[data-operia-followup]','[data-operia-results]','[data-operia-results-tools]','[data-operia-search-limit]','#operia-sort','#operia-created-after','#operia-followup-stage','#operia-followup-sort'];host.elements=Object.fromEntries(selectors.map(s=>[s,new Element()]));host.elements['#operia-followup-sort'].value='action';host.elements['#operia-sort'].value='recent';
 const NativeFormData=globalThis.FormData;let complete,signal;
 globalThis.FormData=class{get(key){return {department:'91',q:'',naf:'all'}[key];}};
 let cleanup;
 try{
  cleanup=bindOperiaProspection({querySelector:()=>host},{brand:'operia',rows:[],canEdit:true,fetchImpl:(_url,options)=>{signal=options.signal;return new Promise(resolve=>{complete=resolve;});}});
  host.elements['[data-operia-search]'].dispatchEvent(new Event('submit',{cancelable:true}));assert.ok(signal);assert.equal(signal.aborted,false);
  cleanup();assert.equal(signal.aborted,true);host.dataset.operiaBrand='nanaye';const state=host.elements['[data-operia-search-state]'].textContent;
  complete(new Response(JSON.stringify({results:[publicCompany()],total_results:1,total_pages:1})));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(host.elements['[data-operia-search-state]'].textContent,state);assert.equal(host.elements['[data-operia-results]'].innerHTML,'');
 }finally{cleanup?.();globalThis.FormData=NativeFormData;}
});

test('un tri pendant un ajout lent ne permet pas d’enregistrer deux fois la même entreprise',async()=>{
 class Element extends EventTarget{constructor(value=''){super();this.value=value;this.textContent='';this.innerHTML='';this.hidden=false;this.disabled=false;this.isConnected=true;this.dataset={operiaBrand:'operia'};}querySelector(s){return this.elements[s];}}
 const host=new Element(),selectors=['[data-operia-search-state]','[data-operia-submit]','[data-operia-cancel]','[data-operia-next]','[data-operia-search]','[data-operia-followup]','[data-operia-results]','[data-operia-results-tools]','[data-operia-search-limit]','#operia-sort','#operia-created-after','#operia-followup-stage','#operia-followup-sort'];host.elements=Object.fromEntries(selectors.map(s=>[s,new Element()]));host.elements['#operia-followup-sort'].value='action';host.elements['#operia-sort'].value='recent';
 const NativeFormData=globalThis.FormData;globalThis.FormData=class{get(key){return {department:'91',q:'',naf:'all'}[key];}};
 let cleanup,calls=0,finish;
 try{
  cleanup=bindOperiaProspection({querySelector:()=>host},{brand:'operia',rows:[],canEdit:true,fetchImpl:async()=>new Response(JSON.stringify({results:[publicCompany()],total_results:1,total_pages:1})),onSave:row=>{calls++;return new Promise(resolve=>{finish=()=>resolve({...row,id:'added'});});}});
  host.elements['[data-operia-search]'].dispatchEvent(new Event('submit',{cancelable:true}));await new Promise(resolve=>setImmediate(resolve));
  host.closest=()=>({dataset:{operiaAdd:'123456789'},disabled:false});host.dispatchEvent(new Event('click'));assert.equal(calls,1);
  host.elements['#operia-sort'].value='name';host.elements['#operia-sort'].dispatchEvent(new Event('change'));assert.match(host.elements['[data-operia-results]'].innerHTML,/disabled>Ajout en cours/);
  host.dispatchEvent(new Event('click'));assert.equal(calls,1);finish();await new Promise(resolve=>setImmediate(resolve));assert.match(host.elements['[data-operia-results]'].innerHTML,/Déjà dans le CRM/);
 }finally{finish?.();cleanup?.();globalThis.FormData=NativeFormData;}
});

for(const scenario of ['visible','hors filtre','actualisation échouée'])test(`ajout annuaire sans perdre la recherche : ${scenario}`,async()=>{
 class Element extends EventTarget{constructor(value=''){super();this.value=value;this.textContent='';this.innerHTML='';this.hidden=false;this.disabled=false;this.isConnected=true;this.dataset={operiaBrand:'operia'};}querySelector(s){return this.elements[s];}}
 const host=new Element(),selectors=['[data-operia-search-state]','[data-operia-submit]','[data-operia-cancel]','[data-operia-next]','[data-operia-search]','[data-operia-followup]','[data-operia-results]','[data-operia-results-tools]','[data-operia-search-limit]','[data-operia-followup-count]','[data-operia-kpi="contacts"]','[data-operia-kpi="complete"]','[data-operia-kpi="late"]','[data-operia-kpi="excluded"]','#operia-sort','#operia-created-after','#operia-followup-stage','#operia-followup-sort','#operia-department','#operia-query'];host.elements=Object.fromEntries(selectors.map(s=>[s,new Element()]));host.elements['#operia-followup-sort'].value='action';host.elements['#operia-sort'].value='oldest';host.elements['#operia-department'].value='91';host.elements['#operia-query'].value='Évry';
 const NativeFormData=globalThis.FormData;globalThis.FormData=class{get(key){return {department:'91',q:'Évry',naf:'all'}[key];}};
 let cleanup,requests=0,saved,reloads=0;
 try{
  cleanup=bindOperiaProspection({querySelector:()=>host},{brand:'operia',rows:[],visibleRows:[],canEdit:true,isRecordVisible:()=>scenario!=='hors filtre',fetchImpl:async()=>{requests++;return new Response(JSON.stringify({results:[publicCompany()],total_results:25,total_pages:2}));},onSave:async row=>(saved={...row,id:'added',owner_id:'u1'}),onReload:async()=>{reloads++;if(scenario==='actualisation échouée')throw Error('Réseau indisponible');return {rows:[saved],visibleRows:scenario==='hors filtre'?[]:[saved]};}});
  host.elements['[data-operia-search]'].dispatchEvent(new Event('submit',{cancelable:true}));await new Promise(resolve=>setImmediate(resolve));
  host.elements['#operia-created-after'].value='2020-01-01';host.elements['#operia-created-after'].dispatchEvent(new Event('change'));
  host.closest=()=>({dataset:{operiaAdd:'123456789'},disabled:false});host.dispatchEvent(new Event('click'));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requests,1);assert.equal(reloads,1);assert.equal(host.elements['#operia-query'].value,'Évry');assert.equal(host.elements['#operia-sort'].value,'oldest');assert.equal(host.elements['#operia-created-after'].value,'2020-01-01');
  assert.match(host.elements['[data-operia-results]'].innerHTML,/Déjà dans le CRM/);assert.equal(host.elements['[data-operia-next]'].hidden,false);
  assert.equal(host.elements['[data-operia-kpi="contacts"]'].textContent,scenario==='hors filtre'?'0':'1');
  assert.equal(host.elements['[data-operia-followup]'].innerHTML.includes('Société test'),scenario!=='hors filtre');
  if(scenario==='actualisation échouée'){assert.match(host.elements['[data-operia-search-state]'].textContent,/a été ajoutée/);assert.equal(host.elements['[data-operia-search-state]'].textContent.includes('Ajout impossible'),false);}
 }finally{cleanup?.();globalThis.FormData=NativeFormData;}
});
