import {config} from './config.mjs';
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
 const {error}=await getAuthClient().auth.signInWithOAuth({provider:'google',options:{redirectTo:config.siteUrl,queryParams:{prompt:'select_account'}}});
 if(error)throw Error('La connexion Google ne peut pas démarrer. Réessayez plus tard.');
}
