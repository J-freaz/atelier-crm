import {escapeHTML as e, day, cents} from './domain.mjs';
import {OPERIA_STAGES, ORGANIZATIONS, EVIDENCE_KINDS, BUDGETS, ACTIVITY_KINDS, operiaOf, normalizeOperia, qualification, commercialPriority, isExcluded, contactStatusForStage, dateOnly as validatedDate} from './operia-domain.mjs';

export const OPERIA_NAF = Object.freeze({'81.21Z':'Nettoyage courant des bâtiments','81.22Z':'Nettoyage spécialisé et industriel','81.29B':'Autres activités de nettoyage'});
const SEARCH_ENDPOINT='https://recherche-entreprises.api.gouv.fr/search';
const MAX_PAGES=10;
const EFFECTIFS={'00':'0 salarié','01':'1–2 salariés','02':'3–5 salariés','03':'6–9 salariés','11':'10–19 salariés','12':'20–49 salariés','21':'50–99 salariés','22':'100–199 salariés','31':'200–249 salariés','32':'250–499 salariés','41':'500–999 salariés','42':'1 000–1 999 salariés','51':'2 000–4 999 salariés','52':'5 000–9 999 salariés','53':'10 000 salariés et plus'};
const text=(v,max=500)=>String(v??'').trim().slice(0,max);
const dateOnly=v=>validatedDate(String(v??''));
const isOpposed=r=>r?.status==='Ne plus contacter'||operiaOf(r).stage==='Opposition';
const dateLabel=v=>dateOnly(String(v??'').slice(0,10))?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('fr-FR'):'Non renseignée';
const safeURL=v=>{try{const u=new URL(v);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}};
const external=(url,label)=>safeURL(url)?`<a href="${e(safeURL(url))}" target="_blank" rel="noopener noreferrer">${e(label)}</a>`:e(label);
const options=(values,current)=>values.map(v=>`<option value="${e(v)}" ${v===current?'selected':''}>${e(v)}</option>`).join('');
const brandId=ctx=>typeof ctx.brand==='string'?ctx.brand:ctx.brand?.id;
export function registryDepartment(establishment){
 const direct=text(establishment?.departement,3).toUpperCase();
 if(/^(?:\d{2}|2A|2B|97\d|98\d)$/.test(direct))return direct;
 // The live API omits departement on matching_etablissements, even when requested.
 // INSEE commune codes preserve department borders (unlike some postal codes).
 const commune=text(establishment?.commune,5).toUpperCase();
 if(/^2[AB]\d{3}$/.test(commune))return commune.slice(0,2);
 if(/^\d{5}$/.test(commune))return /^(97|98)/.test(commune)?commune.slice(0,3):commune.slice(0,2);
 return '';
}

// API documentation reviewed 2026-10-16: per_page <= 25. Exact SIREN/SIRET
// searches ignore remote filters, so the returned status/NAF/location is checked again.
// https://recherche-entreprises.api.gouv.fr/docs/
export function operiaSearchURL({department='91',q='',naf=Object.keys(OPERIA_NAF),page=1}={}){
 const dep=text(department).toUpperCase().replace(/\s/g,'');
 if(!/^(?:\d{2}|2A|2B|97\d)(?:,(?:\d{2}|2A|2B|97\d))*$/.test(dep)||dep.split(',').length>5)throw Error('Renseignez de 1 à 5 départements, par exemple 91 ou 91,77.');
 const codes=[...new Set(Array.isArray(naf)?naf:[])].filter(n=>Object.hasOwn(OPERIA_NAF,n));
 if(!codes.length)throw Error('Choisissez au moins une activité de nettoyage.');
 if(!Number.isInteger(page)||page<1||page>MAX_PAGES)throw Error('Cette recherche est limitée à 10 pages. Précisez le département ou le nom pour continuer.');
 const url=new URL(SEARCH_ENDPOINT);
 url.search=new URLSearchParams({departement:dep,activite_principale:codes.join(','),etat_administratif:'A',per_page:'25',page:String(page),minimal:'true',include:'siege,matching_etablissements',...(text(q,100)?{q:text(q,100)}:{})}).toString();
 return url.toString();
}

