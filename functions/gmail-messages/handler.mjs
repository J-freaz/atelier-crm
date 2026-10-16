import {validateConfig,encryptionKey,decrypt,hash} from '../gmail-connect/security.mjs';
import {validateMessage,mimeMessage,receivedMessages,brochure,mailbox} from './mime.mjs';
const origin='https://j-freaz.github.io';
const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Cache-Control':'no-store'};
export function createMailHandler({env,fetcher=fetch}){
 const respond=(x,status=200)=>Response.json(x,{status,headers});
 return async req=>{
  if(req.headers.get('origin')!==origin)return respond({error:'Origine refusée.'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return respond({error:'Méthode refusée.'},405);
  let claimed=null,rpc;
  try{
   const auth=req.headers.get('authorization')||'';
   if(!auth.startsWith('Bearer '))return respond({error:'Connexion CRM requise.'},401);
   const base=env('SUPABASE_URL'),key=env('SUPABASE_ANON_KEY'),service=env('SUPABASE_SERVICE_ROLE_KEY');
   const session=await fetcher(base+'/auth/v1/user',{headers:{apikey:key,Authorization:auth},signal:AbortSignal.timeout(8000)});
   if(!session.ok)return respond({error:'Reconnectez-vous au CRM.'},401);
   const user=await session.json();if(!user.id)return respond({error:'Session invalide.'},401);
   const raw=await req.text();if(raw.length>30000)return respond({error:'Message trop long.'},400);
   const input=JSON.parse(raw);
   if(!['prepare','send','sync','test-history','archive','restore'].includes(input.action))return respond({error:'Action inconnue.'},400);
   rpc=async(operation,payload={})=>{
    const r=await fetcher(base+'/rest/v1/rpc/crm_mail_internal',{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify({operation,actor:user.id,payload}),signal:AbortSignal.timeout(8000)});
    if(!r.ok)throw Error('Droits insuffisants, fiche modifiée ou destinataire différent de la fiche.');return r.json();
   };
   // This checks membership before any external call. Tokens never reach the browser.
   if(['archive','restore'].includes(input.action)){
    if(!/^[0-9a-f-]{36}$/.test(input.id||''))throw Error('Contact invalide.');
    return respond(await rpc(input.action,{id:input.id}));
   }
   const saved=await rpc('token');if(!saved?.cipher)throw Error('Raccordez d’abord la boîte commerciale.');
   async function pdf(){
    const r=await fetcher(brochure.url,{redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!r.ok||Number(r.headers.get('content-length'))>5242880)throw Error('Plaquette indisponible.');
    const reader=r.body.getReader(),chunks=[];let size=0;
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>5242880){await reader.cancel();throw Error('Plaquette trop volumineuse.');}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    if(new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')throw Error('Plaquette invalide.');return bytes;
   }
   async function digest(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
   if(input.action==='prepare'){
    const test=input.test===true;
    const recipient=input.recipient||'jeff91540@gmail.com';
    if(test&&!['jeff91540@gmail.com','nanayebylyne@gmail.com'].includes(recipient))throw Error('Adresse destinataire de test refusée.');
    const message=validateMessage(test?{recipient,subject:'Test CRM Nanayé — envoi et pièce jointe',body:'Bonjour,\n\nCeci est un message de test du CRM Nanayé, envoyé depuis notre boîte commerciale. La plaquette EVJF est jointe pour vérifier son ouverture.\n\nAucun prospect n’est destinataire de ce test.\n\nJefferson Caudron\nNanayé',attachment:brochure.id}:input);
    if(!test&&!/^[0-9a-f-]{36}$/.test(input.contact_id||''))throw Error('Contact invalide.');
    const attachment_hash=message.attachment?await digest(await pdf()):null;
    const content_hash=await hash(JSON.stringify({...message,contact_id:test?null:input.contact_id,test,attachment_hash}));
    return respond(await rpc('prepare',{...message,contact_id:test?null:input.contact_id,test,attachment_hash,content_hash}));
   }
   if(input.action==='test-history')return respond(await rpc('test-history',{id:input.id}));
   const c=validateConfig(env);const secret=await decrypt(saved.cipher,await encryptionKey(c),c.brandId+':'+mailbox);
   const refresh=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:c.clientId,client_secret:c.clientSecret,refresh_token:secret,grant_type:'refresh_token'}),signal:AbortSignal.timeout(10000)});
   if(!refresh.ok)throw Error('Autorisation Gmail expirée ou révoquée. Reconnectez la boîte.');
   const access=(await refresh.json()).access_token;if(!access)throw Error('Autorisation Gmail invalide.');
   const gmailHeaders={Authorization:'Bearer '+access,'Content-Type':'application/json'};
   if(input.action==='send'){
    if(env('NANAYE_GMAIL_SEND_ENABLED')!=='true')throw Error('Envoi non activé.');
    if(input.confirm!==true||!/^[0-9a-f-]{36}$/.test(input.id||''))throw Error('Confirmation explicite requise.');
    const message=await rpc('get',{id:input.id});
    if(message.status!=='prepared')return respond({status:message.status,id:message.id});
    const attachment=message.attachment?await pdf():null;
    if(attachment&&await digest(attachment)!==message.attachment_hash)throw Error('La plaquette a changé. Préparez une nouvelle prévisualisation.');
    const mime=mimeMessage(message,attachment);
    const locked=await rpc('claim',{id:message.id});if(!locked)return respond({status:'unknown',error:'Envoi déjà pris en charge. Consultez l’historique.'},409);
    claimed=message.id;
    // Exactly one network attempt after claim. Any ambiguous outcome stays non-retryable.
    const sent=await fetcher('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:gmailHeaders,body:JSON.stringify({raw:mime}),signal:AbortSignal.timeout(20000)});
    if(!sent.ok)throw Error('Résultat d’envoi à vérifier dans Gmail. Ne renvoyez pas le message.');
    const result=await sent.json();if(!result.id||!result.threadId)throw Error('Résultat Gmail incomplet.');
    const row=await rpc('sent',{id:message.id,gmail_id:result.id,thread_id:result.threadId});claimed=null;
    return respond({id:row.id,status:'sent'});
   }
   if(!/^[0-9a-f-]{36}$/.test(input.test_id||input.contact_id||''))throw Error('Contact invalide.');
   const threads=await rpc('threads',{contact_id:input.contact_id,test_id:input.test_id});let processed=0,truncated=threads.length>20;const started=Date.now();
   for(const t of threads.slice(0,20)){
    if(Date.now()-started>40000){truncated=true;break;}
    if(!/^[a-zA-Z0-9_-]+$/.test(t.thread_id))throw Error('Fil Gmail invalide.');
    const url='https://gmail.googleapis.com/gmail/v1/users/me/threads/'+t.thread_id+'?format=metadata&metadataHeaders=From&metadataHeaders=Subject&fields=id,messages(id,threadId,internalDate,labelIds,snippet,payload(headers))';
    const r=await fetcher(url,{headers:gmailHeaders,signal:AbortSignal.timeout(8000)});
    if(!r.ok)throw Error('Lecture Gmail interrompue. Les échanges déjà récupérés sont conservés.');
    const thread=await r.json();if(thread.id!==t.thread_id)throw Error('Fil Gmail invalide.');
    truncated ||= thread.messages?.length>100;
    await rpc('receive',{messages:receivedMessages(thread)});processed++;
   }
   return respond({processed,truncated,checkedAt:new Date().toISOString()});
  }catch(err){
   if(claimed){try{await rpc('unknown',{id:claimed});}catch{}return respond({error:'Résultat d’envoi à vérifier dans Gmail. Aucun nouvel essai automatique.',status:'unknown',id:claimed},409);}
   const safe=/^(Adresse destinataire|Objet invalide|Message invalide|Pièce jointe|Droits insuffisants|Raccordez|Plaquette|La plaquette|Autorisation Gmail|Envoi non activé|Confirmation explicite|Contact invalide|Lecture Gmail)/;
   return respond({error:safe.test(err.message)?err.message:'Opération impossible. Aucun nouvel essai automatique.'},400);
  }
 };
}
