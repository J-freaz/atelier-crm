// Opéria adds a separate business profile; native amounts remain the general CRM's TTC amounts.
// All provenance below is declarative. A public source never establishes consent or buying intent.
export const OPERIA_STAGES = ['À qualifier','Qualifié','Contacté','En échange','Démo planifiée','Démo réalisée','Proposition','Gagné','Perdu','Opposition'];
export const ORGANIZATIONS = ['Inconnue','Tableurs / papier / messages','Logiciel métier','Aucun logiciel déclaré'];
export const EVIDENCE_KINDS = ['À vérifier','Source publique','Échange avec l’entreprise'];
export const BUDGETS = ['Inconnu','À discuter','Compatible confirmé','Non compatible déclaré'];
export const ACTIVITY_KINDS = ['Note','Email envoyé','Appel effectué','Réponse reçue','Réponse positive','Démo tenue','Proposition envoyée','Paiement reçu'];
const DAY = 86400000;
const object = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const text = v => typeof v === 'string' ? v.trim() : '';
const numberOrNull = (v,max=1000000) => v === null || v === undefined || v === '' ? null : Number.isSafeInteger(Number(v)) && Number(v)>=0 && Number(v)<=max ? Number(v) : null;
const enumValue = (v,values,fallback) => values.includes(v) ? v : fallback;
export function normalizeSiren(v){const s=text(String(v??'')).replace(/\s/g,'');return /^\d{9}$/.test(s)?s:'';}
export function dateOnly(v){const s=text(v).slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return '';const t=Date.parse(s+'T00:00:00Z');return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===s?s:'';}
export function fresh(v,days=30,now=Date.now()){const t=Date.parse(v);const n=typeof now==='number'?now:Date.parse(now);return Number.isFinite(t)&&Number.isFinite(n)&&t<=n&&n-t<=days*DAY;}
export function emptyOperia(){return {
 schemaVersion:1,siren:'',creationDate:'',city:'',naf:'',employees:'',registryStatus:'',registryDate:'',registrySource:'',
 contactName:'',contactRole:'',contactSource:'',contactVerifiedAt:'',businessEvidence:'',businessSource:'',businessDate:'',need:'',
 fit:{sites:null,agents:null,organization:'Inconnue',tool:'',pain:'',painConfirmed:false,budget:'Inconnu',source:'',date:'',kind:'À vérifier'},
 stage:'À qualifier',nextAction:'',due:'',monthlyHtCents:null,originator:'',
 legacy:{source:'',id:'',created:'',updated:'',exportedAt:'',stage:''},activities:[]
};}
export function normalizeOperia(value){
 const v=object(value),out=emptyOperia(),f=object(v.fit),legacy=object(v.legacy);
 for(const key of Object.keys(out))if(typeof out[key]==='string')out[key]=text(v[key]);
 out.siren=normalizeSiren(v.siren);out.creationDate=dateOnly(v.creationDate);out.due=dateOnly(v.due);
 out.registryStatus=enumValue(v.registryStatus,['A','C'],'');
 out.stage=enumValue(v.stage,OPERIA_STAGES,'À qualifier');
 out.monthlyHtCents=numberOrNull(v.monthlyHtCents,10000000000);
 out.fit={sites:numberOrNull(f.sites),agents:numberOrNull(f.agents),organization:enumValue(f.organization,ORGANIZATIONS,'Inconnue'),tool:text(f.tool),pain:text(f.pain),painConfirmed:f.painConfirmed===true,budget:enumValue(f.budget,BUDGETS,'Inconnu'),source:text(f.source),date:text(f.date),kind:enumValue(f.kind,EVIDENCE_KINDS,'À vérifier')};
 for(const key of Object.keys(out.legacy))out.legacy[key]=text(legacy[key]);
 const seen=new Set();
 out.activities=(Array.isArray(v.activities)?v.activities:[]).map((activity)=>{
  const a=object(activity);return {id:text(a.id),kind:text(a.kind)||'Note',at:text(a.at),note:text(a.note),amountHtCents:numberOrNull(a.amountHtCents,10000000000),source:text(a.source)};
 }).filter(a=>{const key=a.id?`${a.source}|${a.id}`:JSON.stringify(a);if(seen.has(key))return false;seen.add(key);return true;});
 return out;
}
export function operiaOf(record){return normalizeOperia(record?.metadata?.operia);}
export function validateOperia(value){
 const v=object(value),f=object(v.fit);
 if(text(v.siren)&&!normalizeSiren(v.siren))throw Error('Le SIREN doit contenir neuf chiffres.');
 if(v.creationDate&&!dateOnly(v.creationDate))throw Error('Date de création invalide.');
 if(v.due&&!dateOnly(v.due))throw Error('Échéance invalide.');
 if(v.stage&&!OPERIA_STAGES.includes(v.stage))throw Error('Étape Opéria inconnue.');
 if(v.monthlyHtCents!==null&&v.monthlyHtCents!==undefined&&v.monthlyHtCents!==''&&numberOrNull(v.monthlyHtCents,10000000000)===null)throw Error('Abonnement HT invalide.');
 for(const key of ['sites','agents'])if(f[key]!==undefined&&f[key]!==null&&f[key]!==''&&numberOrNull(f[key])===null)throw Error('Le nombre de sites et d’agents doit être entier et positif.');
 if(v.activities!==undefined&&!Array.isArray(v.activities))throw Error('Historique invalide.');
 for(const a of v.activities||[])if(a.amountHtCents!==null&&a.amountHtCents!==undefined&&a.amountHtCents!==''&&numberOrNull(a.amountHtCents,10000000000)===null)throw Error('Montant de l’activité invalide.');
 const out=normalizeOperia(v);if(JSON.stringify(out).length>240000)throw Error('Ce dossier est trop volumineux ; scinder son historique avant import.');return out;
}
export function isOperiaBrand(brand){return brand?.profile==='operia';}
export function isExcluded(record){return !!record?.archived||record?.status==='Ne plus contacter'||['Opposition','Gagné','Perdu'].includes(operiaOf(record).stage);}
export function contactStatusForStage(stage){return stage==='Opposition'?'Ne plus contacter':stage==='Gagné'?'Client':['Qualifié','Démo planifiée','Démo réalisée','Proposition'].includes(stage)?'Qualifié':'À qualifier';}
export function qualification(record,now=Date.now()){
 const o=operiaOf(record),f=o.fit,fitCurrent=!!f.source&&f.kind!=='À vérifier'&&fresh(f.date,90,now);
 const checks=[
  {label:'Entreprise active vérifiée',ok:!!o.siren&&o.registryStatus==='A'&&!!o.registrySource&&fresh(o.registryDate,30,now),help:'Identité et activité administrative vérifiées depuis moins de 30 jours.'},
  {label:'Activité métier documentée',ok:!!o.businessEvidence&&!!o.businessSource&&fresh(o.businessDate,30,now),help:'Preuve datée de l’activité réellement exercée ; le code APE seul ne suffit pas.'},
  {label:'Contact professionnel sourcé',ok:!!(record.email||record.phone)&&!!o.contactSource&&!!o.contactRole&&fresh(o.contactVerifiedAt,30,now),help:'Source, rôle et coordonnées professionnelles. Ne prouve ni délivrabilité ni consentement.'},
  {label:'Organisation étudiée',ok:!!o.need&&fitCurrent&&f.sites!==null&&f.agents!==null,help:'Sites, agents, source et date documentés. Ne vaut pas intérêt exprimé.'}
 ];
 const excluded=isExcluded(record),complete=checks.every(c=>c.ok);
 return {checks,score:checks.filter(c=>c.ok).length*25,complete,excluded,firstContactAllowed:!excluded&&o.registryStatus!=='C',note:'La complétude aide à préparer l’échange. Elle ne bloque pas un premier appel de qualification et ne mesure pas une probabilité de vente.'};
}
export function commercialPriority(record,now=Date.now()){
 const o=operiaOf(record),f=o.fit;
 if(isExcluded(record))return {label:'Hors prospection',rank:9,reason:'Compte gagné, perdu, archivé ou opposé à la prospection.'};
 if(o.registryStatus==='C')return {label:'Entreprise cessée',rank:8,reason:'Ne pas prospecter cette entité ; vérifier un éventuel établissement successeur séparément.'};
 if(!f.source||f.kind==='À vérifier'||!fresh(f.date,90,now))return {label:'À documenter',rank:4,reason:'La création récente ne prouve ni un besoin ni l’absence d’un logiciel.'};
 if(f.budget==='Non compatible déclaré')return {label:'Budget à revoir',rank:6,reason:'Budget déclaré non compatible : clarifier le périmètre avant une démonstration.'};
 if(o.registryStatus!=='A'||!o.registrySource||!o.siren||!fresh(o.registryDate,30,now))return {label:'Identité à vérifier',rank:5,reason:'Actualiser le contrôle de l’entreprise dans l’annuaire officiel.'};
 if((f.sites??0)>=2&&(f.agents??0)>=2&&f.pain&&f.painConfirmed&&f.kind==='Échange avec l’entreprise')return {label:'À traiter en priorité',rank:0,reason:'Organisation multisite et difficulté confirmée par échange. Budget et décision restent à valider.'};
 if((f.sites??0)>=2&&(f.agents??0)>=2)return {label:'Organisation adaptée',rank:1,reason:'Plusieurs sites et agents documentés. Difficultés, équipement et budget à confirmer.'};
 return {label:'Besoin à préciser',rank:3,reason:'Une petite structure n’est pas exclue ; vérifier son besoin de coordination.'};
}
function euroToCents(value){if(value===null||value===undefined||value==='')return null;const n=typeof value==='string'?Number(value.replace(',','.')):value;if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>100000000||Math.abs(n*100-Math.round(n*100))>0.000001)throw Error('Montant mensuel source invalide ; vérifier l’export.');return Math.round(n*100);}
function legacyStage(stage,activities){if(stage==='Démo')return activities.some(a=>a.kind==='Démo tenue')?'Démo réalisée':'Démo planifiée';return enumValue(stage,OPERIA_STAGES,'À qualifier');}
function activityLeadId(activity){
 const a=object(activity),camel=text(a.leadId),snake=text(a.lead_id);
 if(camel&&snake&&camel!==snake)throw Error('Les références leadId et lead_id de l’activité se contredisent.');
 return camel||snake;
}
export function fromLegacyLead(lead,{brandId,activities=[],sourceLabel='Ancien CRM Opéria',exportedAt=''}={}){
 const l=object(lead);if(!brandId)throw Error('Choisissez un espace Opéria.');
 if(l.product&&l.product!=='Operia'&&l.product!=='Opéria')throw Error('Ce dossier ne concerne pas Opéria.');
 if(!text(l.name))throw Error('Le nom de l’entreprise manque.');
 const converted=activities.filter(a=>activityLeadId(a)===text(l.id)&&!!text(l.id)).map(a=>{if(a.amount!==null&&a.amount!==undefined&&a.amount!==''&&numberOrNull(a.amount,10000000000)===null)throw Error('Montant d’activité source invalide ; vérifier l’export.');return {id:text(a.id),kind:text(a.kind),at:text(a.at),note:text(a.note),amountHtCents:numberOrNull(a.amount,10000000000),source:sourceLabel};});
 const o=validateOperia({...l,stage:legacyStage(l.stage,converted),monthlyHtCents:euroToCents(l.monthly),legacy:{source:sourceLabel,id:text(l.id),created:text(l.created),updated:text(l.updated),exportedAt},activities:converted});
 if(l.stage==='Démo')o.legacy.stage='Démo';
 return {brand_id:brandId,kind:'contact',name:text(l.name),status:contactStatusForStage(o.stage),owner_id:null,related_id:null,email:text(l.email),phone:text(l.phone),website:text(l.website),source:sourceLabel,notes:text(l.notes),due_date:o.due||null,amount_cents:0,paid_cents:0,quantity:1,archived:false,metadata:{operia:o}};
}
function findMatches(candidate,existing){const o=operiaOf(candidate);return existing.filter(r=>{
 if(r.brand_id!==candidate.brand_id||r.kind!=='contact')return false;
 const e=operiaOf(r);
 return (o.siren&&e.siren===o.siren)||(o.legacy.id&&e.legacy.id===o.legacy.id&&e.legacy.source===o.legacy.source)||(candidate.email&&text(r.email).toLowerCase()===candidate.email.toLowerCase())||text(r.name).toLocaleLowerCase('fr')===candidate.name.toLocaleLowerCase('fr');
 });}
