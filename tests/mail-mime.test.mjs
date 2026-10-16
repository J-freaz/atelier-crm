import test from 'node:test';import assert from 'node:assert/strict';
import {validateMessage,mimeMessage,receivedMessages} from '../functions/gmail-messages/mime.mjs';
const m={id:'00000000-0000-4000-8000-000000000001',recipient:'jeff91540@gmail.com',subject:'Été — Nanayé',body:'Bonjour à tous',attachment:'evjf-v2'};
test('MIME includes fixed commercial sender and a real PDF, no extra recipients',()=>{
 const pdf=new TextEncoder().encode('%PDF-1.4\ntest');const mime=Buffer.from(mimeMessage(m,pdf),'base64url').toString();
 assert.match(mime,/From: Nanaye <commercial.nanaye@gmail.com>/);assert.match(mime,/Content-Disposition: attachment/);assert.match(mime,/JVBERi0/);assert.doesNotMatch(mime,/\r\nBcc:/);assert.match(mime,/UTF-8/);
});
test('header injection, arbitrary attachments, malformed PDFs rejected',()=>{
 for(const x of [{recipient:'a@b.fr\r\nBcc:x@y.fr'},{subject:'Test\nBcc:x@y.fr'},{attachment:'https://private/file'}])assert.throws(()=>validateMessage({...m,...x}));
 assert.throws(()=>mimeMessage(m,new TextEncoder().encode('<html>error</html>')));
});
test('received snippets remain data and outgoing mail is distinguished',()=>{
 const rows=receivedMessages({id:'t',messages:[{id:'1',internalDate:'1700000000000',snippet:'<img onerror=bad>',payload:{headers:[{name:'From',value:'Nanayé <commercial.nanaye@gmail.com>'}]}},{id:'2',internalDate:'1700000000001',snippet:'Bonjour',payload:{headers:[{name:'From',value:'Client <client@example.org>'}]}}]});assert.equal(rows[0].direction,'outgoing');assert.equal(rows[1].direction,'incoming');assert.equal(rows[0].snippet,'<img onerror=bad>');
});