export function registryCandidates(payload,filters={},at=new Date().toISOString()){
 if(!payload||!Array.isArray(payload.results))throw Error('La réponse de l’annuaire est incomplète. Réessayez plus tard.');
 const deps=text(filters.department||'91').toUpperCase().replace(/\s/g,'').split(',');
 const codes=filters.naf||Object.keys(OPERIA_NAF),seen=new Set();
 return payload.results.filter(r=>r&&r.statut_diffusion==='O'&&r.etat_administratif==='A'&&codes.includes(r.activite_principale)&&/^\d{9}$/.test(String(r.siren))).flatMap(r=>{
  if(seen.has(r.siren))return [];seen.add(r.siren);
  const local=[...(Array.isArray(r.matching_etablissements)?r.matching_etablissements:[]),r.siege].find(s=>s&&s.etat_administratif==='A'&&s.statut_diffusion_etablissement==='O'&&deps.includes(registryDepartment(s)));
  if(!local)return [];
  const name=text(r.nom_complet||r.nom_raison_sociale,200);if(!name)return [];
  return [{name,siren:String(r.siren),creationDate:dateOnly(r.date_creation),city:text(local.libelle_commune,150),naf:r.activite_principale,employees:(EFFECTIFS[r.tranche_effectif_salarie]||'Effectif non renseigné')+(r.annee_tranche_effectif_salarie?' · '+text(r.annee_tranche_effectif_salarie,4):''),registryStatus:'A',registryDate:at,registrySource:'https://annuaire-entreprises.data.gouv.fr/entreprise/'+r.siren}];
 });
}

