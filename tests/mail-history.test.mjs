import test from 'node:test';
import assert from 'node:assert/strict';
import {gmailThreadUrl,historyRows} from '../mail-ui.mjs';
const row={id:'r',actor_id:'u',status:'prepared',subject:'<script>',body:'body',created_at:'2026-10-16'};
test('Gmail links target commercial mailbox and reject malformed identifiers',()=>{
 assert.match(gmailThreadUrl('19aabbcc1234'),/authuser=commercial.nanaye%40gmail.com#all\/19aabbcc1234$/);
 for(const id of [null,'','javascript:alert(1)','abc/../../','x" onclick='])assert.equal(gmailThreadUrl(id),null);
});
test('only author can archive an unsent preparation; sent and unknown stay protected',()=>{
 for(const status of ['sent','unknown','sending'])assert.doesNotMatch(historyRows({sent:[{...row,status}],received:[]},{canEdit:true,userId:'u'}),/data-mail-action/);
 assert.match(historyRows({sent:[row],received:[]},{canEdit:true,userId:'u'}),/Archiver la préparation/);
 assert.doesNotMatch(historyRows({sent:[row],received:[]},{canEdit:true,userId:'other'}),/data-mail-action/);
 assert.doesNotMatch(historyRows({sent:[row],received:[]},{canEdit:false,userId:'u'}),/data-mail-action/);
});
test('archived preparations have restore and received messages have Gmail links, HTML escaped',()=>{
 const html=historyRows({sent:[{...row,status:'archived'}],received:[{direction:'incoming',subject:'<img>',snippet:'<script>',thread_id:'19aabbcc1234'}]},{canEdit:true,userId:'u'});
 assert.match(html,/Préparations archivées \(1\)/);assert.match(html,/Restaurer/);assert.match(html,/Ouvrir cet échange/);assert.doesNotMatch(html,/<script>|<img>/);
});
