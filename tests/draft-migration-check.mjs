// Temporary PostgreSQL-compatible engine; auth.uid is simulated, no cloud access.
// Run with PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node tests/draft-migration-check.mjs
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE);
const db=new PGlite();
const base=new URL('../',import.meta.url);
await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
for(const file of ['database/001_crm.sql','database/002_brand_privileges.sql','supabase/migrations/20261015103321_saved_message_drafts.sql'])await db.exec(await readFile(new URL(file,base),'utf8'));
const owner='00000000-0000-4000-8000-000000000001',viewer='00000000-0000-4000-8000-000000000002',outsider='00000000-0000-4000-8000-000000000003',brand='00000000-0000-4000-8000-000000000004',contact='00000000-0000-4000-8000-000000000005';
await db.exec(`insert into auth.users values('${owner}'),('${viewer}'),('${outsider}');insert into crm_brands(id,name) values('${brand}','Test');insert into crm_members(brand_id,user_id,display_name,role) values('${brand}','${owner}','Owner','owner'),('${brand}','${viewer}','Viewer','viewer');set request.jwt.claim.sub='${owner}';insert into crm_records(id,brand_id,kind,name,status) values('${contact}','${brand}','contact','Fictif','Repéré');set role authenticated;`);
const {rows:[draft]}=await db.query(`insert into crm_message_drafts(brand_id,contact_id,subject,body,signature,updated_by,created_by) values($1,$2,'Objet','Message','Lyne',$3,$3) returning *`,[brand,contact,outsider]);
assert.equal(draft.updated_by,owner);assert.equal(draft.created_by,owner);
await db.query(`update crm_message_drafts set body='Version deux',version=100,updated_by=$1 where id=$2 and version=1`,[outsider,draft.id]);
assert.equal((await db.query(`select version,updated_by from crm_message_drafts`)).rows[0].version,2);
assert.equal((await db.query(`update crm_message_drafts set body='Obsolete' where id=$1 and version=1 returning id`,[draft.id])).rows.length,0);
assert.equal((await db.query(`select actor_id from crm_events where action='Brouillon enregistré (aucun envoi)'`)).rows.length,2);
await db.exec(`set request.jwt.claim.sub='${viewer}'`);
assert.equal((await db.query('select * from crm_message_drafts')).rows.length,1);
assert.equal((await db.query("update crm_message_drafts set body='Forbidden' returning id")).rows.length,0);
await db.exec(`set request.jwt.claim.sub='${outsider}'`);
assert.equal((await db.query('select * from crm_message_drafts')).rows.length,0);
await assert.rejects(()=>db.query(`insert into crm_message_drafts(brand_id,contact_id,subject,body,signature) values($1,$2,'Obj','Body','Fake')`,[brand,contact]));
await db.exec(`set request.jwt.claim.sub='${owner}';update crm_records set status='Ne plus contacter' where id='${contact}';`);
await assert.rejects(()=>db.query("update crm_message_drafts set body='Forbidden optout'"),/Active contact required/);
await assert.rejects(()=>db.query('delete from crm_message_drafts'),/permission denied/);
await db.close();console.log('Migration checked: creation, actor integrity, version conflict, viewer/outsider isolation, opt-out and delete denial.');
