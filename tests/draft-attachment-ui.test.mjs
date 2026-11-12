import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'npm:happy-dom@20.0.10';
import {openProspectDraft} from '../draft-ui.mjs';
import {draftPayload} from '../message-drafts.mjs';
test('PDF selection survives editor close/reopen, unchecked removal and failed save',async()=>{
 const window=new Window();globalThis.Option=window.Option;globalThis.AbortController=window.AbortController;
 let saved={id:'draft',version:1,brand_id:'b',contact_id:'c',subject:'Objet',body:'Bonjour',signature:'Jefferson',recipient:'test@example.com',attach_evjf:false};let fail=false;let previewInput;
 const store={mail:async(operation,input)=>{assert.equal(operation,'prepare');previewInput=input;return {...input,id:'preview',status:'prepared',actor_name:'Jefferson'};},saveDraft:async input=>{if(fail)throw Error('offline');saved={...saved,...draftPayload(input),version:saved.version+1};return saved;}};
 const open=()=>{const dialog=window.document.createElement('dialog');window.document.body.append(dialog);dialog.open=true;openProspectDraft({dialog,record:{id:'c',brand_id:'b',name:'Test',email:'test@example.com'},brand:{name:'Nanayé'},members:[{brand_id:'b',user_id:'u',display_name:'Jefferson'}],user:{id:'u'},store,demo:false,canEdit:true,back:()=>{},savedDraft:structuredClone(saved),draftsEnabled:true,mailEnabled:true});return dialog;};
 let dialog=open();const q=id=>dialog.querySelector('#'+id);
 q('mail-attach').checked=true;q('mail-attach').onchange();await q('draft-save').onclick();q('draft-close').onclick();dialog=open();assert.equal(q('mail-attach').checked,true);
 q('mail-preview-content').innerHTML='<button>Ancienne confirmation</button>';q('mail-attach').checked=false;q('mail-attach').onchange();assert.equal(q('mail-preview-content').children.length,0);await q('draft-save').onclick();q('draft-close').onclick();dialog=open();assert.equal(q('mail-attach').checked,false);
 q('mail-attach').checked=true;await q('mail-preview').onclick();assert.equal(saved.attach_evjf,true);assert.equal(previewInput.attachment,'evjf-v2');q('draft-close').onclick();dialog=open();assert.equal(q('mail-attach').checked,true);
 q('mail-attach').checked=false;await q('draft-save').onclick();
 fail=true;q('mail-attach').checked=true;await q('mail-preview').onclick();assert.match(q('draft-error').textContent,/offline/);assert.equal(saved.attach_evjf,false);assert.equal(q('mail-preview-content').children.length,0);
 await window.happyDOM.close();
});
