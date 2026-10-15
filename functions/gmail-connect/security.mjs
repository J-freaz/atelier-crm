// Server-only OAuth helpers. Never import into the frontend.
export const scopes=['https://www.googleapis.com/auth/gmail.send','https://www.googleapis.com/auth/gmail.readonly'];
export function validateConfig(env){
 const get=k=>String(env(k)||'');
 const c={clientId:get('NANAYE_GMAIL_CLIENT_ID'),clientSecret:get('NANAYE_GMAIL_CLIENT_SECRET'),key:get('NANAYE_GMAIL_ENCRYPTION_KEY'),mailbox:(get('NANAYE_GMAIL_ADDRESS')||'commercial.nanaye@gmail.com').toLowerCase(),brandId:get('NANAYE_GMAIL_BRAND_ID')||'db60e148-afb6-4870-9c8e-1c9330706f22',redirect:'https://j-freaz.github.io/atelier-crm/gmail-callback.html'};
 if(!c.clientId.endsWith('.apps.googleusercontent.com')||!c.clientSecret||(c.key&&!/^[0-9a-f]{64}$/i.test(c.key))||c.mailbox!=='commercial.nanaye@gmail.com'||c.brandId!=='db60e148-afb6-4870-9c8e-1c9330706f22')throw Error('Gmail non configuré.');return c;
}
const bytesTo64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const from64=value=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
export function nonce(){return bytesTo64(crypto.getRandomValues(new Uint8Array(32)));}
export async function hash(value){return bytesTo64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));}
export function authURL(c,state,challenge){const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');u.search=new URLSearchParams({client_id:c.clientId,redirect_uri:c.redirect,response_type:'code',scope:scopes.join(' '),access_type:'offline',prompt:'consent select_account',login_hint:c.mailbox,state,code_challenge:challenge,code_challenge_method:'S256'});return u.href;}
async function key(hex){return crypto.subtle.importKey('raw',Uint8Array.from(hex.match(/../g),x=>parseInt(x,16)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
export async function encrypt(value,hex,context){const iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(context)},await key(hex),new TextEncoder().encode(value));return 'v1.'+bytesTo64(iv)+'.'+bytesTo64(new Uint8Array(encrypted));}
export async function decrypt(value,hex,context){const [v,iv,data]=value.split('.');if(v!=='v1'||!iv||!data)throw Error('Invalid ciphertext');const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(iv),additionalData:new TextEncoder().encode(context)},await key(hex),from64(data));return new TextDecoder().decode(plain);}
export function checkConsent(token,profile,c){
 const granted=new Set(String(token.scope||'').split(' '));if(scopes.some(s=>!granted.has(s)))throw Error('Les permissions d’envoi et de lecture doivent être autorisées.');
 if(String(profile.emailAddress||'').toLowerCase()!==c.mailbox)throw Error('Utilisez uniquement la boîte commerciale Nanayé.');
 if(!token.refresh_token)throw Error('Autorisation durable absente. Recommencez la connexion.');
}

// Domain-separated HKDF avoids storing another secret. Rotation of the OAuth
// client secret requires reconnecting Gmail; no silent loss or token recovery.
export async function encryptionKey(c){
 if(c.key)return c.key;
 const source=await crypto.subtle.importKey('raw',new TextEncoder().encode(c.clientSecret),'HKDF',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:new TextEncoder().encode(c.brandId),info:new TextEncoder().encode('nanaye-crm/gmail-refresh-encryption/v1')},source,256);
 return [...new Uint8Array(bits)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
