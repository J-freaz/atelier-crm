import {escapeHTML as e,validate} from './domain.mjs';
import {planLegacyImport,operiaOf,isExcluded,isOperiaBrand} from './operia-domain.mjs';

export function exportOperiaBackup(brand,data){
 if(!isOperiaBrand(brand))throw Error('Sélectionnez un espace Opéria.');
 const value={format:'atelier-operia-backup-v1',exportedAt:new Date().toISOString(),brand,
  records:data.records.filter(r=>r.brand_id===brand.id),events:data.events.filter(r=>r.brand_id===brand.id)};
 const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='atelier-operia-'+new Date().toISOString().slice(0,10)+'.json';a.click();URL.revokeObjectURL(url);
}

export function openOperiaImport({dialog,brand,records,user,store,onDone,isCurrent}){
 if(!isOperiaBrand(brand))throw Error('Sélectionnez un espace Opéria.');
 dialog.innerHTML=`<h2>Reprendre l’ancien outil Opéria</h2><p>Destination : <strong>${e(brand.name)}</strong>. Les fiches, sources, dates et actions de l’ancien export seront conservées. Les doublons ne sont pas écrasés.</p><label for="operia-file">Sauvegarde JSON de l’ancien outil</label><input id="operia-file" type="file" accept=".json,application/json"><p class="note">Ce fichier est lu dans votre navigateur. L’enregistrement dans cet espace privé intervient après vérification. Aucun message n’est envoyé.</p><div id="operia-preview"></div><p id="operia-import-error" class="error" role="status"></p><div class="form-footer"><button id="operia-close">Fermer</button><button id="operia-confirm" class="primary" disabled>Importer dans cet espace</button></div>`;
 dialog.showModal();const q=id=>dialog.querySelector('#'+id);let plan=null,running=false;
 const cancel=ev=>{if(running)ev.preventDefault();};dialog.addEventListener('cancel',cancel);
 q('operia-close').onclick=()=>{if(!running){dialog.removeEventListener('cancel',cancel);dialog.close();}};
 q('operia-file').onchange=async()=>{plan=null;q('operia-confirm').disabled=true;q('operia-preview').textContent='';q('operia-import-error').textContent='';try{
  const file=q('operia-file').files[0];if(!file)return;if(file.size>8*1024*1024)throw Error('Le fichier dépasse 8 Mo. Préparez un export plus petit.');
  const source=JSON.parse(await file.text());plan=planLegacyImport(source,{brandId:brand.id,existingRecords:records});
  for(const r of plan.create)validate(r);
  q('operia-preview').innerHTML=`<section class="scan-panel"><strong>${plan.create.length} nouvelle(s) entreprise(s)</strong><p>${plan.skip.length} doublon(s) ou dossier(s) hors Opéria conservés sans écrasement · ${plan.suppress.length} opposition(s) à reporter · ${plan.conflicts.length} conflit(s).</p><ul>${plan.create.slice(0,20).map(r=>`<li>${e(r.name)} · ${e(operiaOf(r).stage)} · ${e(operiaOf(r).siren||'SIREN à vérifier')}</li>`).join('')}</ul>${plan.conflicts.map(c=>`<p class="error">${e(c.name)} : ${e(c.reason)}</p>`).join('')}${plan.warnings.map(w=>`<p class="note">${e(w)}</p>`).join('')}<p class="note">Le responsable sera ${e(user.display_name||'le compte connecté')}. Aucun apporteur ni taux de commission ne sera inventé. Les montants HT restent séparés des commandes TTC.</p></section>`;
  q('operia-confirm').disabled=plan.conflicts.length>0||!plan.create.length&&!plan.suppress.length;
 }catch(err){q('operia-import-error').textContent=err.message;}};
 q('operia-confirm').onclick=async()=>{
  if(!plan||running||plan.conflicts.length)return;if(!isCurrent()){q('operia-import-error').textContent='L’espace sélectionné a changé. Fermez puis rouvrez l’import.';return;}
  running=true;q('operia-confirm').disabled=true;q('operia-file').disabled=true;q('operia-close').disabled=true;let created=0,suppressed=0;
  try{
   for(const r of plan.suppress){if(!isCurrent())throw Error('L’espace sélectionné a changé.');await store.save(r);suppressed++;}
   for(const r of plan.create){if(!isCurrent())throw Error('L’espace sélectionné a changé.');await store.save({...r,owner_id:user.id});created++;q('operia-import-error').textContent=`${created} / ${plan.create.length} entreprise(s) enregistrée(s)…`;}
   q('operia-preview').innerHTML=`<section class="scan-panel"><strong>Transfert enregistré</strong><p>${created} entreprise(s) et ${suppressed} opposition(s) reprises dans ${e(brand.name)}. L’ancien outil a été conservé.</p></section>`;
   q('operia-import-error').textContent='';plan=null;await onDone();
  }catch(err){q('operia-import-error').textContent=`${created} entreprise(s) et ${suppressed} opposition(s) enregistrées avant l’arrêt. ${err.message} Fermez puis rouvrez l’import : les fiches déjà reprises seront reconnues.`;await onDone();}
  finally{running=false;q('operia-close').disabled=false;dialog.removeEventListener('cancel',cancel);}
 };
}

