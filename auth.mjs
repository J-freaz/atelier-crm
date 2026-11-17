import {config} from './config.mjs?v=20261117-2';
let client;
const memory=new Map();
// Only the short-lived PKCE verifier survives the redirect. Sessions remain in memory.
const storage={
 getItem:key=>key.endsWith('-code-verifier')?sessionStorage.getItem(key):(memory.get(key)||null),
 setItem:(key,value)=>{if(key.endsWith('-code-verifier'))sessionStorage.setItem(key,value);else memory.set(key,value);},
 removeItem:key=>{memory.delete(key);sessionStorage.removeItem(key);}
};
export function getAuthClient(){
 if(!config.url||!globalThis.supabase)return null;
 if(!client)client=globalThis.supabase.createClient(config.url,config.publishableKey,{auth:{flowType:'pkce',persistSession:true,storage,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'atelier-nanaye-auth'}});
 return client;
}
export async function googleSignIn(){
 if(!config.googleEnabled)throw Error('La connexion Google est encore en cours de configuration.');
 const authClient=getAuthClient();
 if(!authClient)throw Error('La connexion Google ne peut pas démarrer. Réessayez plus tard.');
 const {error}=await authClient.auth.signInWithOAuth({provider:'google',options:{redirectTo:config.siteUrl,queryParams:{prompt:'select_account'}}});
 if(error)throw Error('La connexion Google ne peut pas démarrer. Réessayez plus tard.');
}

const emailMessages={
 EMAIL_DISABLED:'La connexion par e-mail n’est pas encore activée.',
 INVALID_EMAIL:'Saisissez une adresse e-mail valide.',
 INVALID_CODE:'Saisissez le code numérique reçu par e-mail.',
 RATE_LIMITED:'Trop de tentatives rapprochées. Patientez une minute avant de réessayer.',
 REQUEST_FAILED:'La demande de code n’a pas pu aboutir. Réessayez plus tard ou contactez votre administrateur.',
 VERIFY_FAILED:'Le code est incorrect ou expiré. Vérifiez-le ou demandez un nouveau code.',
 SESSION_MISSING:'La connexion n’a pas pu être finalisée. Réessayez plus tard.'
};
function emailError(code){return Object.assign(new Error(emailMessages[code]),{code:`ATELIER_${code}`});}
export function emailAuthErrorMessage(error,phase='request'){
 const code=typeof error?.code==='string'?error.code.replace(/^ATELIER_/,''):'';
 return typeof error?.code==='string'&&error.code.startsWith('ATELIER_')&&Object.hasOwn(emailMessages,code)?emailMessages[code]:emailMessages[phase==='verify'?'VERIFY_FAILED':'REQUEST_FAILED'];
}
export function normalizeLoginEmail(value){return String(value??'').trim().toLowerCase();}
export function validLoginEmail(value){const email=normalizeLoginEmail(value);return email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);}
// Supabase defaults to six digits. Keep this in sync with the provider before activation.
export function emailOtpLength(value=config.emailOtpLength){return Number.isInteger(value)&&value>=6&&value<=10?value:6;}
export function validEmailOtp(value,length=emailOtpLength()){return new RegExp(`^[0-9]{${emailOtpLength(length)}}$`).test(String(value??'').trim());}
function rateLimited(error){return error?.status===429||['over_email_send_rate_limit','over_request_rate_limit'].includes(error?.code);}

// Injectable for tests; production always uses the same SDK client as RemoteStore.session().
export function createEmailOtpAuth({getClient=getAuthClient,enabled=()=>config.emailOtpEnabled,length=()=>emailOtpLength()}={}){
 function requireEnabled(){if(!(typeof enabled==='function'?enabled():enabled))throw emailError('EMAIL_DISABLED');}
 function emailFor(value){const email=normalizeLoginEmail(value);if(!validLoginEmail(email))throw emailError('INVALID_EMAIL');return email;}
 async function requestCode(value){
  requireEnabled();const email=emailFor(value);let result;
  try{
   const authClient=getClient();if(!authClient?.auth)throw Error();
   // Accounts must be provisioned separately by the administrator. No public signup.
   result=await authClient.auth.signInWithOtp({email,options:{shouldCreateUser:false}});
  }catch(error){throw emailError(rateLimited(error)?'RATE_LIMITED':'REQUEST_FAILED');}
  if(result?.error)throw emailError(rateLimited(result.error)?'RATE_LIMITED':'REQUEST_FAILED');
  if(!result)throw emailError('REQUEST_FAILED');
  return {email};
 }
 async function verifyCode(value,rawCode){
  requireEnabled();const email=emailFor(value),token=String(rawCode??'').trim();
  if(!validEmailOtp(token,typeof length==='function'?length():length))throw emailError('INVALID_CODE');
  let result;
  try{
   const authClient=getClient();if(!authClient?.auth)throw Error();
   // verifyOtp saves the session in that SDK client; do not bypass it with REST tokens.
   result=await authClient.auth.verifyOtp({email,token,type:'email'});
  }catch(error){throw emailError(rateLimited(error)?'RATE_LIMITED':'VERIFY_FAILED');}
  if(result?.error)throw emailError(rateLimited(result.error)?'RATE_LIMITED':'VERIFY_FAILED');
  if(!result?.data?.session?.user?.id)throw emailError('SESSION_MISSING');
  return result.data.session;
 }
 return {requestCode,verifyCode};
}
const emailAuth=createEmailOtpAuth();
export const requestEmailCode=emailAuth.requestCode;
export const verifyEmailCode=emailAuth.verifyCode;
