import {escapeHTML as e} from './domain.mjs';
const status={prepared:'Préparé · non envoyé',sending:'En cours ou résultat à vérifier dans Gmail',sent:'Envoyé via Gmail',unknown:'Résultat à vérifier dans Gmail · ne pas renvoyer'};
export async function previewMail({store,input,container}){
 container.textContent='Préparation de la prévisualisation…';
 try{
  const message=await store.mail('prepare',input);if(!container.isConnected)return;
  container.innerHTML=`<section class="scan-panel"><h3>Confirmer cet envoi</h3><p><strong>De :</strong> commercial.nanaye@gmail.com<br><strong>À :</strong> ${e(message.recipient)}<br><strong>Effectué par :</strong> ${e(message.actor_name)}<br><strong>Objet :</strong> ${e(message.subject)}<br><strong>Pièce jointe :</strong> ${message.attachment?'Plaquette EVJF · PDF':'Aucune'}</p><pre style="white-space:pre-wrap;font:inherit">${e(message.body)}</pre><p class="note">Cette prévisualisation est figée. Pour modifier le contenu, préparez une nouvelle prévisualisation.</p><p class="mail-result" role="status">${e(status[message.status]||message.status)}</p><label class="checkrow"><input type="checkbox" class="mail-approve"> Je confirme le destinataire, le contenu et la pièce jointe.</label><button class="mail-send primary" disabled>Envoyer ce message maintenant</button><p class="note muted">Un envoi confirmé ne prouve ni la livraison ni la lecture. Aucun renvoi automatique en cas d’incertitude.</p></section>`;
  if(input.test){
   const sync=document.createElement('button'),replies=document.createElement('div');sync.type='button';sync.textContent='Vérifier les réponses à ce test';container.append(sync,replies);
   sync.onclick=async()=>{sync.disabled=true;try{await store.mail('sync',{test_id:message.id});const rows=await store.mail('test-history',{id:message.id});replies.textContent=rows.length?rows.map(x=>x.sender+' : '+x.snippet).join('\n'):'Aucune réponse enregistrée pour ce test.';}catch(err){replies.textContent=err.message;}finally{sync.disabled=false;}};
  }
  const button=container.querySelector('.mail-send'),check=container.querySelector('.mail-approve'),result=container.querySelector('.mail-result');
  check.disabled=message.status!=='prepared';check.onchange=()=>button.disabled=!check.checked;
  button.onclick=async()=>{
   if(!check.checked)return;button.disabled=true;check.disabled=true;result.textContent='Envoi en cours…';
   try{const sent=await store.mail('send',{id:message.id,confirm:true});result.textContent=status[sent.status]||'Résultat à vérifier dans Gmail.';}
   catch(err){result.textContent=err.message+' Consultez l’historique avant toute autre action.';}
  };
 }catch(err){if(container.isConnected)container.textContent=err.message;}
}
export function mailHistoryMarkup(){return '<section class="scan-panel"><h3>E-mails de ce contact</h3><p class="note">Historique partagé des envois du CRM et aperçus des messages de leurs fils Gmail. Aucun accès aux boîtes personnelles. Les messages reçus peuvent aussi être des réponses automatiques.</p><button type="button" id="mail-sync">Rechercher les réponses</button><p id="mail-check" role="status"></p><div id="mail-history"></div></section>';}
export async function bindMailHistory({dialog,store,record,canEdit}){
 const host=dialog.querySelector('#mail-history'),button=dialog.querySelector('#mail-sync'),label=dialog.querySelector('#mail-check');if(!host)return;
 const load=async()=>{const data=await store.mailHistory(record.brand_id,record.id);if(!host.isConnected)return;
 host.innerHTML=data.sent.map(x=>`<details><summary>${e(status[x.status]||x.status)} · ${e(x.subject)}</summary><p class="note">${e(x.actor_name)} → ${e(x.recipient)} · ${e(new Date(x.sent_at||x.created_at).toLocaleString('fr-FR'))}${x.attachment?' · PDF EVJF joint/prévu':''}</p><pre style="white-space:pre-wrap;font:inherit">${e(x.body)}</pre></details>`).join('')+data.received.filter(x=>x.direction==='incoming').map(x=>`<details><summary>Message reçu · ${e(x.subject)}</summary><p class="note">${e(x.sender)} · ${e(new Date(x.received_at).toLocaleString('fr-FR'))}</p><p>${e(x.snippet)}</p><p class="note muted">Aperçu seulement. Consultez la boîte commerciale pour le message complet et ses pièces jointes.</p></details>`).join('')||'<p>Aucun échange enregistré pour ce contact.</p>';};
 button.disabled=!canEdit;
 button.onclick=async()=>{button.disabled=true;label.textContent='Recherche dans les fils suivis…';try{const r=await store.mail('sync',{contact_id:record.id});await load();label.textContent=`${r.processed} fil(s) vérifié(s) · ${new Date(r.checkedAt).toLocaleString('fr-FR')}${r.truncated?' · Limite atteinte : consultez Gmail pour la suite.':''}`;}catch(err){label.textContent=err.message;}finally{if(button.isConnected)button.disabled=!canEdit;}};
 try{await load();}catch(err){if(host.isConnected)host.textContent=err.message;}
}