export async function searchOperiaRegistry(filters,{signal,fetchImpl=globalThis.fetch}={}){
 const source=operiaSearchURL(filters),controller=new AbortController();
 let timedOut=false;
 const abort=()=>controller.abort();
 if(signal?.aborted)controller.abort();else signal?.addEventListener('abort',abort,{once:true});
 const timeout=setTimeout(()=>{timedOut=true;controller.abort();},20000);
 try{
  const response=await fetchImpl(source,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer',headers:{Accept:'application/json'}});
  if(!response.ok){
   if(response.status===429){const raw=response.headers?.get('Retry-After');const seconds=/^\d+$/.test(raw||'')?Number(raw):Math.ceil((Date.parse(raw)-Date.now())/1000);const err=Error('L’annuaire est très sollicité. Attendez avant de relancer la recherche. Vos fiches restent accessibles.');err.retryAfter=Math.max(60,Math.min(Number.isFinite(seconds)?seconds:60,3600));throw err;}
   throw Error(response.status===400?'Ces critères ne sont pas acceptés par l’annuaire. Vérifiez le département et le nom.':'L’annuaire officiel est indisponible. Réessayez plus tard ; vos fiches restent accessibles.');
  }
  const payload=await response.json(),at=new Date().toISOString();
  return {results:registryCandidates(payload,filters,at),total:Number(payload.total_results)||0,pages:Math.max(1,Number(payload.total_pages)||1),page:filters.page||1,source,at,received:payload.results.length};
 }catch(err){
  if(timedOut)throw Error('L’annuaire n’a pas répondu en 20 secondes. Réessayez plus tard.');
  if(err instanceof SyntaxError)throw Error('L’annuaire a renvoyé une réponse illisible. Réessayez plus tard.');
  if(err.name==='AbortError'||err.retryAfter||!(err instanceof TypeError))throw err;
  throw Error('La connexion à l’annuaire a échoué. Vérifiez votre réseau ou réessayez plus tard.');
 }finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
}

export function registryContact(candidate,{brand,ownerId=null}={}){
 if(!brand||!/^\d{9}$/.test(candidate?.siren)||candidate.registryStatus!=='A')throw Error('Entreprise ou espace de marque invalide.');
 return {brand_id:brand,kind:'contact',name:candidate.name,status:'À qualifier',owner_id:ownerId,email:'',phone:'',website:'',source:'Annuaire des Entreprises · '+candidate.registrySource,notes:'Entreprise repérée dans l’annuaire officiel. Activité, interlocuteur, coordonnées et besoin à qualifier.',due_date:null,amount_cents:0,paid_cents:0,quantity:1,related_id:null,archived:false,metadata:{operia:normalizeOperia({...candidate,stage:'À qualifier'})}};
}

function existingCandidate(rows,candidate,id){
 return rows.find(r=>r.kind==='contact'&&r.brand_id===id&&(operiaOf(r).siren===candidate.siren||r.name?.trim().toLocaleLowerCase('fr')===candidate.name.trim().toLocaleLowerCase('fr')));
}
export function sortRegistryCandidates(rows,{creationAfter='',sort='recent'}={}){
 return rows.filter(r=>!creationAfter||(r.creationDate&&r.creationDate>=creationAfter)).slice().sort((a,b)=>{
  if(sort==='name')return a.name.localeCompare(b.name,'fr');
  if(!a.creationDate)return b.creationDate?1:0;if(!b.creationDate)return -1;
  return sort==='oldest'?a.creationDate.localeCompare(b.creationDate):b.creationDate.localeCompare(a.creationDate);
 });
}

function prospectionCounts(rows,id){
 const contacts=rows.filter(r=>r.brand_id===id&&r.kind==='contact'&&!r.archived),usable=contacts.filter(r=>!isExcluded(r));
 return {contacts:contacts.length,excluded:contacts.filter(isExcluded).length,complete:usable.filter(r=>qualification(r).complete).length,late:usable.filter(r=>r.due_date&&r.due_date<day()&&!['Gagné','Perdu'].includes(operiaOf(r).stage)).length};
}
function replacePreservingFocus(container,html,rows,id){
 const focused=container.ownerDocument?.activeElement;
 let key=null;
 if(focused&&container.contains?.(focused)){
  if(focused.dataset?.operiaOpen)key={open:focused.dataset.operiaOpen};
  else if(focused.dataset?.operiaAdd){const siren=focused.dataset.operiaAdd;const saved=rows.find(r=>r.brand_id===id&&r.kind==='contact'&&operiaOf(r).siren===siren);key=saved?.id?{open:saved.id}:{add:siren};}
 }
 container.innerHTML=html;
 if(key){const button=[...(container.querySelectorAll?.('button')||[])].find(b=>key.open?b.dataset.operiaOpen===key.open:b.dataset.operiaAdd===key.add);button?.focus?.({preventScroll:true});}
}
export function renderOperiaProspection(ctx){
 const id=brandId(ctx),counts=prospectionCounts(ctx.visibleRows||ctx.rows||[],id);
 return `<div class="operia-workspace" data-operia-brand="${e(id)}"><div class="kpis operia-kpis"><div class="kpi"><span>Entreprises suivies</span><strong data-operia-kpi="contacts">${counts.contacts}</strong><span class="muted">Dans cet espace Opéria</span></div><div class="kpi"><span>Qualification complète</span><strong data-operia-kpi="complete">${counts.complete}</strong><span class="muted">Besoin et preuves renseignés</span></div><div class="kpi"><span>Échéances dépassées</span><strong data-operia-kpi="late">${counts.late}</strong><span class="muted">Hors dossiers clos et opposition</span></div><div class="kpi"><span>Oppositions / exclusions</span><strong data-operia-kpi="excluded">${counts.excluded}</strong><span class="muted">Aucune sollicitation à préparer</span></div></div>
 <section class="panel operia-search"><div class="panel-head"><div><div class="eyebrow muted">Trouver des entreprises</div><h2>L’annuaire officiel, au même endroit</h2></div><span class="badge">Recherche manuelle</span></div><p class="note muted">Repérez des entreprises de nettoyage actives et publiquement diffusibles. Leur présence dans l’annuaire ne confirme ni un besoin, ni l’absence de logiciel, ni une autorisation de les solliciter.</p>
 <form data-operia-search><div class="operia-search-fields"><div><label for="operia-department">Départements</label><input id="operia-department" name="department" value="91" maxlength="24" placeholder="91 ou 91,77" required></div><div><label for="operia-query">Nom, ville ou SIREN (facultatif)</label><input id="operia-query" name="q" maxlength="100" placeholder="Ex. Évry ou nom d’entreprise"></div><div><label for="operia-naf">Activité principale</label><select id="operia-naf" name="naf"><option value="all">Toutes les activités de nettoyage</option>${Object.entries(OPERIA_NAF).map(([code,label])=>`<option value="${code}">${code} · ${e(label)}</option>`).join('')}</select></div></div><div class="operia-actions"><button class="primary" type="submit" data-operia-submit>Rechercher</button><button type="button" data-operia-cancel hidden>Annuler la recherche</button></div></form>
 <p class="note" data-operia-search-state role="status" aria-live="polite">25 résultats maximum par page. Les nouvelles entreprises peuvent déjà être équipées.</p><div data-operia-results-tools hidden class="operia-results-tools"><div><label for="operia-sort">Trier les résultats chargés</label><select id="operia-sort"><option value="recent">Création : plus récentes d’abord</option><option value="oldest">Création : plus anciennes d’abord</option><option value="name">Nom de l’entreprise</option></select></div><div><label for="operia-created-after">Créées depuis (résultats chargés)</label><input id="operia-created-after" type="date"></div></div><div data-operia-results></div><p class="note muted" data-operia-search-limit></p><button type="button" data-operia-next hidden>Charger les 25 suivantes</button><p class="note muted">Source : ${external('https://recherche-entreprises.api.gouv.fr/docs/','API Recherche d’entreprises')} · activités ${external('https://www.insee.fr/fr/metadonnees/nafr2/sousClasse/81.21Z','81.21Z')}, ${external('https://www.insee.fr/fr/metadonnees/nafr2/sousClasse/81.22Z','81.22Z')}, ${external('https://www.insee.fr/fr/metadonnees/nafr2/sousClasse/81.29B','81.29B')}.</p></section>
 <section class="panel"><div class="panel-head"><div><div class="eyebrow muted">Avancer ensemble</div><h2>Les prochaines étapes Opéria</h2></div><span class="badge" data-operia-followup-count>${counts.contacts} fiche${counts.contacts>1?'s':''}</span></div><p class="note muted">Les contacts, responsables, tâches et échéances restent ceux d’Atelier CRM. Ouvrez une fiche pour documenter le besoin et votre prochain échange.</p><div class="operia-followup-filters"><div><label for="operia-followup-stage">Étape commerciale</label><select id="operia-followup-stage"><option value="">Toutes les étapes</option>${options(OPERIA_STAGES,'')}</select></div><div><label for="operia-followup-sort">Ordre des fiches</label><select id="operia-followup-sort"><option value="action">Échéance puis qualification</option><option value="recent">Création de l’entreprise : plus récentes</option><option value="name">Nom</option></select></div></div><div data-operia-followup></div></section></div>`;
}

export function bindOperiaProspection(root,ctx){
 const host=root.querySelector('[data-operia-brand]');if(!host)return ()=>{};
 const id=brandId(ctx),q=s=>host.querySelector(s),listeners=new AbortController();
 let request=null,sequence=0,disposed=false,search=null,results=[],loaded=0,pages=1,total=0,busy=false,cooldown=0,timer=null,reloadSequence=0;
 const rows=[...(ctx.rows||[])],visibleIds=ctx.visibleRows?new Set(ctx.visibleRows.map(r=>r.id)):null,savingSirens=new Set();
 const active=()=>!disposed&&host.isConnected&&host.dataset.operiaBrand===id;
 const tell=s=>{if(active())q('[data-operia-search-state]').textContent=s;};
 const controls=()=>{if(!active())return;q('[data-operia-submit]').disabled=busy||Date.now()<cooldown;q('[data-operia-cancel]').hidden=!busy;q('[data-operia-next]').hidden=!search||!loaded||loaded>=pages||loaded>=MAX_PAGES;q('[data-operia-next]').disabled=busy||Date.now()<cooldown;};
 const renderResults=()=>{
  if(!active())return;
  const listed=sortRegistryCandidates(results,{sort:q('#operia-sort').value,creationAfter:q('#operia-created-after').value});
  q('[data-operia-results-tools]').hidden=!loaded;
  const html=listed.length?`<div class="table-wrap operia-table"><table><thead><tr><th>Entreprise</th><th>Création</th><th>Activité / effectif déclaré</th><th>Vérification</th><th>Fiche CRM</th></tr></thead><tbody>${listed.map(c=>{const old=existingCandidate(rows,c,id);return `<tr><td><strong>${e(c.name)}</strong><p>${e(c.city)} · SIREN ${e(c.siren)}</p></td><td>${dateLabel(c.creationDate)}</td><td>${e(c.naf)}<p>${e(c.employees)}</p></td><td>${external(c.registrySource,'Consulter la source')}<p>Consulté le ${dateLabel(c.registryDate)}</p></td><td>${old?`<button class="small" data-operia-open="${e(old.id)}">${old.archived?'Fiche archivée':isOpposed(old)?'Opposition — voir la fiche':'Déjà dans le CRM'}</button>`:`<button class="small" data-operia-add="${e(c.siren)}" ${ctx.canEdit&&!savingSirens.has(c.siren)?'':'disabled'}>${savingSirens.has(c.siren)?'Ajout en cours…':'Ajouter à qualifier'}</button>`}</td></tr>`;}).join('')}</tbody></table></div>`:loaded?'<p class="empty">Aucune entreprise parmi les résultats chargés ne correspond aux filtres. Retirez le filtre de date ou chargez la page suivante.</p>':'';
  replacePreservingFocus(q('[data-operia-results]'),html,rows,id);
  q('[data-operia-search-limit]').textContent=loaded?`${listed.length} affichée(s) sur ${results.length} entreprise(s) active(s) et diffusible(s) retenue(s) après ${loaded} page(s). L’annuaire annonce ${total.toLocaleString('fr-FR')} résultat(s) avant nos contrôles. Le tri par création porte seulement sur les pages chargées.${loaded>=MAX_PAGES?' Limite de 250 résultats examinés atteinte : affinez votre recherche.':''}`:'';
  controls();
 };
 const followup=()=>{
  if(!active())return;
  const stage=q('#operia-followup-stage').value,sort=q('#operia-followup-sort').value;
  const list=rows.filter(r=>r.brand_id===id&&r.kind==='contact'&&!r.archived&&(!visibleIds||visibleIds.has(r.id))&&(!stage||(isOpposed(r)?'Opposition':operiaOf(r).stage)===stage)).sort((a,b)=>{
   if(sort==='name')return a.name.localeCompare(b.name,'fr');
   if(sort==='recent'){const x=operiaOf(a).creationDate,y=operiaOf(b).creationDate;return x&&y?y.localeCompare(x):x?-1:y?1:0;}
   if(isExcluded(a)!==isExcluded(b))return isExcluded(a)?1:-1;
   const due=(a.due_date||'9999').localeCompare(b.due_date||'9999');return due||commercialPriority(a).rank-commercialPriority(b).rank;
  });
  const html=list.length?`<div class="table-wrap operia-table"><table><thead><tr><th>Entreprise</th><th>Étape</th><th>Qualification</th><th>Prochaine action</th><th>Échéance</th></tr></thead><tbody>${list.map(r=>{const op=operiaOf(r),qual=qualification(r),excluded=isExcluded(r);return `<tr><td><button class="link-button" data-operia-open="${e(r.id)}">${e(r.name)}</button><p>${e(op.city||'Ville à renseigner')}${op.creationDate?' · créée le '+dateLabel(op.creationDate):''}</p></td><td><span class="badge ${excluded?'alert':''}">${e(isOpposed(r)?'Opposition':op.stage)}</span></td><td>${excluded?'Exclue de la prospection':qual.complete?'Complète':'À compléter'}<p>${qual.checks.filter(x=>x.ok).length}/${qual.checks.length} vérifications</p></td><td>${excluded?'Hors prospection':e(op.nextAction||'À définir dans la fiche')}</td><td>${r.due_date?dateLabel(r.due_date):'Non définie'}</td></tr>`;}).join('')}</tbody></table></div>`:'<p class="empty">Aucune fiche dans cette sélection. Les entreprises ajoutées apparaîtront ici et dans Contacts.</p>';
  replacePreservingFocus(q('[data-operia-followup]'),html,rows,id);
 };
 const updateCounts=()=>{
  if(!active())return;const counts=prospectionCounts(rows.filter(r=>!visibleIds||visibleIds.has(r.id)),id);
  for(const [key,value]of Object.entries(counts)){const node=q('[data-operia-kpi="'+key+'"]');if(node)node.textContent=String(value);}
  const count=q('[data-operia-followup-count]');if(count)count.textContent=counts.contacts+' fiche'+(counts.contacts>1?'s':'');
 };
 const updateSavedScope=record=>{
  if(!visibleIds||!record.id)return;
  const currentUser=ctx.user?.id||ctx.ownerId||null;
  const allowed=typeof ctx.isRecordVisible==='function'?ctx.isRecordVisible(record):!ctx.mine||(currentUser&&record.owner_id===currentUser);
  if(allowed)visibleIds.add(record.id);
 };
 const refreshData=async()=>{
  const revision=++reloadSequence,snapshot=await ctx.onReload?.();
  if(!active()||revision!==reloadSequence||!snapshot)return;
  if(Array.isArray(snapshot.rows)){rows.splice(0,rows.length,...snapshot.rows.filter(r=>r.brand_id===id));}
  if(visibleIds&&Array.isArray(snapshot.visibleRows)){visibleIds.clear();for(const record of snapshot.visibleRows)visibleIds.add(record.id);}
  updateCounts();followup();renderResults();
 };
 const run=async append=>{
  if(!active()||Date.now()<cooldown)return;
  request?.abort();const seq=++sequence;request=new AbortController();
  try{
   if(!append){const f=new FormData(q('[data-operia-search]'));search={department:f.get('department'),q:f.get('q'),naf:f.get('naf')==='all'?Object.keys(OPERIA_NAF):[f.get('naf')]};operiaSearchURL(search);results=[];loaded=0;total=0;renderResults();}
   const filters={...search,page:append?loaded+1:1};busy=true;controls();tell('Consultation de l’annuaire officiel…');
   const result=await searchOperiaRegistry(filters,{signal:request.signal,fetchImpl:ctx.fetchImpl});
   if(!active()||seq!==sequence)return;
   const seen=new Set(results.map(r=>r.siren));results.push(...result.results.filter(r=>!seen.has(r.siren)));loaded=result.page;pages=result.pages;total=result.total;
   tell(`Recherche terminée : ${result.results.length} entreprise(s) retenue(s) sur cette page, après contrôle du statut, de l’activité et du département.`);renderResults();
  }catch(err){if(!active()||seq!==sequence)return;if(err.name==='AbortError'){tell('Recherche annulée.');return;}tell(err.message);if(err.retryAfter){cooldown=Date.now()+err.retryAfter*1000;clearTimeout(timer);timer=setTimeout(()=>{cooldown=0;controls();},err.retryAfter*1000);tell(`${err.message} Nouvelle recherche possible dans ${err.retryAfter} secondes.`);}}
  finally{if(active()&&seq===sequence){busy=false;controls();}}
 };
 q('[data-operia-search]').addEventListener('submit',event=>{event.preventDefault();run(false);},{signal:listeners.signal});
 q('[data-operia-cancel]').addEventListener('click',()=>request?.abort(),{signal:listeners.signal});
 q('[data-operia-next]').addEventListener('click',()=>run(true),{signal:listeners.signal});
 for(const selector of ['#operia-sort','#operia-created-after'])q(selector).addEventListener('change',renderResults,{signal:listeners.signal});
 for(const selector of ['#operia-followup-stage','#operia-followup-sort'])q(selector).addEventListener('change',followup,{signal:listeners.signal});
 host.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button||!active())return;
  if(button.dataset.operiaOpen){ctx.onOpenContact?.(button.dataset.operiaOpen);return;}
  if(!button.dataset.operiaAdd||!ctx.canEdit||button.disabled)return;
  const c=results.find(r=>r.siren===button.dataset.operiaAdd);if(!c||existingCandidate(rows,c,id)||savingSirens.has(c.siren))return;
  savingSirens.add(c.siren);button.disabled=true;
  try{
   const record=registryContact(c,{brand:id,ownerId:ctx.user?.id||ctx.ownerId||null}),saved=await ctx.onSave(record);
   if(!active())return;
   const added=saved||record,index=rows.findIndex(r=>r.id&&r.id===added.id);if(index>=0)rows[index]=added;else rows.push(added);
   updateSavedScope(added);updateCounts();followup();renderResults();
   tell(`${c.name} a été ajoutée avec le statut « À qualifier ». Aucun message envoyé.`);
   try{await refreshData();}catch(err){if(active())tell(`${c.name} a été ajoutée. L’actualisation de l’équipe a échoué : ${err.message} Ne la réimportez pas.`);}
  }
  catch(err){if(active()){tell('Ajout impossible : '+err.message);button.disabled=false;}}
  finally{savingSirens.delete(c.siren);if(active())renderResults();}
 },{signal:listeners.signal});
 followup();updateCounts();controls();
 return ()=>{disposed=true;sequence++;request?.abort();listeners.abort();clearTimeout(timer);};
}

