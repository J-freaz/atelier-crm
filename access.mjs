import {isOperiaBrand,operiaOf} from './operia-domain.mjs';

// UI checks are a second boundary. PostgreSQL enforces the same permissions.
export const COMMERCIAL_ACTIVITY_KINDS=Object.freeze(['Note','Email envoyé','Appel effectué','Réponse reçue','Réponse positive','Démo tenue','Proposition envoyée']);
// JSONB may return object keys in a different order. History order remains significant.
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const same=(a,b)=>JSON.stringify(canonical(a??null))===JSON.stringify(canonical(b??null));
const without=(value,key)=>Object.fromEntries(Object.entries(value||{}).filter(([k])=>k!==key));
export function accessFor({brand,role,userId,records=[]}={}){
 const restricted=role==='commercial',operia=isOperiaBrand(brand),member=['owner','editor','viewer'].includes(role)||(restricted&&operia);
 const assigned=r=>!!r&&r.brand_id===brand?.id&&r.owner_id===userId&&!r.archived&&['contact','task'].includes(r.kind);
 const canRead=r=>!!userId&&member&&r?.brand_id===brand?.id&&(!restricted||(assigned(r)&&(!r.related_id||records.some(c=>c.id===r.related_id&&c.kind==='contact'&&assigned(c)))));
 const canCreate=kind=>!!userId&&!!brand&&(['owner','editor'].includes(role)||(restricted&&operia&&['contact','task'].includes(kind)));
 const canEdit=r=>canRead(r)&&canCreate(r.kind);
 return {role,userId,brand,canAccess:member,canBrowseArchives:member&&!restricted,commercialRestricted:restricted,canRead,canEdit,canCreate,
  canManage:member&&!restricted&&['owner','editor'].includes(role),canAdmin:role==='owner',canExport:member&&!restricted,canSettings:member&&!restricted,canMarkWon:['owner','editor'].includes(role)};
}

export function appendCommercialNote(previous,addition,date=new Date().toLocaleDateString('sv-SE')){
 const note=String(addition||'').trim();return note?String(previous||'')+(previous?'\n\n':'')+'['+date+'] '+note:String(previous||'');
}

export function assertRecordSave(next,original,access,records=[]){
 if(!access||next?.brand_id!==access.brand?.id)throw Error('Ce dossier n’appartient pas à votre espace.');
 if(original?!access.canEdit(original):next.id||!access.canCreate(next.kind))throw Error('Votre accès ne permet pas de modifier ce dossier.');
 const op=operiaOf(next),before=operiaOf(original);
 if(isOperiaBrand(access.brand)&&next.kind==='contact'&&!access.canMarkWon&&(op.stage==='Gagné'||next.status==='Client')&&!(original&&(before.stage==='Gagné'||original.status==='Client')))throw Error('Seul l’administrateur peut valider un dossier gagné.');
 if(!access.commercialRestricted)return next;
 const fail=()=>{throw Error('Ce champ est réservé à l’administrateur. Rouvrez la fiche pour retrouver sa version actuelle.');};
 if(next.owner_id!==access.userId||next.archived||!['contact','task'].includes(next.kind))fail();
 if(next.related_id&&!records.some(r=>r.id===next.related_id&&r.kind==='contact'&&access.canRead(r)))throw Error('Le contact lié doit appartenir à vos dossiers accessibles.');
 if(original){
  for(const k of ['id','brand_id','kind','owner_id','related_id','source','amount_cents','paid_cents','quantity','archived'])if(!same(next[k],original[k]))fail();
  if(next.kind==='contact'&&(next.name!==original.name||op.siren!==before.siren))fail();
  if(!String(next.notes||'').startsWith(String(original.notes||'')))throw Error('Les notes existantes sont conservées. Ajoutez une nouvelle note.');
  if(!same(without(next.metadata,'operia'),without(original.metadata,'operia')))fail();
  for(const k of ['originator','monthlyHtCents','legacy'])if(!same(op[k],before[k]))fail();
  if((before.stage==='Gagné'||original.status==='Client')&&!['Gagné','Opposition'].includes(op.stage))throw Error('La validation d’un client est réservée à l’administrateur.');
  if((before.stage==='Opposition'||original.status==='Ne plus contacter')&&(op.stage!=='Opposition'||next.status!=='Ne plus contacter'))throw Error('Une opposition ne peut pas être annulée.');
 }else{
  if(next.kind==='contact'&&next.related_id)fail();
  if(Number(next.amount_cents||0)!==0||Number(next.paid_cents||0)!==0||Number(next.quantity??1)!==1||op.originator||op.monthlyHtCents!==null||Object.values(op.legacy).some(Boolean)||Object.keys(without(next.metadata,'operia')).length)fail();
 }
 const oldActivities=original?.metadata?.operia?.activities||[],activities=next?.metadata?.operia?.activities||[];
 if(activities.length<oldActivities.length||oldActivities.some((a,i)=>!same(a,activities[i])))throw Error('Les comptes rendus existants ne peuvent pas être modifiés.');
 for(const a of activities.slice(oldActivities.length))if(!COMMERCIAL_ACTIVITY_KINDS.includes(a.kind)||a.amountHtCents!=null)throw Error('Les encaissements sont réservés à l’administrateur.');
 return next;
}
