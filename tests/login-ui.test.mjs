import test from 'node:test';
import assert from 'node:assert/strict';
import {emailLoginMarkup,bindEmailLogin} from '../login-ui.mjs?v=20261116-2';

function fixture(options={}){
 const nodes={};
 for(const key of ['address-form','address','request','existing','code-form','code','verify','resend','change','status','error'])nodes[key]={value:'',textContent:'',hidden:false,disabled:false,focus(){this.focused=true;}};
 let clock=0,id=0;const timers=new Map(),calls=[];
 const root={querySelector:selector=>nodes[selector.replace('#email-login-','')]};
 const cleanup=bindEmailLogin({root,enabled:true,otpLength:6,onAuthenticated:async()=>calls.push(['resume']),requestCode:async email=>{calls.push(['request',email]);},verifyCode:async(email,code)=>{calls.push(['verify',email,code]);return {user:{id:'test-user'}};},now:()=>clock,setTimer:fn=>{timers.set(++id,fn);return id;},clearTimer:key=>timers.delete(key),...options});
 const submit=key=>nodes[key].onsubmit?.({preventDefault(){}});
 return {nodes,calls,timers,cleanup,submit,advance(ms){clock+=ms;const pending=[...timers.values()];timers.clear();for(const fn of pending)fn();}};
}
const deferred=()=>{let resolve,reject;const promise=new Promise((ok,no)=>{resolve=ok;reject=no;});return {promise,resolve,reject};};

test('disabled email login renders nothing and binds no network handlers',()=>{
 assert.equal(emailLoginMarkup(), '');
 let touched=false;
 const cleanup=bindEmailLogin({enabled:false,root:{querySelector(){touched=true;}},requestCode:()=>{throw Error('Unexpected request');}});
 cleanup();assert.equal(touched,false);
 assert.match(emailLoginMarkup({enabled:true}),/autocomplete="one-time-code"/);
 assert.match(emailLoginMarkup({enabled:true}),/pattern="\[0-9\]\{8\}"/);
 assert.match(emailLoginMarkup({enabled:true}),/id="email-login-existing" type="button">J’ai déjà un code/);
 assert.match(emailLoginMarkup({enabled:true,otpLength:6}),/pattern="\[0-9\]\{6\}"/);
 assert.match(emailLoginMarkup({enabled:true,otpLength:10}),/maxlength="10"/);
});

test('an existing code validates and captures its address without requesting any email',async()=>{
 const f=fixture({otpLength:8});
 try{
  f.nodes.address.value='invalid';f.nodes.existing.onclick();
  assert.equal(f.nodes['code-form'].hidden,true);assert.match(f.nodes.error.textContent,/adresse e-mail valide/);
  assert.deepEqual(f.calls,[]);
  f.nodes.address.value=' Person@Example.com ';f.nodes.existing.onclick();
  assert.equal(f.nodes.address.value,'person@example.com');assert.equal(f.nodes.address.disabled,true);
  assert.equal(f.nodes['code-form'].hidden,false);assert.equal(f.nodes.code.focused,true);
  assert.equal(f.nodes.existing.disabled,true);assert.equal(f.nodes.error.textContent,'');
  assert.match(f.nodes.status.textContent,/Saisissez le code reçu/);assert.deepEqual(f.calls,[]);
  // Even a scripted edit cannot change the email bound to the current challenge.
  f.nodes.address.value='other@example.com';f.nodes.existing.onclick();
  f.nodes.code.value='123456';await f.submit('code-form');assert.deepEqual(f.calls,[]);
  f.nodes.code.value='12345678';await f.submit('code-form');
  assert.deepEqual(f.calls,[['verify','person@example.com','12345678'],['resume']]);
  assert.equal(f.nodes.code.value,'');assert.equal(f.nodes.existing.disabled,true);
 }finally{f.cleanup();}
});

test('existing-code entry preserves resend cooldown while allowing verification',async()=>{
 const f=fixture();
 try{
  f.nodes.address.value='person@example.com';await f.submit('address-form');f.advance(10000);
  f.nodes.change.onclick();f.nodes.address.value='another@example.com';f.nodes.existing.onclick();
  assert.equal(f.nodes.resend.disabled,true);assert.match(f.nodes.resend.textContent,/50 s/);
  assert.equal(f.nodes.verify.disabled,false);await f.nodes.resend.onclick();
  assert.deepEqual(f.calls,[['request','person@example.com']]);
  f.nodes.code.value='123456';await f.submit('code-form');
  assert.deepEqual(f.calls,[['request','person@example.com'],['verify','another@example.com','123456'],['resume']]);
 }finally{f.cleanup();}
});