function input(label,name,value='',type='text',extra=''){
 return `<div><label for="operia-f-${name}">${e(label)}</label><input id="operia-f-${name}" name="operia_${name}" type="${type}" value="${e(value??'')}" ${extra}></div>`;
}
function select(label,name,values,value,labels={}){return `<div><label for="operia-f-${name}">${e(label)}</label><select id="operia-f-${name}" name="operia_${name}">${values.map(v=>`<option value="${e(v)}" ${v===value?'selected':''}>${e(labels[v]||v)}</option>`).join('')}</select></div>`;}
function textarea(label,name,value,extra=''){return `<div class="full"><label for="operia-f-${name}">${e(label)}</label><textarea id="operia-f-${name}" name="operia_${name}" maxlength="2000" ${extra}>${e(value)}</textarea></div>`;}

export function renderOperiaQualification(record,{readonly=false}={}){
 const op=operiaOf(record),qual=qualification(record),excluded=isExcluded(record),fit=op.fit;
 return `<section class="operia-qualification full"><div class="line"></div><div class="panel-head"><div><div class="eyebrow muted">Opéria / qualification partagée</div><h3>Comprendre l’entreprise avant de proposer</h3></div><span class="badge ${excluded?'alert':''}">${excluded?'Exclue de la prospection':qual.complete?'Qualification complète':'À compléter'}</span></div><p class="note muted">Une création récente est un indice de contexte, jamais la preuve d’un besoin ou de l’absence de logiciel. Les sites ci-dessous sont les chantiers clients ; ils ne sont pas déduits du nombre d’établissements au registre.</p>
 <ul class="operia-checks">${qual.checks.map(c=>`<li class="${c.ok?'done':''}"><span aria-hidden="true">${c.ok?'✓':'○'}</span><span>${e(c.label)}${c.help?`<small>${e(c.help)}</small>`:''}</span></li>`).join('')}</ul>
 <fieldset class="operia-fieldset" ${readonly?'disabled':''}><div class="form-grid">
 ${select('Étape commerciale','stage',OPERIA_STAGES,isOpposed(record)?'Opposition':op.stage)}${input('Apporté par (distinct du responsable)','originator',op.originator,'text','maxlength="200"')}
 <details class="full operia-proof"><summary>Identité et registre officiel</summary><div class="form-grid">${input('SIREN','siren',op.siren,'text','inputmode="numeric" pattern="[0-9]{9}" maxlength="9"')}${input('Date de création de l’entreprise','creationDate',op.creationDate,'date')}${input('Ville','city',op.city,'text','maxlength="150"')}${input('Code NAF','naf',op.naf,'text','maxlength="6"')}
 ${select('Statut au registre','registryStatus',['','A','C'],op.registryStatus,{'':'À vérifier','A':'Active','C':'Cessée'})}${input('Registre vérifié le','registryDate',String(op.registryDate||'').slice(0,10),'date')}${input('Source du registre','registrySource',op.registrySource,'url','maxlength="2000"')}${input('Effectif déclaré et année (registre)','employees',op.employees,'text','maxlength="200"')}</div></details>
 <details class="full operia-proof"><summary>Preuves d’activité et coordonnées professionnelles</summary><div class="form-grid">${textarea('Preuve d’activité pertinente (faits observés)','businessEvidence',op.businessEvidence)}${input('Source de cette activité','businessSource',op.businessSource,'url','maxlength="2000"')}${input('Activité vérifiée le','businessDate',String(op.businessDate||'').slice(0,10),'date')}
 ${input('Interlocuteur professionnel','contactName',op.contactName,'text','maxlength="200"')}${input('Fonction de l’interlocuteur','contactRole',op.contactRole,'text','maxlength="200"')}${input('Source des coordonnées professionnelles','contactSource',op.contactSource,'url','maxlength="2000"')}${input('Coordonnées vérifiées le','contactVerifiedAt',String(op.contactVerifiedAt||'').slice(0,10),'date')}</div></details>
 <div class="full"><h3 class="operia-subtitle">Besoin et organisation</h3><p class="note muted">Renseignez ce qui est observé ou confirmé, en conservant la source et la date. Laissez vide ce qui reste inconnu.</p></div>
 ${input('Nombre de sites clients / chantiers','sites',fit.sites,'number','min="0" max="1000000" step="1"')}${input('Nombre d’agents terrain','agents',fit.agents,'number','min="0" max="1000000" step="1"')}${select('Organisation actuelle','organization',ORGANIZATIONS,fit.organization)}${input('Logiciel / outils actuels','tool',fit.tool,'text','maxlength="500"')}${textarea('Difficulté ou besoin exprimé','pain',fit.pain)}
 <div class="full"><label class="checkrow"><input name="operia_painConfirmed" type="checkbox" ${fit.painConfirmed?'checked':''}> Besoin confirmé par l’interlocuteur</label></div>${select('Nature de la preuve','evidenceKind',EVIDENCE_KINDS,fit.kind)}${input('Source / référence de l’échange','fitSource',fit.source,'text','maxlength="2000"')}${input('Date de la preuve','fitDate',String(fit.date||'').slice(0,10),'date')}${select('Budget','budget',BUDGETS,fit.budget)}
 ${textarea('Adéquation Opéria / limites à vérifier','need',op.need)}${textarea('Prochaine action (échéance dans le champ natif du CRM)','nextAction',op.nextAction)}${input('Abonnement envisagé HT par mois (€)','monthlyHt',op.monthlyHtCents===null?'':(op.monthlyHtCents/100).toFixed(2),'text','inputmode="decimal" maxlength="16"')}
 </div></fieldset>
 <details class="operia-history"><summary>Historique Opéria (${op.activities.length})</summary>${op.activities.length?`<ol>${op.activities.slice().sort((a,b)=>String(b.at).localeCompare(String(a.at))).map(a=>`<li><strong>${e(a.kind)}</strong> · ${dateLabel(a.at)}<p>${e(a.note||'Sans note')}</p>${a.source?`<p class="note muted">Source : ${e(a.source)}</p>`:''}</li>`).join('')}</ol>`:'<p class="note muted">Aucun échange Opéria enregistré. Les modifications de la fiche restent également dans l’historique d’Atelier CRM.</p>'}</details>
 ${!readonly?`<fieldset class="operia-fieldset"><h3>Ajouter un échange effectué</h3><p class="note muted">Enregistrement manuel uniquement. Ne renseignez que des échanges réellement effectués.</p><div class="form-grid">${select('Type d’échange','activityKind',ACTIVITY_KINDS,'Note')}${input('Date de l’échange','activityDate','','date')}${textarea('Compte rendu (laisser vide pour ne rien ajouter)','activityNote','')}${input('Source / référence de l’échange','activitySource','','text','maxlength="2000"')}${input('Montant encaissé HT (€), uniquement si paiement reçu','activityAmount','','text','inputmode="decimal" maxlength="16"')}</div></fieldset>`:''}</section>`;
}

