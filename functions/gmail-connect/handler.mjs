import {validateConfig,nonce,hash,authURL,encrypt,decrypt,checkConsent,encryptionKey} from './security.mjs';
const origin='https://j-freaz.github.io';
const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Cache-Control':'no-store'};
export function createHandler({env,fetcher=fetch}){
 const response=(body,status=200)=>Response.json(body,{status,headers:cors});
 return async req=>{
  if(req.headers.get('origin')!==origin)return response({error:'Origine refusée.'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST')return response({error:'Méthode refusée.'},405);
  try{
   const authorization=req.headers.get('authorization')||'';
   if(!authorization.startsWith('Bearer '))return response({error:'Connexion CRM requise.'},401);
   const base=env('SUPABASE_URL'),anon=env('SUPABASE_ANON_KEY'),service=env('SUPABASE_SERVICE_ROLE_KEY');
   if(!base||!anon||!service)return response({error:'Configuration serveur incomplète.'},503);
   const userHeaders={apikey:anon,Authorization:authorization};
   const auth=await fetcher(base+'/auth/v1/user',{headers:userHeaders,signal:AbortSignal.timeout(8000)});
   if(!auth.ok)return response({error:'Reconnectez-vous au CRM.'},401);
   const user=await auth.json();if(!user.id)return response({error:'Session invalide.'},401);
   const raw=await req.text();if(raw.length>16000)return response({error:'Requête trop longue.'},400);
   const input=JSON.parse(raw);if(!['status','start','finish'].includes(input.action))return response({error:'Action inconnue.'},400);
   // Membership is checked by PostgreSQL on every operation, including after OAuth.
   async function rpc(operation,payload={}){
    const res=await fetcher(base+'/rest/v1/rpc/crm_gmail_internal',{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify({operation,actor:user.id,payload}),signal:AbortSignal.timeout(8000)});
    if(!res.ok)throw Error('Accès à la messagerie refusé ou temporairement indisponible.');return res.json();
   }
   const status=await rpc('status');
   if(input.action==='status'){let configured=true;try{validateConfig(env);}catch{configured=false;}return response({...status,configured});}
   const c=validateConfig(env);c.key=await encryptionKey(c);
   if(input.action==='start'){
    const state=nonce(),verifier=nonce();
    await rpc('start',{stateHash:await hash(state),verifierCipher:await encrypt(verifier,c.key,user.id+':'+state)});
    return response({url:authURL(c,state,await hash(verifier)),state});
   }
   if(!/^[A-Za-z0-9_-]{43}$/.test(input.state||'')||typeof input.code!=='string'||input.code.length>4096)return response({error:'Retour Google invalide.'},400);
   const saved=await rpc('consume',{stateHash:await hash(input.state)});
   if(!saved)return response({error:'Autorisation expirée ou déjà utilisée. Recommencez.'},400);
   const verifier=await decrypt(saved.verifierCipher,c.key,user.id+':'+input.state);
   const exchange=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:c.clientId,client_secret:c.clientSecret,code:input.code,code_verifier:verifier,redirect_uri:c.redirect,grant_type:'authorization_code'}),signal:AbortSignal.timeout(15000)});
   if(!exchange.ok)return response({error:'Google refuse l’autorisation. Vérifiez le client Gmail, son secret et son adresse de retour.'},400);
   const token=await exchange.json();
   const profileResponse=await fetcher('https://gmail.googleapis.com/gmail/v1/users/me/profile',{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(10000)});
   if(!profileResponse.ok)return response({error:'Gmail ne répond pas. Vérifiez que Gmail API est activée et que la lecture a été autorisée.'},400);
   const profile=await profileResponse.json();checkConsent(token,profile,c);
   const result=await rpc('connect',{email:c.mailbox,refreshCipher:await encrypt(token.refresh_token,c.key,c.brandId+':'+c.mailbox),scopes:token.scope});
   return response(result);
  }catch(err){
   // Never log OAuth codes, tokens, raw Google replies or supplied secrets.
   const safe=['Gmail non configuré.','Les permissions d’envoi et de lecture doivent être autorisées.','Utilisez uniquement la boîte commerciale Nanayé.','Autorisation durable absente. Recommencez la connexion.','Accès à la messagerie refusé ou temporairement indisponible.'];
   return response({error:safe.includes(err.message)?err.message:'Connexion Gmail non finalisée. Réessayez depuis le CRM.'},400);
  }
 };
}
