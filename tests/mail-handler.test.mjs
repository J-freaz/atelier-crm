import test from 'node:test';import assert from 'node:assert/strict';
import {createMailHandler} from '../functions/gmail-messages/handler.mjs';
import {encrypt,encryptionKey,validateConfig} from '../functions/gmail-connect/security.mjs';
const id='00000000-0000-4000-8000-000000000001';
const vars={SUPABASE_URL:'https://mock.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'server',NANAYE_GMAIL_CLIENT_ID:'client.apps.googleusercontent.com',NANAYE_GMAIL_CLIENT_SECRET:'test-secret',NANAYE_GMAIL_SEND_ENABLED:'true'};
const env=k=>vars[k];const c=validateConfig(env);const cipher=await encrypt('refresh-secret',await encryptionKey(c),c.brandId+':'+c.mailbox);
const req=x=>new Request('https://edge.test',{method:'POST',headers:{origin:'https://j-freaz.github.io',authorization:'Bearer valid'},body:JSON.stringify(x)});
function mock({failSend=false,deny=false}={}){let state='prepared',sends=0;const message={id,recipient:'jeff91540@gmail.com',subject:'Test',body:'Bonjour',attachment:null,status:state};return {get state(){return state},get sends(){return sends},fetcher:async(url,o={})=>{
 if(url.endsWith('/auth/v1/user'))return Response.json({id:'actor'});
 if(url.includes('/rpc/')){if(deny)return Response.json({}, {status:403});const x=JSON.parse(o.body);assert.equal(x.actor,'actor');switch(x.operation){case'token':return Response.json({cipher});case'get':return Response.json({...message,status:state});case'claim':if(state!=='prepared')return Response.json(null);state='sending';return Response.json(message);case'unknown':state='unknown';return Response.json({id,status:state});case'sent':state='sent';return Response.json({id,status:state});default:throw Error(x.operation);}}
 if(url.includes('oauth2.googleapis.com'))return Response.json({access_token:'access'});
 if(url.endsWith('/messages/send')){sends++;if(failSend)throw Error('network lost after acceptance');return Response.json({id:'g1',threadId:'t1'});}throw Error(url);
 }};}
test('send is one attempt and repeat request never sends twice',async()=>{const m=mock(),h=createMailHandler({env,fetcher:m.fetcher});assert.equal((await h(req({action:'send',id,confirm:true}))).status,200);await h(req({action:'send',id,confirm:true}));assert.equal(m.sends,1);assert.equal(m.state,'sent');});
test('ambiguous send stays unknown and cannot be retried automatically',async()=>{const m=mock({failSend:true}),h=createMailHandler({env,fetcher:m.fetcher});assert.equal((await h(req({action:'send',id,confirm:true}))).status,409);await h(req({action:'send',id,confirm:true}));assert.equal(m.sends,1);assert.equal(m.state,'unknown');});
test('read-only member and absent confirmation cannot send',async()=>{const m=mock({deny:true}),h=createMailHandler({env,fetcher:m.fetcher});assert.equal((await h(req({action:'send',id,confirm:true}))).status,400);assert.equal(m.sends,0);const n=mock();assert.equal((await createMailHandler({env,fetcher:n.fetcher})(req({action:'send',id}))).status,400);assert.equal(n.sends,0);});
test('archive and restore require CRM authentication but never access Gmail tokens',async()=>{
 for(const action of ['archive','restore']){
  const calls=[];const h=createMailHandler({env,fetcher:async(url,o)=>{calls.push(url);if(url.endsWith('/auth/v1/user'))return Response.json({id:'actor'});if(url.includes('/rpc/')){assert.equal(JSON.parse(o.body).operation,action);return Response.json({id,status:action==='archive'?'archived':'prepared'});}throw Error('Unexpected external access');}});
  assert.equal((await h(req({action,id}))).status,200);assert.equal(calls.length,2);
 }
});
