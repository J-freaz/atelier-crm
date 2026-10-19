import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyOperia,normalizeOperia,validateOperia,fromLegacyLead,planLegacyImport,qualification,commercialPriority,operiaOf,operiaMetrics,byCreation,dateOnly} from '../operia-domain.mjs';
const now=Date.parse('2026-10-16T12:00:00Z');
const source={id:'legacy-1',name:'Entreprise fictive',siren:'123456789',product:'Operia',stage:'À qualifier',monthly:null,registryStatus:'A',registryDate:'2026-10-15',registrySource:'https://annuaire-entreprises.data.gouv.fr/',email:'test@example.org',created:'2026-09-01',updated:'2026-09-02',notes:'Historique existant',fit:{sites:null,agents:null}};
const lead=(overrides={})=>fromLegacyLead({...source,...overrides},{brandId:'brand-1'});
test('legacy import preserves source dates and unknown financial amounts without assigning owner or originator',()=>{
 const r=lead();assert.equal(r.owner_id,null);assert.equal(r.metadata.operia.originator,'');assert.equal(r.metadata.operia.monthlyHtCents,null);assert.equal(r.amount_cents,0);assert.equal(r.paid_cents,0);assert.equal(r.metadata.operia.legacy.created,'2026-09-01');assert.equal(r.notes,'Historique existant');
});
test('source monthly euros and activity cents stay distinct from native TTC fields',()=>{
 const r=fromLegacyLead({...source,monthly:129.99},{brandId:'brand-1',activities:[{id:'paid1',leadId:source.id,kind:'Paiement reçu',at:'2026-10-15',amount:12999}]});
 assert.equal(operiaOf(r).monthlyHtCents,12999);assert.equal(operiaOf(r).activities[0].amountHtCents,12999);assert.equal(r.amount_cents,0);assert.equal(operiaMetrics([r],{now}).receivedHtCents,12999);
});
test('bad source financial amounts and malformed SIREN are rejected rather than silently discarded',()=>{
 for(const monthly of [-1,1.234,'abc',Infinity])assert.throws(()=>lead({monthly}),/Montant/);
 assert.throws(()=>lead({siren:'12345678'}),/SIREN/);
 assert.throws(()=>fromLegacyLead(source,{brandId:'b',activities:[{leadId:source.id,kind:'Paiement reçu',amount:-1}]}),/Montant/);
 assert.throws(()=>validateOperia({monthlyHtCents:1.5}),/Abonnement/);
});
test('missing proof does not invent qualification or prevent a first qualification call',()=>{
 const r=lead();const q=qualification(r,now);assert.equal(q.score,25);assert.equal(q.complete,false);assert.equal(q.firstContactAllowed,true);assert.equal(commercialPriority(r,now).label,'À documenter');
});
test('future and stale dates never count as current evidence; recent incorporation is not a need',()=>{
 for(const registryDate of ['2026-10-17','2026-01-01'])assert.equal(qualification(lead({registryDate,creationDate:'2026-10-15'}),now).checks[0].ok,false);
 assert.equal(commercialPriority(lead({creationDate:'2026-10-15'}),now).rank,4);
});
test('native opposition wins over editable metadata and completeness',()=>{
 const r=lead();r.status='Ne plus contacter';r.metadata.operia.stage='Contacté';assert.equal(qualification(r,now).firstContactAllowed,false);assert.equal(commercialPriority(r,now).label,'Hors prospection');assert.equal(operiaMetrics([r],{now}).opposed,1);
});
test('registry cessation excludes first contact',()=>assert.equal(qualification(lead({registryStatus:'C'}),now).firstContactAllowed,false));
test('inbound export is idempotent by SIREN, legacy source/id and email without cross-brand collisions',()=>{
 const exportFile={source:'source-1',leads:[source]};const p=planLegacyImport(exportFile,{brandId:'brand-1'});assert.equal(p.create.length,1);
 const existing={...p.create[0],id:'crm-1'};assert.equal(planLegacyImport(exportFile,{brandId:'brand-1',existingRecords:[existing]}).create.length,0);
 assert.equal(planLegacyImport(exportFile,{brandId:'brand-2',existingRecords:[existing]}).create.length,1);
 assert.equal(planLegacyImport({leads:[source,{...source,id:'another-id',name:'Nouvelle dénomination'}]},{brandId:'brand-1'}).create.length,1);
});
test('existing archive and opposition are not recreated or overwritten',()=>{
 const existing={...lead(),id:'crm-1',archived:true,status:'Ne plus contacter',notes:'Opposition datée'};
 const p=planLegacyImport({leads:[source]},{brandId:'brand-1',existingRecords:[existing]});assert.equal(p.create.length,0);assert.equal(p.suppress.length,0);assert.equal(existing.notes,'Opposition datée');assert.equal(existing.archived,true);
});
test('imported opposition suppresses an existing account without replacing its commercial history',()=>{
 const existing={...lead(),id:'crm-1',notes:'Historique local',version:7};
 const p=planLegacyImport({leads:[{...source,stage:'Opposition'}]},{brandId:'brand-1',existingRecords:[existing]});assert.equal(p.suppress.length,1);assert.equal(p.suppress[0].notes,'Historique local');assert.equal(p.suppress[0].version,7);assert.equal(p.suppress[0].status,'Ne plus contacter');assert.equal(existing.status,'À qualifier');
});
test('different SIRENs sharing a name are held for manual reconciliation',()=>{
 const p=planLegacyImport({leads:[source,{...source,id:'2',siren:'987654321'}]},{brandId:'brand-1'});assert.equal(p.create.length,1);assert.equal(p.conflicts.length,1);
});
test('partial bad export rows and other products are reported without losing valid rows',()=>{
 const p=planLegacyImport({leads:[source,null,{...source,product:'Kopra PRO'}]},{brandId:'b'});assert.equal(p.create.length,1);assert.equal(p.skip.length,1);assert.equal(p.conflicts.length,1);
});
test('an orphan payment blocks the entire import before any company or suppression is planned',()=>{
 const p=planLegacyImport({leads:[source],events:[{id:'payment-orphan',leadId:'missing-lead',kind:'Paiement reçu',at:'2026-10-15',amount:12999}]},{brandId:'brand-1'});
 assert.equal(p.conflicts.length,1);assert.match(p.conflicts[0].reason,/orpheline/);assert.equal(p.create.length,0);assert.equal(p.suppress.length,0);assert.equal(p.conflicts[0].name,'payment-orphan');
});
test('lead_id is an explicit supported alias and retains the payment exactly once',()=>{
 const p=planLegacyImport({leads:[source],events:[{id:'payment-alias',lead_id:source.id,kind:'Paiement reçu',at:'2026-10-15',amount:12999}]},{brandId:'brand-1'});
 assert.equal(p.conflicts.length,0);assert.equal(p.create.length,1);assert.equal(operiaOf(p.create[0]).activities.length,1);assert.equal(operiaMetrics(p.create,{now}).receivedHtCents,12999);
});
test('conflicting activity aliases and malformed history are blocking conflicts',()=>{
 const conflict=planLegacyImport({leads:[source],events:[{leadId:source.id,lead_id:'different',kind:'Note'}]},{brandId:'brand-1'});assert.equal(conflict.create.length,0);assert.match(conflict.conflicts[0].reason,/contredisent/);
 const malformed=planLegacyImport({leads:[source],events:{}},{brandId:'brand-1'});assert.equal(malformed.create.length,0);assert.match(malformed.conflicts[0].reason,/liste/);
 const alternate=planLegacyImport({leads:[source],events:[],activities:[{lead_id:'missing',kind:'Paiement reçu',amount:100}]},{brandId:'brand-1'});assert.equal(alternate.create.length,0);assert.match(alternate.conflicts[0].reason,/orpheline/);
});
test('only recorded activities count as contacts/demos/payments; statuses do not fake events',()=>{
 const r=lead({stage:'Gagné',monthly:100});const m=operiaMetrics([r],{now});assert.equal(m.won,1);assert.equal(m.signedMonthlyHtCents,10000);assert.equal(m.receivedHtCents,0);assert.equal(m.contacted,0);assert.equal(m.demos,0);
});
test('unknown monthly amounts and receipts are distinguished from actual zero euros',()=>{
 const r=lead({stage:'Gagné'});r.metadata.operia.activities=[{id:'unknown',kind:'Paiement reçu',at:'2026-10-16',amountHtCents:null}];const m=operiaMetrics([r],{now});assert.equal(m.signedMonthlyUnknown,1);assert.equal(m.receiptsUnknown,1);assert.equal(operiaMetrics([lead({monthly:0})],{now}).pipelineMonthlyUnknown,0);
});
test('period includes the full final day; duplicate source events cannot double receipts',()=>{
 const a={id:'a',kind:'Paiement reçu',at:'2026-10-16T22:00:00Z',amountHtCents:12000,source:'old'};
 const r=lead();r.metadata.operia.activities=[a,a,{...a,id:'b',at:'2026-10-17T00:00:00Z'}];
 assert.equal(operiaMetrics([r],{now,from:'2026-10-16',to:'2026-10-16'}).receivedHtCents,12000);
});
test('date sorting puts unknown dates last, with real calendar dates only',()=>{
 assert.equal(dateOnly('2026-02-31'),'');const rows=[lead({name:'Unknown'}),lead({name:'Old',creationDate:'2010-01-01'}),lead({name:'New',creationDate:'2026-01-01'})];assert.deepEqual(rows.sort(byCreation).map(r=>r.name),['New','Old','Unknown']);
});
test('normalization is pure and defaults do not share mutable activities',()=>{
 const a=emptyOperia(),b=emptyOperia();a.activities.push({id:'a'});assert.equal(b.activities.length,0);assert.deepEqual(normalizeOperia({fit:{sites:'2'}}).fit.sites,2);
});
