import test from 'node:test';
import assert from 'node:assert/strict';
import {accessFor,assertRecordSave,appendCommercialNote} from '../access.mjs';
import {emptyOperia} from '../operia-domain.mjs';
import {exportOperiaBackup,openOperiaImport,openOperiaDraft} from '../operia-workflow.mjs';
const brand={id:'op',profile:'operia'},general={id:'nanaye',profile:'general'};
const contact=(extra={})=>({id:'own',brand_id:'op',kind:'contact',owner_id:'commercial',name:'Entreprise fictive',status:'À qualifier',source:'Source initiale',notes:'Note initiale',amount_cents:0,paid_cents:0,quantity:1,archived:false,related_id:null,metadata:{operia:emptyOperia()},...extra});
const access=(records,role='commercial',b=brand)=>accessFor({brand:b,role,userId:'commercial',records});
const change=(row,op)=>({...row,metadata:{...row.metadata,operia:{...row.metadata.operia,...op}}});
test('commercial scope is assignment based and cannot include another brand, archive or record kind',()=>{
 const own=contact(),other=contact({id:'other',owner_id:'owner'}),archived=contact({id:'archive',archived:true}),deal=contact({id:'deal',kind:'deal'}),foreign=contact({id:'foreign',brand_id:'nanaye'}),task=contact({id:'task',kind:'task',related_id:'own'}),hiddenLink=contact({id:'hidden-link',kind:'task',related_id:'other'});
 const rows=[own,other,archived,deal,foreign,task,hiddenLink],a=access(rows);
 assert.deepEqual(rows.filter(a.canRead).map(r=>r.id),['own','task']);
 assert.equal(a.canRead({...own,owner_id:'owner'}),false);
 for(const key of ['canManage','canAdmin','canExport','canSettings','canBrowseArchives','canMarkWon'])assert.equal(a[key],false);
 assert.equal(a.canCreate('contact'),true);assert.equal(a.canCreate('task'),true);assert.equal(a.canCreate('deal'),false);
 assert.equal(access(rows,'commercial',general).canAccess,false);
});
test('owner/editor/viewer keep existing general CRM rights',()=>{
 const row=contact({brand_id:'nanaye',kind:'order',owner_id:'someone',archived:true});
 for(const role of ['owner','editor','viewer']){
  const a=access([row],role,general);assert.equal(a.canRead(row),true);assert.equal(a.canExport,true);assert.equal(a.canSettings,true);assert.equal(a.canBrowseArchives,true);
  assert.equal(a.canEdit(row),role!=='viewer');assert.equal(a.canCreate('order'),role!=='viewer');assert.equal(a.canAdmin,role==='owner');
 }
 assert.equal(access([contact()],'editor').canMarkWon,true);
 assert.equal(accessFor({brand:general,userId:'commercial',records:[row]}).canAccess,false);
});
test('commercial may qualify own contact, edit coordinates and append notes',()=>{
 const old=contact(),a=access([old]),next=change({...old,email:'pro@example.test',phone:'0100000000',notes:appendCommercialNote(old.notes,'Appel réalisé','2026-11-16'),due_date:'2026-11-20'},{stage:'Contacté',nextAction:'Préparer la démo'});
 assert.equal(assertRecordSave(next,old,a,[old]),next);assert.match(next.notes,/^Note initiale\n\n\[2026-11-16\] Appel réalisé$/);
 assert.throws(()=>assertRecordSave({...old,notes:'Réécriture'},old,a),/notes existantes/);
});
test('protected fields and identity cannot be forged in a commercial save',()=>{
 const old=contact(),a=access([old]);
 for(const edit of [{owner_id:'owner'},{name:'Autre société'},{source:'Nouvelle origine'},{amount_cents:100},{paid_cents:1},{quantity:2},{archived:true},{related_id:'other'}])assert.throws(()=>assertRecordSave({...old,...edit},old,a,[old]));
 for(const op of [{siren:'123456789'},{originator:'Commercial'},{monthlyHtCents:10000},{legacy:{id:'forged'}}])assert.throws(()=>assertRecordSave(change(old,op),old,a,[old]));
 assert.throws(()=>assertRecordSave({...old,metadata:{...old.metadata,private:{x:1}}},old,a,[old]));
 assert.throws(()=>assertRecordSave({...old,id:'missing'},null,a,[old]));
 const hidden=contact({id:'hidden',owner_id:'owner'});assert.throws(()=>assertRecordSave(hidden,hidden,a,[old,hidden]));
});
test('new contacts and tasks belong to the commercial and links stay within own contacts',()=>{
 const old=contact(),a=access([old]),fresh={...contact(),id:undefined,source:'Annuaire',notes:''};
 assert.equal(assertRecordSave(fresh,null,a,[old]),fresh);
 for(const edit of [{owner_id:'owner'},{kind:'order'},{archived:true},{related_id:'own'},{metadata:{operia:{...emptyOperia(),originator:'Moi'}}}])assert.throws(()=>assertRecordSave({...fresh,...edit},null,a,[old]));
 const task={...fresh,kind:'task',name:'Appeler',status:'À faire',related_id:'own',metadata:{}};assert.equal(assertRecordSave(task,null,a,[old]),task);
 assert.throws(()=>assertRecordSave({...task,related_id:'hidden'},null,a,[old]));
});
test('commercial cannot win or undo an approved won state; opposition remains possible and irreversible',()=>{
 const old=contact(),a=access([old]);assert.throws(()=>assertRecordSave(change({...old,status:'Client'},{stage:'Gagné',monthlyHtCents:5000}),old,a,[old]),/valider/);
 const won=change({...old,status:'Client'},{stage:'Gagné',monthlyHtCents:5000}),aw=access([won]);
 assert.equal(assertRecordSave({...won,email:'new@example.test'},won,aw,[won]).status,'Client');
 assert.throws(()=>assertRecordSave(change({...won,status:'Qualifié'},{stage:'Perdu'}),won,aw,[won]),/validation/);
 const opposed=change({...won,status:'Ne plus contacter'},{stage:'Opposition'});assert.equal(assertRecordSave(opposed,won,aw,[won]).status,'Ne plus contacter');
 assert.throws(()=>assertRecordSave(won,opposed,access([opposed]),[opposed]));
});
test('commercial account history is append-only and never accepts a receipt',()=>{
 const event={id:'a1',kind:'Note',at:'2026-11-15',note:'Ancien',source:'Appel',amountHtCents:null},old=change(contact(),{activities:[event]}),a=access([old]);
 const extra={id:'a2',kind:'Démo tenue',at:'2026-11-16',note:'Démo effectuée',source:'Visio',amountHtCents:null};
 assert.equal(assertRecordSave(change(old,{activities:[event,extra]}),old,a,[old]).metadata.operia.activities.length,2);
 for(const activities of [[],[{...event,note:'Réécrit'}],[event,{...extra,kind:'Paiement reçu'}],[event,{...extra,amountHtCents:100}]])assert.throws(()=>assertRecordSave(change(old,{activities}),old,a,[old]));
});
test('bulk operations are denied before producing files or opening an import; unrelated drafts never load',async()=>{
 assert.throws(()=>exportOperiaBackup(brand,{},{role:'commercial'}),/réservée/);
 assert.throws(()=>openOperiaImport({brand,role:'commercial'}),/réservé/);
 assert.throws(()=>openOperiaImport({brand}),/réservé/);
 let loads=0;const hidden=contact({owner_id:'other'});
 await assert.rejects(openOperiaDraft({record:hidden,brand,access:access([hidden]),store:{loadDraft:()=>{loads++;}}}),/votre accès/);assert.equal(loads,0);
});
