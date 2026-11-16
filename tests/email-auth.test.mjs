import test from 'node:test';
import assert from 'node:assert/strict';
import {config} from '../config.mjs?v=20261116-1';
import {createEmailOtpAuth,normalizeLoginEmail,validLoginEmail,validEmailOtp,emailOtpLength,emailAuthErrorMessage,getAuthClient,googleSignIn} from '../auth.mjs?v=20261116-1';
import {bindEmailLogin} from '../login-ui.mjs?v=20261116-1';
import {RemoteStore} from '../store.mjs?v=20261116-1';

const session={user:{id:'test-user'},access_token:'test-session-token',expires_at:Math.floor(Date.now()/1000)+3600};
function fakeClient(){
 let current=null;const calls=[];
 return {calls,auth:{
  signInWithOtp:async input=>{calls.push(['request',input]);return {data:{},error:null};},
  verifyOtp:async input=>{calls.push(['verify',input]);current=session;return {data:{session,user:session.user},error:null};},
  getSession:async()=>({data:{session:current},error:null}),
  signInWithOAuth:async input=>{calls.push(['oauth',input]);return {data:{},error:null};}
 }};
}

test('email auth is disabled by default and cannot call the provider',async()=>{
 assert.equal(config.emailOtpEnabled,false);
 let count=0;const auth=createEmailOtpAuth({enabled:false,getClient:()=>{count++;return fakeClient();}});
 await assert.rejects(auth.requestCode('person@example.com'),{code:'ATELIER_EMAIL_DISABLED'});
 await assert.rejects(auth.verifyCode('person@example.com','123456'),{code:'ATELIER_EMAIL_DISABLED'});
 assert.equal(count,0);
});

test('normalizes email and validates the configured numeric OTP before the provider',async()=>{
 assert.equal(normalizeLoginEmail(' Person@Example.com '),'person@example.com');
 for(const email of ['',null,'person','a@b','a b@example.com','a@@example.com',`${'a'.repeat(250)}@example.com`])assert.equal(validLoginEmail(email),false);
 assert.equal(validLoginEmail('person+crm@example.co.uk'),true);
 assert.equal(emailOtpLength(),6);
 assert.equal(emailOtpLength(10),10);
 assert.equal(emailOtpLength(5000),6);
 assert.equal(validEmailOtp(' 123456 '),true);
 for(const token of ['12345','1234567','12e456','１２３４５６','123 456'])assert.equal(validEmailOtp(token),false);
 const sdk=fakeClient(),auth=createEmailOtpAuth({enabled:true,getClient:()=>sdk});
 await assert.rejects(auth.requestCode('bad address'),{code:'ATELIER_INVALID_EMAIL'});
 await assert.rejects(auth.verifyCode('person@example.com','12345'),{code:'ATELIER_INVALID_CODE'});
 assert.equal(sdk.calls.length,0);
 const longer=createEmailOtpAuth({enabled:true,getClient:()=>sdk,length:10});
 await longer.verifyCode('person@example.com','1234567890');
 assert.equal(sdk.calls[0][1].token,'1234567890');
});

test('requests no automatic signup and verification populates the same SDK session',async()=>{
 const sdk=fakeClient(),auth=createEmailOtpAuth({enabled:true,getClient:()=>sdk});
 assert.deepEqual(await auth.requestCode(' Person@Example.com '),{email:'person@example.com'});
 assert.deepEqual(sdk.calls[0],['request',{email:'person@example.com',options:{shouldCreateUser:false}}]);
 assert.equal((await sdk.auth.getSession()).data.session,null);
 assert.equal(await auth.verifyCode(' Person@Example.com ',' 123456 '),session);
 assert.deepEqual(sdk.calls[1],['verify',{email:'person@example.com',token:'123456',type:'email'}]);
 assert.equal((await sdk.auth.getSession()).data.session,session);
});

test('provider errors do not disclose raw messages, addresses or account existence',async()=>{
 for(const providerError of [{code:'user_not_found',message:'Unknown person@example.com; secret=abc'},{message:'SMTP credential secret=abc'},new Error('secret=abc')]){
  const auth=createEmailOtpAuth({enabled:true,getClient:()=>({auth:{signInWithOtp:async()=>({error:providerError}),verifyOtp:async()=>{throw providerError;}}})});
  await assert.rejects(auth.requestCode('person@example.com'),error=>error.code==='ATELIER_REQUEST_FAILED'&&!/secret|person@|Unknown/.test(error.message));
  await assert.rejects(auth.verifyCode('person@example.com','123456'),error=>error.code==='ATELIER_VERIFY_FAILED'&&!/secret|person@|Unknown/.test(error.message));
 }
 assert.doesNotMatch(emailAuthErrorMessage({code:123,message:'private'}),/private/);
 assert.doesNotMatch(emailAuthErrorMessage(new Error('private'),'verify'),/private/);
});

