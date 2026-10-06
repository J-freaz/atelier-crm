import {readPublic} from './network.mjs';
import {publicURL,robotsAllowed,extractPage,observations,candidateLinks} from '../../prospect.mjs';
const origin='https://j-freaz.github.io';
const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
const response=(body:unknown,status=200)=>Response.json(body,{status,headers:cors});
Deno.serve(async(req:Request)=>{
 if(req.headers.get('origin')&&req.headers.get('origin')!==origin)return response({error:'Origine refusée.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return response({error:'Méthode refusée.'},405);
 try{
  const authorization=req.headers.get('authorization')||'';
  if(!authorization.startsWith('Bearer '))return response({error:'Connexion requise.'},401);
  const base=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_ANON_KEY')!;
  const headers={apikey:key,Authorization:authorization,'Content-Type':'application/json'};
  // Verify the session with Auth; never decode-and-trust a supplied JWT.
  const user=await fetch(base+'/auth/v1/user',{headers,signal:AbortSignal.timeout(8000)});
  if(!user.ok)return response({error:'Session expirée. Reconnectez-vous.'},401);
  const raw=await req.text();if(raw.length>300)return response({error:'Requête invalide.'},400);
  const {recordId}=JSON.parse(raw);
  if(!/^[0-9a-f-]{36}$/i.test(recordId||''))return response({error:'Contact invalide.'},400);
  const result=await fetch(base+'/rest/v1/crm_records?id=eq.'+recordId+'&select=id,brand_id,website,status,archived,kind',{headers,signal:AbortSignal.timeout(8000)});
  if(!result.ok)return response({error:'Contact inaccessible.'},403);
  const [record]=await result.json();
  if(!record||record.kind!=='contact'||record.archived||record.status==='Ne plus contacter')return response({error:'Ce contact ne peut pas être analysé.'},403);
  const start=publicURL(record.website);
  const reserve=await fetch(base+'/rest/v1/rpc/crm_reserve_scan',{method:'POST',headers,body:JSON.stringify({record_id:recordId}),signal:AbortSignal.timeout(8000)});
  if(!reserve.ok)return response({error:'Votre rôle ne permet pas cette analyse.'},403);
  if(await reserve.json()!==true)return response({error:'Limite atteinte : 10 analyses par heure et personne, 40 par jour pour cette marque.'},429);
  const robots=new Map<string,string>();const warnings:string[]=[];const deadline=Date.now()+30000;
  const read=(url:string,options={})=>{const remaining=deadline-Date.now();if(remaining<500)throw Error('Le site a dépassé la durée maximale de consultation.');return readPublic(url,{...options,timeout:Math.min(8000,remaining)});};
  const allowedHosts=new Set([start.hostname,start.hostname.startsWith('www.')?start.hostname.slice(4):'www.'+start.hostname]);
  async function robotsFor(u:URL){
   if(robots.has(u.origin))return robots.get(u.origin)!;
   // Fail closed for robots redirects/errors; do not bypass site restrictions.
   const r=await read(u.origin+'/robots.txt',{maxBytes:100000});
   if(r.status!==200&&r.status!==404)throw Error('Le site ne permet pas de vérifier ses règles de consultation.');
   const text=r.status===404?'':r.text;robots.set(u.origin,text);return text;
  }
  async function page(url:string){
   let u=publicURL(url);
   for(let hop=0;hop<4;hop++){
    if(!allowedHosts.has(u.hostname))throw Error('Redirection vers un autre site : analyse arrêtée.');
    if(!robotsAllowed(await robotsFor(u),u.href))throw Error('Cette page refuse la consultation automatisée.');
    const r=await read(u.href);
    if([301,302,303,307,308].includes(r.status)){if(!r.headers.location)throw Error('Redirection invalide.');const next=publicURL(new URL(r.headers.location,u).href);if(u.protocol==='https:'&&next.protocol!=='https:')throw Error('Redirection non sécurisée.');u=next;continue;}
    if(r.status!==200)throw Error('Page inaccessible (HTTP '+r.status+').');
    if(!String(r.headers['content-type']||'').includes('text/html'))throw Error('Seules les pages web HTML sont analysées.');
    return extractPage(r.text,u.href);
   }throw Error('Trop de redirections.');
  }
  const pages=[];const seen=new Set<string>();const queue=[start.href];
  let attempts=0;
  while(queue.length&&attempts<4){
   const url=queue.shift()!;if(seen.has(url))continue;seen.add(url);attempts++;
   try{const p=await page(url);if(pages.some(x=>x.url===p.url))continue;pages.push(p);const root=new URL('/',p.url).href;if(!seen.has(root)&&!queue.includes(root))queue.push(root);for(const link of candidateLinks(p,new URL(p.url).origin)){if(!seen.has(link)&&!queue.includes(link))queue.push(link);}}
   catch(err){const message=err instanceof Error?err.message:'';warnings.push(/^(Cette page|Le site|Page |Redirection |Trop de |Seules |Destination |Format de |Transfert |Réponse HTTP)/.test(message)?message:'Cette page n’a pas pu être lue. Préparez le message manuellement si nécessaire.');}
  }
  if(!pages.length)return response({error:warnings[0]||'Aucune page lisible. Vous pouvez rédiger un message manuellement.'},422);
  return response({scannedAt:new Date().toISOString(),pages:pages.map(p=>({url:p.url,title:p.title})),evidence:observations(pages),warnings,method:'structured'});
 }catch{return response({error:'Analyse indisponible. Vérifiez le site renseigné ou préparez un message manuel.'},422);}
});