export function buildOperiaDraft(record,sender){
 const o=operiaOf(record);
 if(isExcluded(record)||o.registryStatus==='C')throw Error('Ce dossier est exclu de la prospection.');
 const observed=o.businessEvidence&&/^https:\/\//.test(o.businessSource)?`Votre site présente l’activité suivante : ${o.businessEvidence}\nSource : ${o.businessSource}\n\n`:'';
 return {subject:'Organisation des prestations de nettoyage — '+record.name,
 body:`Bonjour,\n\n${observed}Je vous contacte au sujet d’Opéria, une solution de suivi des sites, des équipes et des signalements pour les entreprises de propreté.\n\nComment gérez-vous actuellement les plannings et le suivi des prestations ? Si ce sujet vous concerne, nous pouvons organiser un court échange, puis une démonstration adaptée à votre organisation. Le périmètre et les options seront précisés ensemble.\n\n${sender}\n[Organisation représentée et coordonnées à compléter]\n\n${o.contactSource?'Source des coordonnées professionnelles : '+o.contactSource+'\n':''}[Information sur le traitement des données et exercice des droits à compléter]\nSi vous ne souhaitez pas être recontacté, indiquez-le simplement en réponse.`};
}

export async function openOperiaDraft({dialog,record,brand,members,user,store,demo,canEdit,back,isCurrent=()=>true}){
 if(isExcluded(record)||operiaOf(record).registryStatus==='C')throw Error('Ce dossier est exclu de la prospection.');
 const team=members.filter(m=>m.brand_id===brand.id),sender=team.find(m=>m.user_id===user.id)?.display_name||'Votre nom';
 let saved=await store.loadDraft(brand.id,record.id),saving=false;
 if(!isCurrent())return;
 const draft=saved||buildOperiaDraft(record,sender);
 dialog.innerHTML=`<div class="panel-head"><h2>Brouillon Opéria · ${e(record.name)}</h2><button id="op-draft-close" aria-label="Fermer">✕</button></div><p class="note">Personnalisez le message, vérifiez les sources et complétez les mentions entre crochets. Aucun envoi n’est proposé depuis la boîte Nanayé.</p><label for="op-recipient">Destinataire</label><input type="email" id="op-recipient" value="${e(saved?.recipient||record.email)}"><label for="op-signature">Signature</label><input id="op-signature" maxlength="100" value="${e(saved?.signature||sender)}"><label for="op-subject">Objet</label><input id="op-subject" value="${e(draft.subject)}"><label for="op-body">Message</label><textarea id="op-body" style="width:100%;min-height:300px">${e(draft.body)}</textarea><label class="checkrow"><input type="checkbox" id="op-reviewed"> J’ai vérifié le contenu, les sources et les mentions à compléter.</label><p id="op-draft-state" role="status" class="note">${saved?'Brouillon enregistré retrouvé.':'Le premier échange sert à qualifier le besoin. Il ne présume pas l’absence de logiciel.'}</p><div class="form-footer"><button id="op-back">Retour à la fiche</button>${canEdit?'<button id="op-save">Enregistrer le brouillon</button>':''}<button id="op-copy" class="primary" disabled>Copier le message</button></div>`;
 const q=id=>dialog.querySelector('#'+id),snapshot=()=>JSON.stringify({recipient:q('op-recipient').value,signature:q('op-signature').value,subject:q('op-subject').value,body:q('op-body').value});let baseline=snapshot();
 const leave=()=>snapshot()===baseline||confirm('Quitter sans enregistrer les modifications du brouillon ?');
 const cancel=ev=>{if(!leave())ev.preventDefault();else dialog.removeEventListener('cancel',cancel);};dialog.addEventListener('cancel',cancel);
 q('op-draft-close').onclick=()=>{if(leave()){dialog.removeEventListener('cancel',cancel);dialog.close();}};
 q('op-back').onclick=()=>{if(leave()){dialog.removeEventListener('cancel',cancel);back();}};
 q('op-reviewed').onchange=()=>{q('op-copy').disabled=!q('op-reviewed').checked;};
 for(const id of ['op-recipient','op-signature','op-subject','op-body'])q(id).oninput=()=>{q('op-reviewed').checked=false;q('op-copy').disabled=true;};
 q('op-copy').onclick=async()=>{try{await navigator.clipboard.writeText('Objet : '+q('op-subject').value+'\n\n'+q('op-body').value);q('op-draft-state').textContent='Copié. Aucun message envoyé.';}catch{q('op-draft-state').textContent='Sélectionnez le texte pour le copier.';}};
 if(q('op-save'))q('op-save').onclick=async()=>{if(saving)return;saving=true;q('op-save').disabled=true;const captured=snapshot();try{saved=await store.saveDraft({...JSON.parse(captured),brand_id:brand.id,contact_id:record.id,id:saved?.id,version:saved?.version});baseline=captured;q('op-draft-state').textContent='Brouillon enregistré. Aucun message envoyé.';}catch(err){q('op-draft-state').textContent=err.message;}finally{saving=false;if(q('op-save'))q('op-save').disabled=false;}};
}
