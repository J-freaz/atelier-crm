export const mailbox='commercial.nanaye@gmail.com';
export const brochure={id:'evjf-v2',name:'Nanaye-plaquette-EVJF.pdf',url:'https://j-freaz.github.io/nanaye-evjf-presentation/brochure-nanaye-evjf.pdf?v=2'};
export function base64(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
const utf=s=>base64(new TextEncoder().encode(s));
const lines=s=>s.match(/.{1,76}/g)?.join('\r\n')||'';
export function validateMessage(x){
 if(typeof x.recipient!=='string'||x.recipient.length>254||! /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(x.recipient))throw Error('Adresse destinataire invalide.');
 if(typeof x.subject!=='string'||!x.subject.trim()||x.subject.length>200||/[\r\n\x00-\x1f]/.test(x.subject))throw Error('Objet invalide.');
 if(typeof x.body!=='string'||!x.body.trim()||x.body.length>20000||x.body.includes('\0'))throw Error('Message invalide.');
 if(x.attachment && x.attachment!==brochure.id)throw Error('Pièce jointe non autorisée.');
 return {recipient:x.recipient.toLowerCase(),subject:x.subject.trim(),body:x.body,attachment:x.attachment||null};
}
export function mimeMessage(x,pdf=null){
 validateMessage(x);
 if(!/^[0-9a-f-]{36}$/.test(x.id))throw Error('Identifiant invalide.');
 const boundary='nanaye_'+x.id.replaceAll('-','');
 const encodedSubject=[...x.subject].reduce((a,c)=>{if(!a.length||new TextEncoder().encode(a.at(-1)+c).length>42)a.push(c);else a[a.length-1]+=c;return a;},[]).map(s=>'=?UTF-8?B?'+utf(s)+'?=').join('\r\n ');
 const h=[`From: Nanaye <${mailbox}>`,`To: ${x.recipient}`,`Subject: ${encodedSubject}`,`Message-ID: <nanaye.${x.id}@gmail.com>`,'MIME-Version: 1.0',`Content-Type: multipart/mixed; boundary="${boundary}"`];
 h.push('',`--${boundary}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',lines(utf(x.body)));
 if(x.attachment){if(!pdf||pdf.length>5*1024*1024||new TextDecoder().decode(pdf.subarray(0,5))!=='%PDF-')throw Error('PDF invalide ou trop volumineux.');h.push(`--${boundary}`,`Content-Type: application/pdf; name="${brochure.name}"`,`Content-Disposition: attachment; filename="${brochure.name}"`,'Content-Transfer-Encoding: base64','',lines(base64(pdf)));}
 h.push(`--${boundary}--`,'');return utf(h.join('\r\n')).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
export function receivedMessages(thread){
 if(!thread||!Array.isArray(thread.messages))throw Error('Fil Gmail invalide.');
 return thread.messages.slice(-100).filter(m=>!m.labelIds?.includes('DRAFT')).map(m=>{
 const headers=m.payload?.headers||[];const get=n=>String(headers.find(h=>h.name.toLowerCase()===n.toLowerCase())?.value||'').slice(0,500);
 const from=get('From');const address=(from.match(/<([^>]+)>/)?.[1]||from).trim().toLowerCase();
 return {gmail_id:m.id,thread_id:thread.id,sender:from,subject:get('Subject'),snippet:String(m.snippet||'').slice(0,2000),direction:address===mailbox?'outgoing':'incoming',received_at:new Date(Number(m.internalDate)).toISOString()};
 });
}