test('rate limiting is distinguished without echoing provider responses',async()=>{
 for(const error of [{status:429,message:'private'},{code:'over_email_send_rate_limit'},{code:'over_request_rate_limit'}]){
  const auth=createEmailOtpAuth({enabled:true,getClient:()=>({auth:{signInWithOtp:async()=>({error}),verifyOtp:async()=>({error})}})});
  await assert.rejects(auth.requestCode('person@example.com'),{code:'ATELIER_RATE_LIMITED'});
  await assert.rejects(auth.verifyCode('person@example.com','123456'),{code:'ATELIER_RATE_LIMITED'});
 }
});

test('verification without an authenticated session never reports success',async()=>{
 for(const data of [null,{}, {user:{id:'test-user'}},{session:{user:null}}]){
  const auth=createEmailOtpAuth({enabled:true,getClient:()=>({auth:{verifyOtp:async()=>({data,error:null})}})});
  await assert.rejects(auth.verifyCode('person@example.com','123456'),{code:'ATELIER_SESSION_MISSING'});
 }
 const unavailable=createEmailOtpAuth({enabled:true,getClient:()=>null});
 await assert.rejects(unavailable.requestCode('person@example.com'),{code:'ATELIER_REQUEST_FAILED'});
});

test('email UI, Google and RemoteStore share one SDK session through claim/load and preserve PKCE memory storage',async()=>{
 const oldSDK=globalThis.supabase,storageDescriptor=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage'),oldEnabled=config.emailOtpEnabled,oldFetch=globalThis.fetch;
 const sdk=fakeClient(),stored=new Map();let creations=0,options;
 // Deno's Storage setter ignores assignment; replacing its configurable accessor is required.
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)}});
 globalThis.supabase={createClient:(_url,_key,opts)=>{creations++;options=opts;return sdk;}};
 const requests=[],tables={crm_brands:[{id:'operia',profile:'operia'}],crm_members:[{brand_id:'operia',user_id:'test-user',role:'commercial'}],crm_records:[{id:'assigned',brand_id:'operia',owner_id:'test-user',kind:'contact'}],crm_events:[]};
 globalThis.fetch=async(url,input)=>{
  const resource=new URL(url).pathname.replace('/rest/v1/','');
  assert.equal(input.headers.Authorization,'Bearer '+session.access_token);
  requests.push(resource);
  if(resource==='rpc/crm_claim_access'){assert.equal(input.method,'POST');return Response.json(1);}
  assert.ok(Object.hasOwn(tables,resource),'No unexpected network destination');return Response.json(tables[resource]);
 };
 const nodes={};for(const key of ['address-form','address','request','code-form','code','verify','resend','change','status','error'])nodes[key]={value:'',textContent:'',focus(){}};
 let remote,result,cleanup;
 config.emailOtpEnabled=true;
 try{
  assert.equal(getAuthClient(),sdk);
  await googleSignIn();
  cleanup=bindEmailLogin({root:{querySelector:selector=>nodes[selector.replace('#email-login-','')]},setTimer:()=>0,clearTimer:()=>{},onAuthenticated:async()=>{
   remote=new RemoteStore();assert.equal(await remote.session(),session);
   await remote.request('rpc/crm_claim_access','POST',{});result=await remote.load();
  }});
  nodes.address.value='person@example.com';await nodes['address-form'].onsubmit({preventDefault(){}});
  assert.equal((await sdk.auth.getSession()).data.session,null);
  nodes.code.value='123456';await nodes['code-form'].onsubmit({preventDefault(){}});
  assert.equal(nodes.error.textContent,'');assert.equal(nodes.code.value,'');
  assert.equal(remote.client,sdk);assert.deepEqual(result,{brands:tables.crm_brands,members:tables.crm_members,records:tables.crm_records,events:tables.crm_events});
  assert.deepEqual(requests,['rpc/crm_claim_access','crm_brands','crm_members','crm_records','crm_events']);
  assert.equal((await getAuthClient().auth.getSession()).data.session,session);
  assert.equal(creations,1);
  assert.equal(sdk.calls[0][1].provider,'google');
  assert.equal(sdk.calls[0][1].options.redirectTo,config.siteUrl);
  assert.equal(options.auth.flowType,'pkce');
  assert.equal(options.auth.storageKey,'atelier-nanaye-auth');
  options.auth.storage.setItem('test-session','session');
  assert.equal(stored.has('test-session'),false);
  assert.equal(options.auth.storage.getItem('test-session'),'session');
  options.auth.storage.setItem('test-code-verifier','verifier');
  assert.equal(stored.get('test-code-verifier'),'verifier');
  options.auth.storage.removeItem('test-session');
  options.auth.storage.removeItem('test-code-verifier');
 }finally{
  cleanup?.();globalThis.supabase=oldSDK;globalThis.fetch=oldFetch;config.emailOtpEnabled=oldEnabled;
  if(storageDescriptor)Object.defineProperty(globalThis,'sessionStorage',storageDescriptor);else delete globalThis.sessionStorage;
 }
});