export function readOperiaQualification(form,record,originalRecord=record){
 const f=typeof form?.get==='function'?form:new FormData(form),op=operiaOf(record);
 // No qualification fields means an unrelated/native save: leave the metadata alone.
 if(!f.has('operia_stage'))return record;
 const get=name=>text(f.get('operia_'+name),2000);
 const int=name=>{const value=get(name);if(!value)return null;const n=Number(value);if(!/^\d+$/.test(value)||!Number.isSafeInteger(n)||n>1000000)throw Error('Le nombre de sites et d’agents doit être un entier positif.');return n;};
 const updated={...op};
 for(const name of ['siren','creationDate','city','naf','registryStatus','registryDate','registrySource','employees','businessEvidence','businessSource','businessDate','contactName','contactRole','contactSource','contactVerifiedAt','need','nextAction','originator'])updated[name]=get(name);
 if(updated.siren&&!/^\d{9}$/.test(updated.siren))throw Error('Le SIREN doit contenir exactement 9 chiffres.');
 for(const name of ['creationDate','registryDate','businessDate','contactVerifiedAt'])if(updated[name]&&(!dateOnly(updated[name])||updated[name]>day()))throw Error('Les dates de qualification doivent être valides et ne peuvent pas être futures.');
 for(const name of ['registrySource','businessSource','contactSource'])if(updated[name]&&!safeURL(updated[name]))throw Error('Les sources doivent commencer par https:// ou http://.');
 updated.stage=isOpposed(originalRecord)||isOpposed(record)?'Opposition':get('stage');
 if(!OPERIA_STAGES.includes(updated.stage))throw Error('L’étape Opéria est invalide.');
 updated.fit={...op.fit,sites:int('sites'),agents:int('agents'),organization:get('organization'),tool:get('tool'),pain:get('pain'),painConfirmed:f.has('operia_painConfirmed'),kind:get('evidenceKind'),source:get('fitSource'),date:get('fitDate'),budget:get('budget')};
 if(updated.fit.painConfirmed&&(!updated.fit.pain||!updated.fit.source||!updated.fit.date||updated.fit.kind!=='Échange avec l’entreprise'))throw Error('Un besoin confirmé nécessite une description, une preuve de type échange avec l’entreprise, une source et la date de l’échange.');
 if(updated.fit.date&&(!dateOnly(updated.fit.date)||updated.fit.date>day()))throw Error('La date de la preuve doit être valide et ne peut pas être future.');
 if(updated.fit.organization==='Aucun logiciel déclaré'&&(updated.fit.kind!=='Échange avec l’entreprise'||!updated.fit.source||!updated.fit.date))throw Error('L’absence de logiciel doit être déclarée par l’entreprise lors d’un échange sourcé et daté.');
 // HTML date inputs only display the day. Editing another field must not erase
 // the timestamp carried by an imported source or weaken its freshness check.
 const preserveTimestamp=(value,previous)=>value&&String(previous||'').slice(0,10)===value&&/^\d{4}-\d{2}-\d{2}T/.test(previous)&&Number.isFinite(Date.parse(previous))?previous:value;
 for(const name of ['registryDate','businessDate','contactVerifiedAt'])updated[name]=preserveTimestamp(updated[name],op[name]);
 updated.fit.date=preserveTimestamp(updated.fit.date,op.fit.date);
 updated.monthlyHtCents=get('monthlyHt')?cents(get('monthlyHt')):null;
 if(updated.stage==='Gagné'&&!(updated.monthlyHtCents>0))throw Error('Renseignez le montant mensuel HT convenu avant de marquer ce dossier gagné.');
 updated.due=record.due_date||'';
 const note=get('activityNote');
 if(note){const at=get('activityDate');if(!dateOnly(at))throw Error('Renseignez la date de l’échange ajouté.');if(at>day())throw Error('Un échange effectué ne peut pas être daté dans le futur.');const kind=get('activityKind');if(!ACTIVITY_KINDS.includes(kind))throw Error('Type d’échange invalide.');if(updated.stage==='Opposition'&&!['Note','Paiement reçu'].includes(kind))throw Error('Une entreprise opposée à la prospection accepte uniquement une note ou un paiement déjà reçu dans ce suivi.');const amount=get('activityAmount');if(kind==='Paiement reçu'&&(!amount||cents(amount)<=0||!get('activitySource')))throw Error('Un paiement reçu nécessite un montant positif et une référence de justificatif.');if(kind!=='Paiement reçu'&&amount)throw Error('Un montant encaissé se renseigne uniquement pour un paiement reçu.');updated.activities=[...op.activities,{id:crypto.randomUUID(),kind,at,note,amountHtCents:amount?cents(amount):null,source:get('activitySource')}];}
 const status=updated.stage==='Opposition'?'Ne plus contacter':contactStatusForStage(updated.stage);
 return {...record,status,metadata:{...(record.metadata||{}),operia:normalizeOperia(updated)}};
}
