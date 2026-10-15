export function draftPayload(input){
 const out={};
 for(const k of ['brand_id','contact_id','subject','body','signature','recipient'])out[k]=String(input[k]??'');
 if(!out.subject.trim()||out.subject.length>300)throw Error('Objet obligatoire, limité à 300 caractères.');
 if(!out.body.trim()||out.body.length>20000)throw Error('Message obligatoire, limité à 20 000 caractères.');
 if(!out.signature.trim()||out.signature.length>100)throw Error('Choisissez une signature.');
 if(out.recipient&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.recipient))throw Error('Adresse du destinataire invalide.');
 if(out.recipient.length>320)throw Error('Adresse trop longue.');
 return out;
}
export async function loadDraft(store,brandId,contactId){
 return (await store.request(`crm_message_drafts?brand_id=eq.${encodeURIComponent(brandId)}&contact_id=eq.${encodeURIComponent(contactId)}&select=*&limit=1`))[0]||null;
}
export async function saveDraft(store,input){
 const body=draftPayload(input);
 const path=input.id?`crm_message_drafts?id=eq.${encodeURIComponent(input.id)}&version=eq.${Number(input.version)}`:'crm_message_drafts';
 const rows=await store.request(path,input.id?'PATCH':'POST',body);
 if(!rows.length)throw Error('Ce brouillon a changé. Fermez puis rouvrez la fiche pour retrouver la dernière version.');
 return rows[0];
}