test('changing to an existing code cannot bypass verification rate limits',async()=>{
 let verifications=0;
 const f=fixture({verifyCode:async()=>{verifications++;throw Object.assign(new Error('private'),{code:'ATELIER_RATE_LIMITED'});}});
 try{
  f.nodes.address.value='person@example.com';f.nodes.existing.onclick();f.nodes.code.value='123456';await f.submit('code-form');
  f.nodes.change.onclick();f.nodes.address.value='another@example.com';f.nodes.existing.onclick();
  assert.equal(f.nodes.code.disabled,true);assert.equal(f.nodes.verify.disabled,true);assert.equal(f.nodes.resend.disabled,true);
  f.nodes.code.value='123456';await f.submit('code-form');await f.nodes.resend.onclick();
  assert.equal(verifications,1);assert.deepEqual(f.calls,[]);
  f.advance(60000);assert.equal(f.nodes.verify.disabled,false);assert.equal(f.nodes.resend.disabled,false);
  await f.submit('code-form');assert.equal(verifications,2);
 }finally{f.cleanup();}
});

test('existing-code entry cannot replace a pending request or verification',async()=>{
 const pending=deferred(),f=fixture({requestCode:()=>pending.promise});
 try{
  f.nodes.address.value='person@example.com';const request=f.submit('address-form');
  f.nodes.address.value='other@example.com';f.nodes.existing.onclick();
  assert.equal(f.nodes.existing.disabled,true);assert.equal(f.nodes['code-form'].hidden,true);
  pending.resolve({});await request;
  assert.equal(f.nodes.address.value,'person@example.com');
  f.nodes.code.value='123456';await f.submit('code-form');
  assert.deepEqual(f.calls,[['verify','person@example.com','123456'],['resume']]);
 }finally{f.cleanup();}
 const pendingVerify=deferred(),v=fixture({verifyCode:(email,code)=>{v.calls.push(['verify',email,code]);return pendingVerify.promise;}});
 try{
  v.nodes.address.value='person@example.com';v.nodes.existing.onclick();v.nodes.code.value='123456';const verification=v.submit('code-form');
  v.nodes.address.value='other@example.com';v.nodes.existing.onclick();v.nodes.change.onclick();
  assert.equal(v.nodes.existing.disabled,true);assert.equal(v.nodes['code-form'].hidden,false);
  pendingVerify.resolve({user:{id:'test-user'}});await verification;
  assert.deepEqual(v.calls,[['verify','person@example.com','123456'],['resume']]);
 }finally{v.cleanup();}
});

test('cleanup removes existing-code entry and ignores a retained handler',()=>{
 const f=fixture(),useExisting=f.nodes.existing.onclick;
 f.nodes.address.value='person@example.com';f.cleanup();
 assert.equal(f.nodes.existing.onclick,null);assert.equal(f.nodes.address.value,'');
 f.nodes.address.value='other@example.com';useExisting();
 assert.equal(f.nodes['code-form'].hidden,true);assert.deepEqual(f.calls,[]);assert.equal(f.timers.size,0);
});

test('request validates email, reveals code entry and prevents resend during 60 seconds',async()=>{
 const f=fixture();
 try{
  f.nodes.address.value='invalid';await f.submit('address-form');assert.equal(f.calls.length,0);
  assert.match(f.nodes.error.textContent,/adresse e-mail valide/);
  f.nodes.address.value=' Person@Example.com ';await f.submit('address-form');
  assert.deepEqual(f.calls,[['request','person@example.com']]);assert.equal(f.nodes['code-form'].hidden,false);
  assert.equal(f.nodes.address.disabled,true);assert.equal(f.nodes.resend.disabled,true);
  assert.match(f.nodes.status.textContent,/Si cette adresse dispose d’un accès/);
  await f.nodes.resend.onclick();assert.equal(f.calls.length,1);
  f.advance(59000);assert.match(f.nodes.resend.textContent,/1 s/);assert.equal(f.nodes.resend.disabled,true);
  f.advance(1000);assert.equal(f.nodes.resend.disabled,false);
  await f.nodes.resend.onclick();assert.equal(f.calls.length,2);assert.equal(f.nodes.resend.disabled,true);
 }finally{f.cleanup();assert.equal(f.timers.size,0);}
});

test('double submit cannot request two codes, and changing email cannot bypass cooldown',async()=>{
 const pending=deferred();let count=0;
 const f=fixture({requestCode:()=>{count++;return pending.promise;}});
 try{
  f.nodes.address.value='person@example.com';const first=f.submit('address-form');await f.submit('address-form');
  assert.equal(count,1);assert.equal(f.nodes.request.disabled,true);
  pending.resolve({});await first;
  f.nodes.code.value='123456';f.nodes.change.onclick();
  assert.equal(f.nodes['code-form'].hidden,true);assert.equal(f.nodes.code.value,'');
  assert.equal(f.nodes.address.disabled,false);assert.equal(f.nodes.request.disabled,true);
  f.nodes.address.value='another@example.com';await f.submit('address-form');assert.equal(count,1);
 }finally{f.cleanup();}
});