export function planLegacyImport(payload,{brandId,existingRecords=[]}={}){
 const p=Array.isArray(payload)?{leads:payload}:object(payload);
 if(!Array.isArray(p.leads))throw Error('L’export doit contenir une liste leads.');
 if(p.leads.length>10000)throw Error('Import limité à 10 000 entreprises par fichier.');
 const result={create:[],skip:[],conflicts:[],suppress:[],warnings:[],total:p.leads.length};
 for(const key of ['events','activities'])if(p[key]!==undefined&&!Array.isArray(p[key]))result.conflicts.push({name:'Historique',reason:`Le champ ${key} doit être une liste d’activités.`});
 if(Array.isArray(p.events)&&p.events.length&&Array.isArray(p.activities)&&p.activities.length)result.conflicts.push({name:'Historique',reason:'Deux listes d’historique non vides (events et activities) : choisir la liste source avant transfert.'});
 if(result.conflicts.length)return result;
 const records=[...existingRecords],activities=[...(p.events||[]),...(p.activities||[])];
 // Audit all links before planning any write. An unmatched payment must never disappear silently.
 const sourceIds=new Set(p.leads.map(l=>text(object(l).id)).filter(Boolean));
 for(const [index,activity] of activities.entries()){
  const a=object(activity),name=text(a.id)||`Activité ${index+1}`;
  let reference;try{reference=activityLeadId(a);}catch(e){result.conflicts.push({name,reason:e.message});continue;}
  if(!reference||!sourceIds.has(reference))result.conflicts.push({name,reason:reference?`Activité orpheline : l’entreprise source ${reference} manque dans l’export. Corriger l’export avant transfert.`:'Activité sans référence leadId ou lead_id. Corriger l’export avant transfert.'});
 }
 if(result.conflicts.length)return result;
 for(const rawLead of p.leads){
  const lead=object(rawLead);
  if(lead.product&& !['Operia','Opéria'].includes(lead.product)){result.skip.push({name:text(lead.name),reason:'Autre solution conservée dans l’ancien outil.'});continue;}
  let candidate;try{candidate=fromLegacyLead(lead,{brandId,activities,sourceLabel:text(p.source)||'Ancien CRM Opéria',exportedAt:text(p.exportedAt)});}catch(e){result.conflicts.push({name:text(lead.name),reason:e.message});continue;}
  const matches=findMatches(candidate,records);
  if(matches.length){
   const o=operiaOf(candidate),m=matches[0];
   if(matches.length>1){result.conflicts.push({name:candidate.name,reason:'Plusieurs fiches correspondent : rapprochement manuel nécessaire.'});continue;}
   if(o.siren&&operiaOf(m).siren&&o.siren!==operiaOf(m).siren){result.conflicts.push({name:candidate.name,existingId:m.id,reason:'Nom ou email déjà utilisé par un SIREN différent.'});continue;}
   if(o.stage==='Opposition'&&m.status!=='Ne plus contacter'){
    const update={...m,status:'Ne plus contacter',metadata:{...m.metadata,operia:{...operiaOf(m),stage:'Opposition'}}};
    if(m.id)result.suppress.push(update);else{const i=result.create.indexOf(m);if(i>=0){Object.assign(m,update);result.create[i]=m;}}
    result.warnings.push(`${candidate.name} : opposition à préserver sur la fiche existante.`);
   }
   result.skip.push({name:candidate.name,existingId:m.id,reason:m.archived?'Fiche archivée existante : aucune réactivation.':m.status==='Ne plus contacter'?'Opposition existante conservée.':'Fiche déjà présente : aucune donnée écrasée.'});continue;
  }
  if(!operiaOf(candidate).siren)result.warnings.push(`${candidate.name} : SIREN absent, rapprochement limité au nom et à l’email.`);
  result.create.push(candidate);records.push(candidate);
 }
 return result;
}
export function byCreation(a,b,oldest=false){const x=operiaOf(a).creationDate,y=operiaOf(b).creationDate;if(!x&&!y)return a.name.localeCompare(b.name,'fr');if(!x)return 1;if(!y)return -1;return (oldest?x.localeCompare(y):y.localeCompare(x))||a.name.localeCompare(b.name,'fr');}
export function operiaMetrics(records,{now=Date.now(),from=null,to=null}={}){
 const rows=records.filter(r=>r.kind==='contact'&&!r.archived&&r.metadata?.operia),today=new Date(now).toISOString().slice(0,10);
 const start=from?Date.parse(from):Number.NEGATIVE_INFINITY,end=to?Date.parse(to)+(/^\d{4}-\d{2}-\d{2}$/.test(to)?DAY-1:0):Number.POSITIVE_INFINITY;
 const result={contacts:rows.length,qualified:0,contacted:0,responses:0,demos:0,proposals:0,won:0,lost:0,opposed:0,late:0,signedMonthlyHtCents:0,signedMonthlyUnknown:0,pipelineMonthlyHtCents:0,pipelineMonthlyUnknown:0,receivedHtCents:0,receiptsUnknown:0,stages:Object.fromEntries(OPERIA_STAGES.map(s=>[s,0]))};
 for(const row of rows){const o=operiaOf(row),stage=row.status==='Ne plus contacter'?'Opposition':o.stage;result.stages[stage]++;
  if(qualification(row,now).complete&&!isExcluded(row))result.qualified++;
  if(stage==='Opposition')result.opposed++;
  else if(stage==='Gagné'){result.won++;result.signedMonthlyHtCents+=o.monthlyHtCents??0;if(o.monthlyHtCents===null)result.signedMonthlyUnknown++;}
  else if(stage==='Perdu')result.lost++;
  else {result.pipelineMonthlyHtCents+=o.monthlyHtCents??0;if(o.monthlyHtCents===null)result.pipelineMonthlyUnknown++;if(o.due&&o.due<today&&o.nextAction)result.late++;}
  const acts=o.activities.filter(a=>{const t=Date.parse(a.at);return Number.isFinite(t)&&t>=start&&t<=end;});
  if(acts.some(a=>['Email envoyé','Appel effectué'].includes(a.kind)))result.contacted++;
  if(acts.some(a=>['Réponse reçue','Réponse positive'].includes(a.kind)))result.responses++;
  if(acts.some(a=>a.kind==='Démo tenue'))result.demos++;
  if(acts.some(a=>a.kind==='Proposition envoyée'))result.proposals++;
  result.receivedHtCents+=acts.filter(a=>a.kind==='Paiement reçu').reduce((n,a)=>n+(a.amountHtCents??0),0);
  result.receiptsUnknown+=acts.filter(a=>a.kind==='Paiement reçu'&&a.amountHtCents===null).length;
 }
 return result;
}
