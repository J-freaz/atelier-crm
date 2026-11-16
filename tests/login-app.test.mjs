import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Window} from 'npm:happy-dom@20.0.10';
import * as domain from '../domain.mjs';
import * as access from '../access.mjs';
import * as operiaDomain from '../operia-domain.mjs';
import * as operiaUI from '../operia-ui.mjs';
import * as workflow from '../operia-workflow.mjs';
import {emailLoginMarkup,bindEmailLogin} from '../login-ui.mjs';
const source=(await readFile(new URL('../app.mjs',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/^login\(\);$/m,'').replace(/^resumeGoogle\(\);$/m,'');
const dataset=(id='sales')=>({brands:[{id:'op',name:id==='demo'?'Démonstration fictive':'Espace privé fictif',profile:'operia'}],members:[{brand_id:'op',user_id:id,role:'commercial',display_name:'Utilisateur fictif'}],records:[],events:[]});
function setup(){
 const window=new Window({url:'https://crm.example.test/'}),document=window.document;document.body.innerHTML='<div id="app"></div><dialog id="editor"></dialog><div id="notice"></div>';
 const state={fail:null,pause:null,release:null,calls:[],codesRequested:0,codesVerified:0,google:0,googleFail:false};
 async function phase(name){state.calls.push(name);if(state.pause===name)await new Promise(resolve=>{state.release=resolve;});if(state.fail===name)throw Error('Fictive failure: '+name);}
 class RemoteStore{async session(){await phase('session');return {user:{id:'sales'}};}async request(path){assert.equal(path,'rpc/crm_claim_access');await phase('claim');return [];}async load(){await phase('load');return dataset();}async logout(){}}
 class DemoStore{constructor(){this.user={id:'demo'};}async load(){return dataset('demo');}async logout(){}}
 const dependencies={...domain,...access,...operiaDomain,...operiaUI,...workflow,e:domain.escapeHTML,document,FormData:window.FormData,AbortController:window.AbortController,location:window.location,history:window.history,config:{googleEnabled:true,emailOtpEnabled:true},setTimeout:()=>0,RemoteStore,DemoStore,
  googleSignIn:async()=>{state.google++;if(state.googleFail)throw Error('Google fictif indisponible');},
  emailLoginMarkup:()=>emailLoginMarkup({enabled:true,otpLength:6}),
  bindEmailLogin:options=>bindEmailLogin({...options,enabled:true,otpLength:6,requestCode:async()=>{state.codesRequested++;},verifyCode:async()=>{state.codesVerified++;return {user:{id:'sales'}};},setTimer:()=>1,clearTimer:()=>{}})};
 const app=new Function('dependencies',`const {${Object.keys(dependencies).join(',')}}=dependencies;${source}\nreturn {login,resumeAuthenticated,resumeGoogle,state:()=>({demo,user,brand,data,store})};`)(dependencies);app.login();
 const q=id=>document.getElementById(id),event=target=>({preventDefault(){},target});
 const request=async()=>{q('email-login-address').value='commercial@example.test';await q('email-login-address-form').onsubmit(event(q('email-login-address-form')));};
 const verify=()=>{q('email-login-code').value='123456';return q('email-login-code-form').onsubmit(event(q('email-login-code-form')));};
 return {app,state,document,q,request,verify,close:()=>window.happyDOM.close()};
}
for(const failure of ['claim','load'])test('app email login retries after '+failure+' failure without verifying the code twice',async()=>{
 const t=setup();try{
  t.state.fail=failure;await t.request();await t.verify();
  assert.ok(t.q('email-login'));assert.equal(t.app.state().user,undefined);assert.match(t.q('email-login-error').textContent,/Ouvrir mon espace/);assert.equal(t.q('email-login-verify').textContent,'Ouvrir mon espace');assert.equal(t.q('email-login-code').value,'');assert.equal(t.state.codesVerified,1);
  const oldAddress=t.q('email-login-address');t.state.fail=null;await t.q('email-login-code-form').onsubmit({preventDefault(){}});
  assert.equal(t.q('email-login'),null);assert.equal(t.app.state().user.id,'sales');assert.equal(t.state.codesVerified,1);assert.equal(t.state.codesRequested,1);assert.equal(oldAddress.value,'');assert.match(t.document.body.textContent,/ESPACE PRIVÉ/);
 }finally{await t.close();}
});
test('app keeps Google sign in and rebinds email login after a Google error',async()=>{
 const t=setup();try{
  t.state.googleFail=true;await t.q('google-login').onclick();assert.equal(t.state.google,1);assert.match(t.q('login-error').textContent,/Google fictif/);assert.ok(t.q('email-login-address-form').onsubmit);
  t.state.googleFail=false;await t.q('google-login').onclick();assert.equal(t.state.google,2);assert.equal(t.q('email-login-address-form').onsubmit,null);assert.equal(t.state.codesRequested,0);
 }finally{await t.close();}
});
test('app demo remains available and disposes an unused email challenge',async()=>{
 const t=setup();try{await t.request();const old=t.q('email-login-address-form');await t.q('demo').onclick();assert.equal(old.onsubmit,null);assert.equal(t.app.state().demo,true);assert.equal(t.app.state().user.id,'demo');assert.match(t.document.body.textContent,/MODE DÉMONSTRATION/);assert.equal(t.state.codesVerified,0);}finally{await t.close();}
});
for(const pending of ['claim','load'])test('late authenticated '+pending+' response cannot replace demo selected during login',async()=>{
 const t=setup();try{
  await t.request();t.state.pause=pending;const attempt=t.verify();for(let i=0;i<10&&!t.state.release;i++)await Promise.resolve();assert.ok(t.state.release);
  await t.q('demo').onclick();assert.equal(t.app.state().demo,true);t.state.pause=null;t.state.release();await attempt;
  assert.equal(t.app.state().demo,true);assert.equal(t.app.state().user.id,'demo');assert.match(t.document.body.textContent,/MODE DÉMONSTRATION/);
 }finally{await t.close();}
});
test('late automatic Google session cannot replace demo selected during startup',async()=>{
 const t=setup();try{
  t.state.pause='session';const resume=t.app.resumeGoogle();assert.ok(t.state.release);await t.q('demo').onclick();t.state.pause=null;t.state.release();await resume;
  assert.equal(t.app.state().demo,true);assert.equal(t.app.state().user.id,'demo');
 }finally{await t.close();}
});
test('a late duplicate authenticated callback cannot replace the latest completed attempt',async()=>{
 const t=setup();try{
  t.state.pause='load';const first=t.app.resumeAuthenticated();for(let i=0;i<10&&!t.state.release;i++)await Promise.resolve();assert.ok(t.state.release);
  const release=t.state.release;t.state.pause=null;await t.app.resumeAuthenticated();const latest=t.app.state();release();await first;
  assert.equal(t.app.state().store,latest.store);assert.equal(t.app.state().data,latest.data);assert.equal(t.app.state().user.id,'sales');assert.equal(t.app.state().demo,false);
 }finally{await t.close();}
});
