// Temporary PostgreSQL-compatible engine; auth.uid is simulated, no cloud access.
// Run with PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node tests/draft-migration-check.mjs
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE);
const db=new PGlite();
const base=new URL('../',import.meta.url);
await db.exec(`create role service_role; create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
for(const file of ['database/001_crm.sql','database/002_brand_privileges.sql','supabase/migrations/20261015103321_saved_message_drafts.sql','supabase/migrations/20261015114828_gmail_connection.sql','supabase/migrations/20261015141516_gmail_messages.sql'])await db.exec(await readFile(new URL(file,base),'utf8'));
const owner='00000000-0000-4000-8000-000000000001',viewer='00000000-0000-4000-8000-000000000002',outsider='00000000-0000-4000-8000-000000000003',brand='db60e148-afb6-4870-9c8e-1c9330706f22',contact='00000000-0000-4000-8000-000000000005';
await db.exec(`insert into auth.users values('${owner}'),('${viewer}'),('${outsider}');insert into crm_brands(id,name) values('${brand}','Test');insert into crm_members(brand_id,user_id,display_name,role) values('${brand}','${owner}','Owner','owner'),('${brand}','${viewer}','Viewer','viewer');set request.jwt.claim.sub='${owner}';insert into crm_records(id,brand_id,kind,name,status) values('${contact}','${brand}','contact','Fictif','Repéré');set role authenticated;`);

await db.exec(`reset role;update crm_records set email='client@example.org' where id='${contact}';set role service_role;`);
const msg={recipient:'client@example.org',subject:'Sujet',body:'Contenu',test:false,contact_id:contact,content_hash:'x'.repeat(43)};
const rpc=async(op,payload={},actor=owner)=>(await db.query('select public.crm_mail_internal($1,$2,$3) as value',[op,actor,payload])).rows[0].value;
await assert.rejects(()=>rpc('prepare',msg,viewer),/Editor required/);
await assert.rejects(()=>rpc('prepare',{...msg,recipient:'other@example.org'}),/matching email/);
const one=await rpc('prepare',msg);assert.equal(one.actor_id,owner);assert.equal(one.actor_name,'Owner');
assert.equal((await rpc('prepare',msg)).id,one.id);
assert.ok(await rpc('claim',{id:one.id}));assert.equal(await rpc('claim',{id:one.id}),null);
await rpc('unknown',{id:one.id});assert.equal(await rpc('claim',{id:one.id}),null);
await db.exec(`reset role;update crm_records set status='Ne plus contacter' where id='${contact}';set role service_role;`);
await assert.rejects(()=>rpc('prepare',{...msg,content_hash:'y'.repeat(43)}),/Active contact/);
await assert.rejects(()=>rpc('receive',{messages:[{thread_id:'untracked'}]}),/Untracked thread/);
await assert.rejects(()=>rpc('prepare',{...msg,test:true,recipient:'other@example.org'}),/Invalid test/);
for(const [i,recipient] of ['jeff91540@gmail.com','nanayebylyne@gmail.com'].entries()){
 const t=await rpc('prepare',{...msg,test:true,contact_id:null,recipient,content_hash:String(i).repeat(43)});
 assert.equal(t.contact_id,null);await rpc('claim',{id:t.id});await rpc('sent',{id:t.id,gmail_id:'test'+i,thread_id:'testthread'+i});
 assert.equal((await rpc('threads',{test_id:t.id})).length,1);
 await rpc('receive',{messages:[{gmail_id:'reply'+i,thread_id:'testthread'+i,sender:recipient,subject:'Re: Test',snippet:'Test bien reçu',direction:'incoming',received_at:new Date().toISOString()}]});
 assert.equal((await rpc('test-history',{id:t.id})).length,1);
}
await db.exec(`reset role;set request.jwt.claim.sub='${outsider}';set role authenticated;`);
assert.equal((await db.query('select * from crm_mail_outbox')).rows.length,0);
await assert.rejects(()=>db.query("select public.crm_mail_internal('token',$1)",[owner]),/permission denied/);
await db.exec(`set request.jwt.claim.sub='${owner}';`);
assert.equal((await db.query('select * from crm_mail_outbox')).rows.length,3);
await assert.rejects(()=>db.query("update crm_mail_outbox set status='sent'"),/permission denied/);
await db.close();console.log('Mail SQL: isolation, attribution, matching recipient, idempotency, optout and RPC access passed.');
