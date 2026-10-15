import test from 'node:test';
import assert from 'node:assert/strict';
import {bindGmailPanel} from '../gmail-ui.mjs';
test('blocked popup offers a link and callback runs once with matching state',async()=>{
 const old={window:globalThis.window,document:globalThis.document,BroadcastChannel:globalThis.BroadcastChannel};
 const button={isConnected:true},label={},links={replaceChildren(){},append(link){this.link=link;}};let channel,calls=0;
 globalThis.document={querySelector:s=>({'#gmail-connect':button,'#gmail-status':label,'#gmail-open':links}[s]),createElement:()=>({})};
 globalThis.window={open:()=>null,addEventListener(){},removeEventListener(){}};
 globalThis.BroadcastChannel=class{constructor(){channel=this;}close(){}};
 try{
  bindGmailPanel({enabled:true,demo:false,owner:true,store:{gmail:async(action)=>{
   if(action==='status')return {configured:true,connected:false};
   if(action==='start')return {url:'https://accounts.google.com/o/oauth2/v2/auth',state:'test-state'};
   calls++;return {email:'commercial.nanaye@gmail.com'};
  }}});
  await button.onclick();assert.equal(links.link.target,'_blank');
  const callback=channel.onmessage;
  await callback({data:{type:'nanaye-gmail-oauth',state:'wrong',code:'code'}});assert.equal(calls,0);
  await callback({data:{type:'nanaye-gmail-oauth',state:'test-state',code:'code'}});
  await callback({data:{type:'nanaye-gmail-oauth',state:'test-state',code:'code'}});
  assert.equal(calls,1);assert.match(label.textContent,/Boîte autorisée/);
 }finally{Object.assign(globalThis,old);}
});
