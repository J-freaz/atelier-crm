import {test} from 'node:test';
import assert from 'node:assert/strict';
import {brochureFor,contactContext,renderContactContext} from '../contact-context.mjs';
test('brochure belongs to brand identity, never to a matching display name',()=>{
 assert.equal(brochureFor({id:'other',name:'Nanayé'}),null);
 assert.ok(brochureFor({id:'demo-nanaye'}).pdf.endsWith('.pdf?v=2'));
});
test('contact history isolates brand and contact and includes linked records',()=>{
 const contact={id:'c',brand_id:'b',name:'Contact'};
 const records=[{id:'t',brand_id:'b',related_id:'c'},{id:'x',brand_id:'else',related_id:'c'},{id:'a',brand_id:'b',related_id:'c',archived:true}];
 const events=[{record_id:'c',brand_id:'b',created_at:'2026-01-01'},{record_id:'t',brand_id:'b',created_at:'2026-01-02'},{record_id:'c',brand_id:'else',created_at:'2026-01-03'}];
 const result=contactContext(contact,records,events);assert.deepEqual(result.related.map(r=>r.id),['t','a']);assert.deepEqual(result.events.map(r=>r.record_id),['t','c']);
 const html=renderContactContext(contact,[],[{...events[0],action:'<script>',actor_id:'u'}],()=>'<img>');assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img>'));
});