test('only a verified session resumes the CRM, once, and removes the entered code',async()=>{
 const f=fixture();
 try{
  f.nodes.address.value='person@example.com';await f.submit('address-form');
  f.nodes.code.value='12345';await f.submit('code-form');assert.equal(f.calls.length,1);
  f.nodes.code.value='123456';await f.submit('code-form');
  assert.deepEqual(f.calls,[['request','person@example.com'],['verify','person@example.com','123456'],['resume']]);
  assert.equal(f.nodes.code.value,'');assert.equal(f.nodes.verify.disabled,true);
  await f.submit('code-form');assert.equal(f.calls.length,3);
 }finally{f.cleanup();}
});

test('verification failure clears code and never resumes or exposes provider details',async()=>{
 const f=fixture({verifyCode:async()=>{throw new Error('private token=123456 person@example.com');}});
 try{
  f.nodes.address.value='person@example.com';await f.submit('address-form');
  f.nodes.code.value='123456';await f.submit('code-form');
  assert.equal(f.nodes.code.value,'');assert.equal(f.calls.length,1);
  assert.match(f.nodes.error.textContent,/incorrect ou expiré/);assert.doesNotMatch(f.nodes.error.textContent,/private|123456|person@/);
  assert.equal(f.nodes.verify.disabled,false);
 }finally{f.cleanup();}
});

test('a rate-limit response pauses both request and verification buttons',async()=>{
 const f=fixture({verifyCode:async()=>{throw Object.assign(new Error('private'),{code:'ATELIER_RATE_LIMITED'});}});
 try{
  f.nodes.address.value='person@example.com';await f.submit('address-form');f.advance(60000);
  f.nodes.code.value='123456';await f.submit('code-form');
  assert.equal(f.nodes.verify.disabled,true);assert.equal(f.nodes.resend.disabled,true);
  f.advance(60000);assert.equal(f.nodes.verify.disabled,false);assert.equal(f.nodes.resend.disabled,false);
 }finally{f.cleanup();}
});

test('request errors stay generic and rate-limit waits also apply before code entry',async()=>{
 let mode='generic';const f=fixture({requestCode:async()=>{throw mode==='generic'?new Error('private smtp credentials'):Object.assign(new Error('private'),{code:'ATELIER_RATE_LIMITED'});}});
 try{
  f.nodes.address.value='person@example.com';await f.submit('address-form');
  assert.equal(f.nodes['code-form'].hidden,true);assert.doesNotMatch(f.nodes.error.textContent,/private|smtp/);
  assert.equal(f.nodes.request.disabled,false);mode='rate';await f.submit('address-form');
  assert.equal(f.nodes.request.disabled,true);assert.match(f.nodes.error.textContent,/Patientez/);
  f.advance(60000);assert.equal(f.nodes.request.disabled,false);
 }finally{f.cleanup();}
});

test('leaving login discards pending request results, handlers, email and code',async()=>{
 const pending=deferred(),f=fixture({requestCode:()=>pending.promise});
 f.nodes.address.value='person@example.com';f.nodes.code.value='123456';
 const request=f.submit('address-form');f.cleanup();pending.resolve({});await request;
 assert.equal(f.nodes.address.value,'');assert.equal(f.nodes.code.value,'');
 assert.equal(f.nodes['address-form'].onsubmit,null);assert.equal(f.nodes.resend.onclick,null);
 assert.equal(f.timers.size,0);assert.equal(f.calls.length,0);
});

test('leaving login during verification never opens the CRM after navigation',async()=>{
 const pending=deferred(),f=fixture({verifyCode:()=>pending.promise});
 f.nodes.address.value='person@example.com';await f.submit('address-form');f.nodes.code.value='123456';
 const verify=f.submit('code-form');f.cleanup();pending.resolve({user:{id:'test-user'}});await verify;
 assert.deepEqual(f.calls,[['request','person@example.com']]);assert.equal(f.nodes.code.value,'');assert.equal(f.timers.size,0);
});

test('a missing session cannot open the CRM',async()=>{
 const f=fixture({verifyCode:async()=>({})});
 try{
  f.nodes.address.value='person@example.com';await f.submit('address-form');f.nodes.code.value='123456';await f.submit('code-form');
  assert.deepEqual(f.calls,[['request','person@example.com']]);assert.match(f.nodes.error.textContent,/pas pu être finalisée/);
 }finally{f.cleanup();}
});

test('CRM load failure retries the authenticated session without consuming OTP again',async()=>{
 let resumes=0,verifications=0;
 const f=fixture({verifyCode:async()=>{verifications++;return {user:{id:'test-user'}};},onAuthenticated:async()=>{if(++resumes===1)throw Error('private database error');}});
 try{
  f.nodes.address.value='person@example.com';await f.submit('address-form');f.nodes.code.value='123456';await f.submit('code-form');
  assert.match(f.nodes.verify.textContent,/Ouvrir mon espace/);assert.equal(f.nodes.verify.disabled,false);assert.doesNotMatch(f.nodes.error.textContent,/private/);
  assert.equal(f.nodes.code.disabled,true);await f.submit('code-form');
  assert.equal(verifications,1);assert.equal(resumes,2);assert.equal(f.nodes.verify.disabled,true);
 }finally{f.cleanup();}
});
